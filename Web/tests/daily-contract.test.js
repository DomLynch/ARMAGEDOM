import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateDailyContract } from "../src/engine/game-data-daily-contract.js";
import { webText } from "../src/engine/web-text.js";
import {
  claimContractBonus,
  contractBonus,
  contractBonusReady,
  createDailyContract,
  dayOf,
  goalText,
  pickGoals,
  readProgress,
  runFigure,
  writeProgress,
} from "../src/engine/daily-contract.js";
import { createRunSummary, createRunTracker } from "../src/engine/run-summary.js";
import { PERKS, pickPerk, stepPerks } from "../src/engine/perks.js";

const RULES = GAME_DATA.dailyContract;
const KEY = RULES.storage.key;
const DAY = "2026-11-05";
const NEXT = "2026-11-06";
const at = (day, seconds = 0) => Date.parse(`${day}T00:00:00Z`) + seconds * 1000;
const raw = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/dailyContract.json", import.meta.url))));
const HOLLOW = RULES.hollowRig;

// A localStorage stand-in, a throwing one (private windows, blocked site data) and a read-only one.
const memory = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, String(v)) };
};
const throwing = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("quota");
  },
};

// Three goals whose answers are known: kill 3 hollows (total), 2 LMG kills (total), 120 seconds without a dodge (best).
function mini() {
  const rules = structuredClone(RULES),
    row = (id, tier, source, target, mode, weapon) => ({
      id,
      tier,
      source,
      target,
      mode,
      needs: "always",
      ...(weapon ? { weapon } : {}),
    });
  rules.goals = [
    row("k3", "easy", "hollows", 3, "total"),
    row("l2", "medium", "weapon", 2, "total", "lmg"),
    row("c2", "hard", "calm", 120, "best"),
  ];
  return rules;
}

const life = (extra = {}) => ({
  time: 0,
  kills: 0,
  finished: false,
  message: "",
  messageUntil: 0,
  player: { id: 0, hp: 100 },
  trashWave: null,
  heat: null,
  ...extra,
});
const mob = (extra = {}) => ({ rig: HOLLOW, ...extra });
const kill = (g, actor, extra = {}) => ({ type: "death", actor, ...extra });
const shotKill = (g, weapon, actor = mob()) => kill(g, actor, { weapon });
const dodge = (g) => ({ type: "dodge", actor: g.player });

// One frame of the loop: the step's events, then the tracker's and the contract's frame.
function rig(options = {}) {
  const tracker = createRunTracker(),
    clock = { now: at(DAY) },
    contract = createDailyContract({
      tracker,
      doc: null,
      store: memory(),
      rules: mini(),
      waves: () => false,
      now: () => clock.now,
      bonus: { earned: false, ready: false },
      ...options,
    }),
    g = options.g ?? life();
  const play = (seconds, events = [], kills = events.filter((e) => e.type === "death").length) => {
    g.time += seconds;
    g.kills += kills;
    clock.now += seconds * 1000;
    tracker.events(g, events);
    tracker.observe(g);
    contract.frame(g);
  };
  return { tracker, contract, clock, g, play };
}

// A page of just the ids the list uses.
function element() {
  const e = {
    hidden: false,
    textContent: "",
    className: "",
    children: [],
    attrs: {},
    vars: {},
    classes: new Set(),
    style: { setProperty: (k, v) => void (e.vars[k] = v) },
    classList: { toggle: (name, on) => (on ? e.classes.add(name) : e.classes.delete(name)) },
    setAttribute: (k, v) => void (e.attrs[k] = v),
    append: (...nodes) => e.children.push(...nodes),
    replaceChildren: (...nodes) => (e.children = nodes),
  };
  return e;
}
function page() {
  const nodes = Object.fromEntries(
    ["daily-heading", "daily-hint", "daily-list", "daily-bonus"].map((id) => [id, element()]),
  );
  nodes["daily-bonus"].hidden = true;
  return { nodes, getElementById: (id) => nodes[id] ?? null, createElement: () => element() };
}

