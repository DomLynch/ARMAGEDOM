import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { wavesEnabled } from "./trash-wave-core.js";
import { seededRandom } from "./spawn-variation.js";
import { defaultStorage, formatStat } from "./run-summary.js";

// DAILY CONTRACT (data/dailyContract.json). Client only: each UTC date a seeded draw picks three goals (one easy, one medium, one hard) from
// the data's pool, the same for everyone on that date. The run tracker (run-summary.js) already reads the live game and the step's events;
// this module only turns its figures into progress, so it adds no combat hook. Progress lives in the browser's localStorage (versioned,
// namespaced, every access guarded) and starts again on a new date; it is never in the server save and there is no streak. The goals are
// listed in the field menu (index.html #daily-panel) and a goal that completes says so on the HUD notice line. Clearing all three gives the
// session-only Contract bonus: a free extra pick at the next perk offer (?waves=1, perks.js) or else a title line on the run summary card.
const RULES = GAME_DATA.dailyContract;

// The UTC date string a draw and a record are keyed on. `now` is milliseconds, for tests.
export const dayOf = (now = Date.now()) => new Date(now).toISOString().split("T")[0];

// The day's goal rows: one per tier, in tier order. Each tier draws from its own day-seeded stream (the date, the salt and the tier), and a
// source is used once per draw. With the waves off the wave goals are not in the pool, so the draw is the same for every page without them.
export function pickGoals(day, wavesOn, rules = RULES) {
  const used = new Set();
  return rules.tiers.map((tier) => {
    const random = seededRandom([day, rules.seed.salt, tier].join(rules.seed.separator)),
      pool = rules.goals.filter((r) => r.tier === tier && (r.needs === "always" || wavesOn) && !used.has(r.source)),
      row = pool[Math.floor(random() * pool.length)];
    used.add(row.source);
    return row;
  });
}

const emptyRecord = () => ({ value: {}, done: {} });

// { value: {goalId: n}, done: {goalId: true} } for `day` from the stored record. Anything unreadable, from another version or another date
// gives an empty record; unknown goal ids, non-numbers and negative numbers are left out.
export function readProgress(store, day, rules = RULES) {
  const record = emptyRecord();
  try {
    const raw = store?.getItem(rules.storage.key);
    if (raw == null) return record;
    const saved = JSON.parse(raw);
    if (saved?.v !== rules.storage.version || saved.day !== day) return record;
    for (const row of rules.goals) {
      const value = saved.value?.[row.id];
      if (Number.isFinite(value) && value >= 0) record.value[row.id] = Math.floor(value);
      if (saved.done?.[row.id] === true) record.done[row.id] = true;
    }
  } catch {
    /* blocked or damaged storage: no progress, the list still works */
  }
  return record;
}

// True when the record was written.
export function writeProgress(store, day, record, rules = RULES) {
  try {
    store.setItem(
      rules.storage.key,
      JSON.stringify({ v: rules.storage.version, day, value: record.value, done: record.done }),
    );
    return true;
  } catch {
    return false;
  }
}

// The tracker figures a run starts from: all zero.
const zeroFigures = () => ({ time: 0, cleared: 0, hollows: 0, elite: 0, dodges: 0, weapons: {} });
const copyFigures = (f) => ({ ...f, weapons: { ...f.weapons } });
const timed = (row) => row.source === "time" || row.source === "calm";

// A goal's figure for the current run, counted from `from` (the start of the run, or the moment the date rolled over). `now` and `from` are
// tracker figures (time, cleared, hollows, elite, dodges, weapons). Whole numbers: seconds for the timed goals.
export function runFigure(row, now, from, rules = RULES) {
  let n;
  if (row.source === "weapon") {
    const id = rules.weapons[row.weapon];
    n = (now.weapons[id] ?? 0) - (from.weapons[id] ?? 0);
  } else if (row.source === "calm") n = now.dodges - from.dodges === 0 ? now.time - from.time : 0;
  else n = now[row.source] - from[row.source];
  return Math.max(0, Math.floor(n));
}

// The session-only Contract bonus: `earned` once all three goals were cleared in this page session, `ready` until perks.js takes it.
const sessionBonus = { earned: false, ready: false };
export const contractBonus = () => sessionBonus;
export const contractBonusReady = (bonus = sessionBonus) => bonus.ready;
// True once per earned bonus (the perk picker calls this when it can open the extra offer).
export function claimContractBonus(bonus = sessionBonus) {
  const ready = bonus.ready;
  bonus.ready = false;
  return ready;
}

export const goalText = (row) => {
  const n = timed(row) ? row.target / 60 : row.target;
  return webText(row.source === "weapon" ? `daily.goal.weapon.${row.weapon}` : `daily.goal.${row.source}`, { n });
};
const figureText = (row, value) => (timed(row) ? formatStat("time", value) : String(value));

