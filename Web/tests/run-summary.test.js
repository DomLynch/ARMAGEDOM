import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateRunSummary } from "../src/engine/game-data-run-summary.js";
import { webText } from "../src/engine/web-text.js";
import {
  createRunSummary,
  createRunTracker,
  defaultStorage,
  describeGoal,
  describeRow,
  evaluate,
  formatStat,
  mergeBest,
  readBest,
  writeBest,
} from "../src/engine/run-summary.js";

const RULES = GAME_DATA.runSummary;
const KEY = RULES.storage.key;
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/runSummary.json", import.meta.url))));

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
const saved = (best, v = RULES.storage.version) => JSON.stringify({ v, best });

function element(tag = "div") {
  const e = {
    tag,
    hidden: false,
    textContent: "",
    className: "",
    children: [],
    classes: new Set(),
    classList: { toggle: (name, on) => (on ? e.classes.add(name) : e.classes.delete(name)) },
    append: (...nodes) => e.children.push(...nodes),
    replaceChildren: (...nodes) => (e.children = nodes),
  };
  return e;
}
function page() {
  const card = element();
  card.hidden = true;
  return { card, getElementById: (id) => (id === "run-summary" ? card : null), createElement: element };
}
const alive = (extra = {}) => ({
  time: 0,
  kills: 0,
  finished: false,
  player: { hp: 100 },
  trashWave: null,
  heat: null,
  ...extra,
});
const die = (g) => {
  g.finished = true;
  g.player.hp = 0;
  g.trashWave = null; // combat clears the wave state on the death step
  return g;
};
const rowsOf = (card) => card.children[1].children.filter((li) => !li.hidden);
const cellText = (li) => ({
  label: li.children[0].textContent,
  value: li.children[1].textContent,
  tag: li.children[2].children[0],
  words: li.children[2].children[1].textContent,
});
const always = (s) => s.needs === "always";
const everything = () => true;

test("data: the shipped rows validate and a bad row is refused", () => {
  validateRunSummary(raw());
  const bad = (edit) => {
    const d = raw();
    edit(d);
    assert.throws(() => validateRunSummary(d));
  };
  bad((d) => (d.stats[0].format = "hex"));
  bad((d) => (d.stats[1].id = d.stats[0].id));
  bad((d) => (d.stats[0].needs = "never"));
  bad((d) => (d.storage.key = "no spaces allowed"));
  bad((d) => (d.extra = 1));
  assert.ok(
    RULES.stats.every((s) => webText(`summary.label.${s.id}`)),
    "every row has a label in webText.json",
  );
});

test("time reads as m:ss and a count as a plain number", () => {
  assert.equal(formatStat("time", 0), "0:00");
  assert.equal(formatStat("time", 65.9), "1:05");
  assert.equal(formatStat("time", 600), "10:00");
  assert.equal(formatStat("count", 42), "42");
});

test("personal bests: written, read back, and unreadable records are ignored", () => {
  const store = memory();
  assert.deepEqual(readBest(store), {}, "nothing stored yet");
  assert.equal(writeBest(store, { kills: 12, time: 90 }), true);
  assert.deepEqual(
    JSON.parse(store.map.get(KEY)),
    { v: RULES.storage.version, best: { kills: 12, time: 90 } },
    "namespaced and versioned",
  );
  assert.deepEqual(readBest(store), { kills: 12, time: 90 });
  assert.deepEqual(readBest(memory({ [KEY]: "{not json" })), {}, "damaged JSON");
  assert.deepEqual(readBest(memory({ [KEY]: saved({ kills: 9 }, RULES.storage.version + 1) })), {}, "another version");
  assert.deepEqual(
    readBest(memory({ [KEY]: saved({ kills: -3, time: "x", heat: Infinity, wave: 4, nope: 7 }) })),
    { wave: 4 },
    "only counts of known stats",
  );
  assert.deepEqual(readBest(memory({ [KEY]: "null" })), {});
  assert.deepEqual(readBest(null), {});
});

test("storage that throws never throws out: reads give no bests, writes say no", () => {
  assert.deepEqual(readBest(throwing), {});
  assert.equal(writeBest(throwing, { kills: 1 }), false);
  assert.equal(writeBest(null, { kills: 1 }), false);
  const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  try {
    assert.equal(defaultStorage(), null, "even the getter can throw");
  } finally {
    if (own) Object.defineProperty(globalThis, "localStorage", own);
    else delete globalThis.localStorage;
  }
});