test("data: the shipped pool validates, is registered, and bad pools are refused", () => {
  validateDailyContract(raw());
  assert.ok(Object.isFrozen(RULES), "frozen by the loader");
  assert.equal(GAME_DATA.dailyContract, RULES);
  const bad = (edit) => {
    const d = raw();
    edit(d);
    assert.throws(() => validateDailyContract(d));
  };
  bad((d) => (d.extra = 1));
  bad((d) => (d.goals[1].id = d.goals[0].id));
  bad((d) => (d.goals[0].tier = "brutal"));
  bad((d) => (d.goals[0].source = "magic"));
  bad((d) => (d.goals[0].mode = "sum"));
  bad((d) => (d.goals[0].target = 0));
  bad((d) => (d.goals[0].needs = "never"));
  bad((d) => (d.goals.find((g) => g.source === "weapon").weapon = "spoon"));
  bad((d) => (d.goals = d.goals.filter((g) => g.tier !== "hard")));
  bad((d) => (d.goals = d.goals.filter((g) => g.tier !== "easy" || g.needs === "waves" || g.source === "hollows")));
  bad((d) => (d.tiers = ["easy", "hard", "medium"]));
  bad((d) => (d.storage.key = "no spaces"));
  bad((d) => (d.dayCheckSeconds = 0));
});

test("data: every goal has words, and the pool covers the asked-for kinds", () => {
  for (const row of RULES.goals) {
    assert.match(goalText(row), /\d/, row.id);
    assert.ok(webText(`daily.tier.${row.tier}`), row.id);
  }
  const sources = new Set(RULES.goals.map((r) => r.source));
  for (const source of ["hollows", "time", "cleared", "elite", "calm", "weapon"])
    assert.ok(sources.has(source), source);
  const weapons = new Set(RULES.goals.filter((r) => r.source === "weapon").map((r) => r.weapon));
  for (const weapon of ["pistol", "rifle", "lmg", "knife"]) assert.ok(weapons.has(weapon), weapon);
  assert.deepEqual(
    RULES.goals.filter((r) => r.source === "hollows").map((r) => r.target),
    [15, 25, 40],
  );
  assert.deepEqual(
    RULES.goals.filter((r) => r.source === "time").map((r) => r.target / 60),
    [3, 5, 8],
  );
  assert.deepEqual(
    RULES.goals.filter((r) => r.source === "cleared").map((r) => r.target),
    [2, 4, 6],
  );
  assert.equal(goalText(RULES.goals.find((r) => r.id === "time-5")), "Survive 5 minutes in one run");
  assert.equal(goalText(RULES.goals.find((r) => r.id === "lmg-20")), "Kill 20 with the LMG");
});

test("the date key is the UTC date string", () => {
  assert.equal(dayOf(Date.parse("2026-11-05T23:59:59Z")), "2026-11-05");
  assert.equal(dayOf(Date.parse("2026-11-06T00:00:00Z")), "2026-11-06");
  assert.match(dayOf(), /^\d{4}-\d{2}-\d{2}$/);
});

test("selection: the same date always draws the same three goals, and never uses Math.random", () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error("Math.random is not allowed in the daily draw");
  };
  try {
    const first = pickGoals(DAY, false).map((r) => r.id);
    for (let i = 0; i < 5; i++)
      assert.deepEqual(
        pickGoals(DAY, false).map((r) => r.id),
        first,
      );
    assert.deepEqual(
      pickGoals(DAY, true).map((r) => r.id),
      pickGoals(DAY, true).map((r) => r.id),
    );
    const draws = new Set();
    for (let d = 0; d < 60; d++)
      draws.add(
        pickGoals(dayOf(at(DAY) + d * 86400000), false)
          .map((r) => r.id)
          .join(),
      );
    assert.ok(draws.size > 30, `different dates draw different sets (${draws.size})`);
  } finally {
    Math.random = random;
  }
});