// The list in the field menu (#daily-panel, #daily-list) with its three rows built once and reused, and the tracking itself. The loop calls
// `frame(g)` once a frame after tracker.observe(g). `store` and `now` are for tests.
export function createDailyContract({
  tracker,
  doc = globalThis.document,
  store = undefined,
  rules = RULES,
  waves = () => wavesEnabled(),
  now = () => Date.now(),
  bonus = sessionBonus,
} = {}) {
  const el = (id) => (typeof doc?.getElementById === "function" ? doc.getElementById(id) : null),
    heading = el("daily-heading"),
    hint = el("daily-hint"),
    list = el("daily-list"),
    note = el("daily-bonus"),
    storage = () => (store === undefined ? defaultStorage() : store),
    cur = zeroFigures(),
    cells = [];
  let day = dayOf(now()),
    goals = pickGoals(day, waves(), rules),
    record = readProgress(storage(), day, rules),
    run = { game: null, start: {}, from: zeroFigures() },
    nextCheck = now() + rules.dayCheckSeconds * 1000,
    noteKey = null;

  if (list && heading) {
    for (let i = 0; i < rules.tiers.length; i++) {
      const item = doc.createElement("li"),
        tier = doc.createElement("span"),
        goal = doc.createElement("span"),
        count = doc.createElement("span"),
        check = doc.createElement("span"),
        track = doc.createElement("span"),
        fill = doc.createElement("i");
      item.className = "dc-row";
      tier.className = "dc-tier";
      goal.className = "dc-goal";
      count.className = "dc-count";
      check.className = "dc-check";
      track.className = "dc-bar";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.append(fill);
      item.append(tier, goal, check, count, track);
      list.append(item);
      cells.push({ item, tier, goal, count, check, track, fill, shown: "" });
    }
    heading.textContent = webText("daily.heading");
    if (hint) hint.textContent = webText("daily.hint");
  }

  function paint() {
    goals.forEach((row, i) => {
      const c = cells[i],
        done = record.done[row.id] === true,
        value = done ? row.target : Math.min(row.target, record.value[row.id] ?? 0),
        key = `${row.id}|${value}|${done}`;
      if (!c || c.shown === key) return;
      c.shown = key;
      c.tier.textContent = webText(`daily.tier.${row.tier}`);
      c.goal.textContent = goalText(row);
      c.count.textContent = webText("daily.progress", {
        value: figureText(row, value),
        target: figureText(row, row.target),
      });
      c.check.textContent = done ? webText("daily.check") : "";
      c.item.classList.toggle("dc-done", done);
      c.fill.style.setProperty("--p", String(value / row.target));
      c.track.setAttribute("aria-label", c.goal.textContent);
      c.track.setAttribute("aria-valuemax", String(row.target));
      c.track.setAttribute("aria-valuenow", String(value));
    });
    paintNote();
  }
  // The bonus line under the list: the title wording without the waves; with them, the perk is waiting or has been taken.
  function paintNote() {
    if (!note) return;
    const key = `${bonus.earned}|${waves()}|${bonus.ready}`;
    if (key === noteKey) return;
    noteKey = key;
    note.hidden = !bonus.earned;
    note.textContent = !waves()
      ? webText("daily.bonusTitle")
      : bonus.ready
        ? webText("daily.bonusPerk")
        : webText("daily.bonusUsed");
  }
  paint();

  // A run starts (a new game object) from the stored record; a rollover of the date starts the new date's goals from now.
  function startRun(g) {
    run = { game: g, start: { ...record.value }, from: zeroFigures() };
  }
  function rollOver(next) {
    day = next;
    goals = pickGoals(day, waves(), rules);
    record = emptyRecord();
    run = { game: run.game, start: {}, from: copyFigures(cur) };
    paint();
  }

  function frame(g) {
    const t = now();
    if (t >= nextCheck) {
      nextCheck = t + rules.dayCheckSeconds * 1000;
      const next = dayOf(t);
      if (next !== day) {
        tracker.fill(g, cur);
        rollOver(next);
      }
    }
    if (g !== run.game) startRun(g);
    paintNote(); // the perk picker may have taken the bonus since the last frame
    tracker.fill(g, cur);
    let dirty = false,
      finished = null;
    for (const row of goals) {
      if (record.done[row.id]) continue;
      const here = runFigure(row, cur, run.from, rules),
        known = record.value[row.id] ?? 0,
        // A total adds this run's count to what the date had when the run began; a best keeps the best run. Neither goes back.
        value = Math.min(row.target, Math.max(known, row.mode === "total" ? (run.start[row.id] ?? 0) + here : here));
      if (value !== known) {
        record.value[row.id] = value;
        dirty = true;
      }
      if (value >= row.target) {
        record.done[row.id] = true;
        finished = row;
      }
    }
    if (!dirty) return;
    const target = storage(),
      all = !!finished && goals.every((row) => record.done[row.id]);
    if (target) writeProgress(target, day, record, rules);
    if (all) bonus.earned = bonus.ready = true;
    paint();
    if (!finished) return;
    g.message = all ? webText("daily.all") : webText("daily.done", { goal: goalText(finished) });
    g.messageUntil = g.time + rules.messageSeconds;
  }

  return {
    frame,
    // The title line for the run summary card: only where the bonus is not a perk pick (the waves off).
    title: () => (bonus.earned && !waves() ? webText("daily.bonusTitle") : ""),
    get goals() {
      return goals;
    },
    get record() {
      return record;
    },
    dispose() {},
  };
}