test("evaluate: first record, new best, tie, short and nothing", () => {
  const values = { time: 80, kills: 14, heat: 0 };
  const r = evaluate(values, { time: 60, kills: 22 }, (s) => s.id !== "cleared" && s.needs !== "waves", RULES);
  const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert.equal(by.time.state, "new");
  assert.equal(by.kills.state, "short");
  assert.equal(by.kills.gap, 8);
  assert.equal(by.heat.state, "none", "a zero with no best to compare");
  assert.equal(r.goal.id, "kills");
  const first = evaluate({ time: 5, kills: 0 }, {}, always, RULES);
  assert.deepEqual(
    first.rows.map((x) => x.state),
    ["first", "none"],
  );
  assert.equal(first.goal, null);
  const tie = evaluate({ time: 60, kills: 22 }, { time: 60, kills: 22 }, always, RULES);
  assert.deepEqual(
    tie.rows.map((x) => x.state),
    ["tie", "tie"],
  );
  assert.equal(tie.goal.gap, 0);
  assert.equal(evaluate({ time: 9.99 }, {}, always, RULES).rows[0].value, 9, "whole seconds");
});

test("the goal is the stat nearest to its best, by the share of the best still missing", () => {
  const r = evaluate({ time: 50, kills: 14 }, { time: 60, kills: 22 }, always, RULES);
  assert.equal(r.goal.id, "time", "10 of 60 is nearer than 8 of 22");
  const r2 = evaluate({ time: 10, kills: 21 }, { time: 60, kills: 22 }, always, RULES);
  assert.equal(r2.goal.id, "kills", "one kill short beats 50 seconds short");
});

test("near-miss lines: every row below its best says how far, and the goal says how many more beat it", () => {
  const r = evaluate({ time: 50, kills: 14 }, { time: 60, kills: 22 }, always, RULES);
  const kills = describeRow(r.rows[1]);
  assert.equal(kills.note, "Best 22 · 8 short");
  assert.equal(kills.tag, "");
  assert.equal(describeRow(r.rows[0]).note, "Best 1:00 · 0:10 short", "times keep m:ss");
  assert.equal(describeGoal(r), "Next goal: survive 11 more seconds to beat your best.");
  const kg = describeGoal(evaluate({ kills: 14 }, { kills: 22 }, (s) => s.id === "kills", RULES));
  assert.equal(kg, "Next goal: 9 more kills to beat your best.", "beating 22 takes 23");
  const one = describeGoal(evaluate({ kills: 22 }, { kills: 22 }, (s) => s.id === "kills", RULES));
  assert.equal(one, "Next goal: one more kill to beat your best.", "singular");
  const wave = describeGoal(evaluate({ wave: 3 }, { wave: 7 }, (s) => s.id === "wave", RULES));
  assert.equal(wave, "Next goal: reach wave 8 to beat your best.");
});

test("a beaten best carries the NEW BEST tag and what it replaced; a first run says first record", () => {
  const r = evaluate({ time: 90, kills: 3 }, { time: 60 }, always, RULES);
  const time = describeRow(r.rows[0]);
  assert.equal(time.tag, "NEW BEST");
  assert.equal(time.note, "was 1:00");
  const kills = describeRow(r.rows[1]);
  assert.equal(kills.tag, "FIRST RECORD");
  assert.equal(describeRow(evaluate({ kills: 22 }, { kills: 22 }, always, RULES).rows[1]).note, "Ties your best");
  assert.equal(
    describeGoal(evaluate({ time: 90 }, { time: 60 }, always, RULES)),
    "Every record beaten. Beat them again next run.",
  );
  assert.equal(describeGoal(evaluate({ time: 90 }, {}, always, RULES)), "Records set. Beat them next run.");
  assert.deepEqual(
    mergeBest({ time: 100, kills: 5 }, evaluate({ time: 90, kills: 8 }, { time: 100, kills: 5 }, always, RULES)),
    { time: 100, kills: 8 },
  );
});

test("tracker: kills count from where the life began, wave counters fold across an area change, heat keeps its peak", () => {
  const t = createRunTracker();
  const g = alive({ kills: 5, time: 1 });
  t.observe(g);
  g.kills = 12;
  g.time = 70;
  const w = (g.trashWave = { wave: 2, cleared: 1, score: 150 });
  g.heat = { count: 3 };
  t.observe(g);
  g.heat = { count: 7 };
  t.observe(g);
  g.heat = { count: 2 };
  Object.assign(w, { wave: 3, cleared: 2, score: 330 }); // the same state object, updated in place as the director does
  t.observe(g);
  assert.equal(t.cleared(), 2);
  const next = (g.trashWave = { wave: 1, cleared: 0, score: 0 }); // a new area: the state is replaced, so the old counters fold in
  t.observe(g);
  Object.assign(next, { cleared: 1, score: 110 });
  t.observe(g);
  assert.equal(t.cleared(), 3, "2 from before the area change and 1 now");
  die(g);
  t.observe(g);
  assert.deepEqual(t.snapshot(g), { time: 70, kills: 7, cleared: 3, wave: 3, score: 440, heat: 7, hasHeat: true });
  const fresh = alive({ kills: 0 });
  t.observe(fresh);
  assert.deepEqual(
    t.snapshot(fresh),
    { time: 0, kills: 0, cleared: 0, wave: 0, score: 0, heat: 0, hasHeat: false },
    "a retry is a new life",
  );
});