test("selection: one easy, one medium and one hard goal from three different sources, every day", () => {
  const seen = new Set();
  for (let d = 0; d < 400; d++) {
    const day = dayOf(at(DAY) + d * 86400000);
    for (const wavesOn of [false, true]) {
      const goals = pickGoals(day, wavesOn);
      assert.deepEqual(
        goals.map((r) => r.tier),
        ["easy", "medium", "hard"],
        day,
      );
      assert.equal(new Set(goals.map((r) => r.source)).size, 3, `${day}: three different kinds`);
      for (const row of goals) seen.add(row.id);
    }
  }
  assert.equal(seen.size, RULES.goals.length, "every goal in the pool comes up");
});

test("selection: wave goals are offered only with the waves flag", () => {
  const off = new Set(),
    on = new Set();
  for (let d = 0; d < 400; d++) {
    const day = dayOf(at(DAY) + d * 86400000);
    for (const row of pickGoals(day, false)) off.add(row.source);
    for (const row of pickGoals(day, true)) on.add(row.source);
  }
  assert.equal(off.has("cleared"), false, "no wave goal without ?waves=1");
  assert.equal(on.has("cleared"), true, "wave goals appear with ?waves=1");
  const { contract } = rig({ rules: RULES, waves: () => false });
  assert.ok(contract.goals.every((r) => r.needs === "always"));
});

test("figures: each source reads its own tracker figure, counted from the start of the run", () => {
  const zero = { time: 0, cleared: 0, hollows: 0, elite: 0, dodges: 0, weapons: {} },
    now = { time: 125.9, cleared: 3, hollows: 7, elite: 2, dodges: 0, weapons: { pistol: 4, railgun: 6, knife: 1 } },
    row = (id) => RULES.goals.find((r) => r.id === id);
  assert.equal(runFigure(row("kills-15"), now, zero), 7);
  assert.equal(runFigure(row("time-3"), now, zero), 125);
  assert.equal(runFigure(row("waves-2"), now, zero), 3);
  assert.equal(runFigure(row("elite-1"), now, zero), 2);
  assert.equal(runFigure(row("pistol-3"), now, zero), 4);
  assert.equal(runFigure(row("lmg-20"), now, zero), 6, "the LMG is the railgun weapon id");
  assert.equal(runFigure(row("rifle-15"), now, zero), 0);
  assert.equal(runFigure(row("knife-10"), now, zero), 1);
  assert.equal(runFigure(row("calm-2"), now, zero), 125, "no dodge: the whole run counts");
  assert.equal(runFigure(row("calm-2"), { ...now, dodges: 1 }, zero), 0, "one dodge spoils the stretch");
  const from = { ...zero, time: 100, hollows: 5, weapons: { railgun: 6 } };
  assert.equal(runFigure(row("kills-15"), now, from), 2, "counted from where the date rolled over");
  assert.equal(runFigure(row("lmg-20"), now, from), 0);
  assert.equal(runFigure(row("time-3"), { ...zero, time: 50 }, from), 0, "never negative");
});

test("tracker events: the player's kills by weapon, hollows, elites and hunters, and the dodges", () => {
  const tracker = createRunTracker(),
    g = life(),
    me = g.player,
    fill = () => tracker.fill(g, {});
  tracker.events(g, [
    shotKill(g, "pistol"),
    shotKill(g, "pistol", mob({ elite: true })),
    shotKill(g, "railgun", mob({ markedHunter: true })),
    kill(g, mob(), { weapon: "knife", attackerId: me.id }),
    kill(g, mob(), { weapon: "knife", attackerId: 7 }), // an enemy's kill is not the player's
    kill(g, { rig: "original-rat" }, { weapon: "knife", attackerId: me.id }), // an animal, not a hollow
    kill(g, mob({ bossProfile: {} }), { weapon: "rifle" }), // a boss is not a hollow
    kill(g, mob()), // a trap or a fire: no weapon, still a hollow down
    { type: "death", actor: me },
    dodge(g),
    { type: "dodge", actor: mob() },
    { type: "hit", actor: mob(), weapon: "pistol" },
  ]);
  const f = fill();
  assert.equal(f.hollows, 5);
  assert.equal(f.elite, 2);
  assert.equal(f.dodges, 1);
  assert.deepEqual(f.weapons, { pistol: 2, railgun: 1, knife: 2, rifle: 1 });
  assert.equal(fill().kills, 0);
  const retry = life();
  tracker.events(retry, [shotKill(retry, "pistol")]); // a new game object is a new life: the tally starts again
  const again = tracker.fill(retry, {});
  assert.deepEqual([again.hollows, again.dodges, again.weapons], [1, 0, { pistol: 1 }]);
});

test("progress: totals add up over kills, bests keep the best run, and each goal completes once with a notice", () => {
  const { contract, g, play, tracker } = rig();
  play(1, [shotKill(g, "pistol"), shotKill(g, "pistol")]);
  assert.equal(contract.record.value.k3, 2);
  assert.equal(g.message, "", "no notice before a goal completes");
  play(1, [shotKill(g, "railgun")]);
  assert.equal(contract.record.done.k3, true);
  assert.equal(g.message, webText("daily.done", { goal: "Kill 3 hollows" }));
  assert.equal(g.messageUntil, g.time + RULES.messageSeconds);
  assert.equal(contract.record.value.l2, 1);
  g.message = "";
  play(1, [shotKill(g, "pistol")]);
  assert.equal(g.message, "", "a finished goal says nothing again");
  assert.equal(contract.record.value.k3, 3, "and stays at its target");
  assert.equal(contract.record.done.c2, undefined);
  play(9);
  assert.equal(contract.record.value.c2, 12, "calm counts the seconds survived without a dodge");
  play(1, [dodge(g)]);
  play(2);
  assert.equal(contract.record.value.c2, 12, "a best goal never goes back when the stretch is spoiled");
  assert.equal(tracker.fill(g, {}).dodges, 1);
  play(1, [shotKill(g, "railgun")]);
  assert.equal(contract.record.done.l2, true);
  assert.equal(g.message, webText("daily.done", { goal: "Kill 2 with the LMG" }));
  assert.equal(contract.record.done.c2, undefined);
});

test("progress: a new life carries the day's totals on and starts the best figures again", () => {
  const a = rig();
  a.play(2, [shotKill(a.g, "pistol"), shotKill(a.g, "pistol")]);
  a.play(8);
  assert.equal(a.contract.record.value.k3, 2);
  assert.equal(a.contract.record.value.c2, 10);
  a.g.finished = true;
  a.g.player.hp = 0;
  a.contract.frame(a.g);
  const retry = life({ time: 4, kills: 1 }); // the next life: a new game object
  a.tracker.events(retry, [shotKill(retry, "pistol")]);
  a.tracker.observe(retry);
  a.contract.frame(retry);
  assert.equal(a.contract.record.value.k3, 3, "two before the death and one after it");
  assert.equal(a.contract.record.done.k3, true);
  assert.equal(a.contract.record.value.c2, 10, "the earlier run was longer, so its best stands");
  retry.time = 130;
  a.tracker.observe(retry);
  a.contract.frame(retry);
  assert.equal(a.contract.record.value.c2, 120, "a longer stretch in the new life raises it, up to the target");
});

test("persistence: the record is namespaced, versioned and dated, and a reload picks it up without a second notice", () => {
  const store = memory(),
    a = rig({ store });
  a.play(1, [shotKill(a.g, "pistol"), shotKill(a.g, "pistol"), shotKill(a.g, "pistol")]);
  assert.deepEqual(JSON.parse(store.map.get(KEY)), {
    v: RULES.storage.version,
    day: DAY,
    value: { k3: 3, c2: 1 },
    done: { k3: true },
  });
  const b = rig({ store });
  assert.equal(b.contract.record.done.k3, true, "restored");
  assert.equal(b.contract.record.value.c2, 1);
  b.play(1, [shotKill(b.g, "pistol")]);
  assert.equal(b.g.message, "", "no notice for a goal finished before the reload");
  b.play(1, [shotKill(b.g, "railgun"), shotKill(b.g, "railgun")]);
  assert.equal(b.contract.record.done.l2, true);
  assert.equal(JSON.parse(store.map.get(KEY)).done.l2, true);
});