function scene({ store = memory(), waves = () => false } = {}) {
  const doc = page(),
    tracker = createRunTracker(),
    summary = createRunSummary({ tracker, doc, store, waves });
  const frame = (g) => {
    tracker.observe(g);
    summary.frame(g);
  };
  return { doc, store, tracker, summary, frame };
}

test("the card is hidden in play, appears on death with the figures, and hides again on the next life", () => {
  const s = scene();
  const g = alive();
  s.frame(g);
  assert.equal(s.doc.card.hidden, true);
  g.kills = 14;
  g.time = 83;
  s.frame(g);
  die(g);
  s.frame(g);
  assert.equal(s.doc.card.hidden, false);
  const rows = rowsOf(s.doc.card).map(cellText);
  assert.deepEqual(
    rows.map((r) => [r.label, r.value]),
    [
      ["Time survived", "1:23"],
      ["Kills", "14"],
    ],
    "no wave or heat rows with neither on",
  );
  assert.equal(rows[0].tag.textContent, "FIRST RECORD");
  assert.equal(s.doc.card.children[2].textContent, "Records set. Beat them next run.");
  s.frame(alive());
  assert.equal(s.doc.card.hidden, true, "the next game starts clean");
});

test("bests are kept between lives: a closer run shows how close, a better one shows NEW BEST", () => {
  const store = memory();
  const life = (kills, time, waves = () => false, fix = (g) => g) => {
    const s = scene({ store, waves });
    const g = alive();
    s.frame(g);
    g.kills = kills;
    g.time = time;
    fix(g);
    s.frame(g);
    die(g);
    s.frame(g);
    return s;
  };
  life(22, 120);
  assert.deepEqual(readBest(store), { time: 120, kills: 22 });
  const second = life(14, 100);
  const rows = rowsOf(second.doc.card).map(cellText);
  assert.equal(rows[1].words, "Best 22 · 8 short");
  assert.equal(rows[1].tag.hidden, true);
  assert.equal(
    second.doc.card.children[2].textContent,
    "Next goal: survive 21 more seconds to beat your best.",
    "20 of 120 is nearer than 8 of 22",
  );
  assert.deepEqual(readBest(store), { time: 120, kills: 22 }, "a worse life changes nothing");
  const third = life(30, 100);
  const rows3 = rowsOf(third.doc.card).map(cellText);
  assert.equal(rows3[1].tag.textContent, "NEW BEST");
  assert.equal(rows3[1].words, "was 22");
  assert.equal(third.doc.card.children[1].children[1].classes.has("rs-new"), true);
  assert.deepEqual(readBest(store), { time: 120, kills: 30 });
});

test("with the waves on the wave rows join; with heat seen the heat row joins", () => {
  const store = memory();
  const s = scene({ store, waves: () => true });
  const g = alive();
  s.frame(g);
  g.trashWave = { wave: 4, cleared: 3, score: 480 };
  g.heat = { count: 5 };
  g.kills = 20;
  g.time = 200;
  s.frame(g);
  die(g);
  s.frame(g);
  const rows = rowsOf(s.doc.card).map(cellText);
  assert.deepEqual(
    rows.map((r) => [r.label, r.value]),
    [
      ["Time survived", "3:20"],
      ["Kills", "20"],
      ["Waves cleared", "3"],
      ["Best wave", "4"],
      ["Wave score", "480"],
      ["Heat peak", "5"],
    ],
  );
  assert.deepEqual(readBest(store), { time: 200, kills: 20, cleared: 3, wave: 4, score: 480, heat: 5 });
});

test("storage that throws still shows the card and never crashes the loop", () => {
  const s = scene({ store: throwing });
  const g = alive({ kills: 3, time: 40 });
  s.frame(g);
  die(g);
  s.frame(g);
  assert.equal(s.doc.card.hidden, false);
  assert.equal(rowsOf(s.doc.card).length, 2);
  const none = scene({ store: null });
  const h = alive({ kills: 1, time: 5 });
  none.frame(h);
  die(h);
  none.frame(h);
  assert.equal(none.doc.card.hidden, false, "no storage at all");
});

test("an unreadable saved run is not a life: no card", () => {
  const s = scene();
  const g = alive();
  s.frame(g);
  die(g);
  g.runSaveInvalid = true;
  s.frame(g);
  assert.equal(s.doc.card.hidden, true);
});

test("the page without the card makes an inert summary", () => {
  const s = createRunSummary({ doc: { getElementById: () => null } });
  s.frame(alive());
  s.dispose();
});