test("date rollover: the date is re-read while playing, then new goals and an empty record take over", () => {
  const store = memory(),
    a = rig({ store, rules: RULES });
  assert.deepEqual(
    a.contract.goals.map((r) => r.id),
    pickGoals(DAY, false).map((r) => r.id),
  );
  assert.notDeepEqual(
    pickGoals(DAY, false).map((r) => r.id),
    pickGoals(NEXT, false).map((r) => r.id),
  );
  a.contract.record.done[a.contract.goals[0].id] = true; // a goal done on day one
  a.clock.now = at(NEXT, 1);
  a.play(0);
  assert.deepEqual(
    a.contract.goals.map((r) => r.id),
    pickGoals(NEXT, false).map((r) => r.id),
  );
  assert.deepEqual(a.contract.record, { value: {}, done: {} }, "the new date starts with nothing done");
});

test("date rollover: kills made before midnight do not count after it, and a record from another date is ignored", () => {
  const store = memory(),
    a = rig({ store });
  a.play(1, [shotKill(a.g, "pistol"), shotKill(a.g, "pistol")]);
  assert.equal(a.contract.record.value.k3, 2);
  assert.equal(JSON.parse(store.map.get(KEY)).day, DAY);
  a.clock.now = at(NEXT, 1);
  a.play(0);
  assert.deepEqual(a.contract.record, { value: {}, done: {} });
  a.play(1, [shotKill(a.g, "pistol")]);
  assert.equal(a.contract.record.value.k3, 1, "only the kill after the rollover counts");
  assert.equal(a.contract.record.done.k3, undefined);
  const saved = JSON.parse(store.map.get(KEY));
  assert.equal(saved.day, NEXT);
  assert.equal(saved.value.k3, 1);
  assert.deepEqual(readProgress(store, DAY), { value: {}, done: {} }, "yesterday's record is gone, not carried over");
  const old = JSON.stringify({ v: RULES.storage.version, day: "2020-01-01", value: { k3: 3 }, done: { k3: true } }),
    b = rig({ store: memory({ [KEY]: old }) });
  assert.deepEqual(b.contract.record, { value: {}, done: {} }, "an old date is ignored");
});

test("date rollover: waves on draw from the bigger pool for the new date", () => {
  const a = rig({ rules: RULES, waves: () => true });
  assert.deepEqual(
    a.contract.goals.map((r) => r.id),
    pickGoals(DAY, true).map((r) => r.id),
  );
});

test("storage: unreadable, foreign or damaged records give empty progress; throwing or absent storage never throws out", () => {
  const record = (extra) => JSON.stringify({ v: RULES.storage.version, day: DAY, ...extra });
  assert.deepEqual(readProgress(memory(), DAY), { value: {}, done: {} });
  assert.deepEqual(readProgress(memory({ [KEY]: "{not json" }), DAY), { value: {}, done: {} });
  assert.deepEqual(readProgress(memory({ [KEY]: "null" }), DAY), { value: {}, done: {} });
  const another = JSON.stringify({ v: RULES.storage.version + 1, day: DAY, value: { "kills-15": 4 } });
  assert.deepEqual(readProgress(memory({ [KEY]: another }), DAY), { value: {}, done: {} }, "another version");
  const odd = record({
    value: { "kills-15": 4.9, "time-3": -2, "calm-2": "x", nope: 5, "elite-1": null },
    done: { "kills-15": true, "time-3": 1, nope: true },
  });
  assert.deepEqual(
    readProgress(memory({ [KEY]: odd }), DAY),
    { value: { "kills-15": 4 }, done: { "kills-15": true } },
    "known goals, whole non-negative numbers and true flags only",
  );
  assert.deepEqual(readProgress(throwing, DAY), { value: {}, done: {} });
  assert.deepEqual(readProgress(null, DAY), { value: {}, done: {} });
  assert.deepEqual(readProgress(undefined, DAY), { value: {}, done: {} });
  assert.equal(writeProgress(throwing, DAY, { value: {}, done: {} }), false);
  assert.equal(writeProgress(null, DAY, { value: {}, done: {} }), false);
  assert.equal(writeProgress(memory(), DAY, { value: {}, done: {} }), true);
  for (const store of [throwing, null]) {
    const a = rig({ store });
    a.play(1, [shotKill(a.g, "pistol"), shotKill(a.g, "pistol"), shotKill(a.g, "pistol")]);
    assert.equal(a.contract.record.done.k3, true, "tracking still works in memory");
    assert.equal(a.g.message, webText("daily.done", { goal: "Kill 3 hollows" }));
  }
  const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  try {
    const tracker = createRunTracker(),
      contract = createDailyContract({ tracker, doc: null, rules: mini(), waves: () => false, now: () => at(DAY) }),
      g = life();
    tracker.observe(g);
    assert.doesNotThrow(() => contract.frame(g), "a localStorage getter that throws");
  } finally {
    if (own) Object.defineProperty(globalThis, "localStorage", own);
    else delete globalThis.localStorage;
  }
});

test("the list: three pooled rows with a progress bar and a check mark, repainted only when something changed", () => {
  const doc = page(),
    a = rig({ doc });
  const list = doc.nodes["daily-list"];
  assert.equal(doc.nodes["daily-heading"].textContent, "Daily contract");
  assert.equal(list.children.length, 3, "one row per tier");
  const rows = list.children.slice();
  const text = (row) => row.children.map((c) => c.textContent);
  assert.deepEqual(text(rows[0]).slice(0, 2), ["Easy", "Kill 3 hollows"]);
  assert.deepEqual(text(rows[2]).slice(0, 2), ["Hard", "Survive 2 minutes without dodging"]);
  assert.equal(rows[0].children[3].textContent, "0 / 3");
  assert.equal(rows[2].children[3].textContent, "0:00 / 2:00");
  assert.equal(rows[0].children[2].textContent, "", "no check yet");
  a.play(1, [shotKill(a.g, "pistol")]);
  assert.equal(rows[0].children[3].textContent, "1 / 3");
  assert.equal(rows[0].children[4].children[0].vars["--p"], String(1 / 3));
  assert.equal(rows[0].children[4].attrs.role, "progressbar");
  assert.equal(rows[0].children[4].attrs["aria-valuenow"], "1");
  a.play(1, [shotKill(a.g, "pistol"), shotKill(a.g, "pistol")]);
  assert.equal(rows[0].children[2].textContent, "✓");
  assert.equal(rows[0].classes.has("dc-done"), true);
  assert.equal(rows[0].children[4].children[0].vars["--p"], "1");
  assert.equal(list.children.length, 3, "rows are reused, not rebuilt");
  assert.equal(doc.nodes["daily-bonus"].hidden, true);
});

test("a page without the list still tracks", () => {
  const a = rig({ doc: { getElementById: () => null, createElement: element } });
  a.play(1, [shotKill(a.g, "pistol"), shotKill(a.g, "pistol"), shotKill(a.g, "pistol")]);
  assert.equal(a.contract.record.done.k3, true);
});

test("Contract bonus: clearing all three sets it once, the final notice says so, the title shows only without the waves", () => {
  const bonus = { earned: false, ready: false };
  let wavesOn = false;
  const doc = page(),
    a = rig({ bonus, doc, waves: () => wavesOn });
  assert.equal(a.contract.title(), "");
  a.play(1, [shotKill(a.g, "railgun"), shotKill(a.g, "railgun"), shotKill(a.g, "pistol")]);
  assert.equal(bonus.earned, false, "two of three is not enough");
  a.play(120);
  assert.equal(a.contract.record.done.c2, true);
  assert.equal(bonus.earned, true);
  assert.equal(bonus.ready, true);
  assert.equal(a.g.message, webText("daily.all"));
  assert.equal(a.contract.title(), "Daily contract cleared", "waves off: a title line");
  assert.equal(doc.nodes["daily-bonus"].hidden, false);
  assert.equal(doc.nodes["daily-bonus"].textContent, webText("daily.bonusTitle"));
  wavesOn = true;
  assert.equal(a.contract.title(), "", "waves on: the bonus is a perk pick, not a title");
  assert.equal(contractBonusReady(bonus), true);
  a.play(1);
  assert.equal(doc.nodes["daily-bonus"].textContent, webText("daily.bonusPerk"), "waves on: the perk is waiting");
  assert.equal(claimContractBonus(bonus), true);
  assert.equal(claimContractBonus(bonus), false, "taken once");
  a.play(1);
  assert.equal(doc.nodes["daily-bonus"].textContent, webText("daily.bonusUsed"), "and the line follows it");
  assert.equal(bonus.earned, true, "still earned for the session");
});

test("Contract bonus: goals finished in an earlier session do not give it again after a reload", () => {
  const store = memory(),
    first = rig({ store, bonus: { earned: false, ready: false } });
  first.play(1, [shotKill(first.g, "railgun"), shotKill(first.g, "railgun"), shotKill(first.g, "pistol")]);
  first.play(120);
  const bonus = { earned: false, ready: false },
    later = rig({ store, bonus });
  later.play(1);
  assert.equal(bonus.earned, false, "the bonus is session-only");
  assert.equal(later.contract.title(), "");
});

test("run summary card: the cleared line is a cosmetic title above the heading, empty until earned", () => {
  const card = element(),
    make = () => element(),
    doc = { getElementById: (id) => (id === "run-summary" ? card : null), createElement: make };
  let line = "";
  const tracker = createRunTracker(),
    summary = createRunSummary({ tracker, doc, store: memory(), waves: () => false, title: () => line }),
    g = life();
  tracker.observe(g);
  g.finished = true;
  g.player.hp = 0;
  summary.frame(g);
  const crown = card.children[3];
  assert.equal(crown.className, "rs-crown");
  assert.equal(crown.hidden, true);
  summary.dispose();
  line = webText("daily.bonusTitle");
  const g2 = life();
  tracker.observe(g2);
  g2.finished = true;
  g2.player.hp = 0;
  summary.frame(g2);
  assert.equal(crown.textContent, "Daily contract cleared");
  assert.equal(crown.hidden, false);
});

test("perks: with the bonus ready, the first pick is followed by one free extra offer; without it nothing changes", () => {
  const ON = "?waves=1",
    EVERY = PERKS.everyWaves,
    g = () => ({
      time: 0,
      finished: false,
      message: "",
      messageUntil: 0,
      player: { hp: 60, maxHP: 100, staminaRegen: 1 },
    }),
    open = (game) => stepPerks(game, EVERY * ((game.perks?.granted ?? 0) + 1), 0, PERKS, ON);
  const bonus = contractBonus();
  assert.deepEqual({ ...bonus }, { earned: false, ready: false }, "nothing earned in this test process");
  try {
    const plain = g();
    open(plain);
    const first = plain.perks.offer;
    assert.equal(first.bonus, false);
    assert.equal(pickPerk(plain, first.ids[0]), true);
    assert.equal(plain.perks.offer, null, "no bonus: one pick, no extra offer");

    bonus.ready = true;
    bonus.earned = true;
    const game = g();
    open(game);
    const offer = game.perks.offer;
    assert.equal(pickPerk(game, offer.ids[0]), true);
    const extra = game.perks.offer;
    assert.ok(extra, "an extra offer opens at once");
    assert.equal(extra.bonus, true);
    assert.equal(extra.ids.length, PERKS.choices);
    assert.equal(bonus.ready, false, "taken");
    assert.equal(pickPerk(game, extra.ids[0]), true);
    assert.equal(game.perks.offer, null, "and only one extra");
    assert.equal(
      Object.values(game.perks.picks).reduce((n, v) => n + v, 0),
      2,
    );
    open(game);
    assert.equal(game.perks.offer.bonus, false, "the next wave-clear offer is an ordinary one");
  } finally {
    bonus.ready = bonus.earned = false;
  }
});
