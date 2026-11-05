import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { wavesEnabled } from "./trash-wave-core.js";

// RUN SUMMARY (data/runSummary.json): the card on the death screen (index.html #run-summary, inside #ending). Client only. A tracker reads the
// live game each frame (time, kills, the waves' counters, the heat peak) and the card shows the finished life next to the player's personal
// bests. Bests live in the browser's localStorage (versioned, namespaced, every access guarded) and nowhere else: never in the server save.
// Every row says how close the player was to its best, and one goal line names the stat nearest to being beaten.
const RULES = GAME_DATA.runSummary;
const has = (id) => GAME_DATA.webText.texts[id] !== undefined;
const dead = (g) => !!g && g.finished === true && g.player.hp <= 0;

// localStorage, or null where the browser refuses it (the getter itself can throw).
export function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// { statId: best } from the stored record; anything unreadable, from another version or not a count is left out.
export function readBest(store, rules = RULES) {
  const best = {};
  try {
    const raw = store?.getItem(rules.storage.key);
    if (raw == null) return best;
    const saved = JSON.parse(raw);
    if (saved?.v !== rules.storage.version || !saved.best || typeof saved.best !== "object") return best;
    for (const row of rules.stats) {
      const value = saved.best[row.id];
      if (Number.isFinite(value) && value >= 0) best[row.id] = value;
    }
  } catch {
    /* blocked or damaged storage: no bests, the card still works */
  }
  return best;
}

// True when the record was written.
export function writeBest(store, best, rules = RULES) {
  try {
    store.setItem(rules.storage.key, JSON.stringify({ v: rules.storage.version, best }));
    return true;
  } catch {
    return false;
  }
}

export function formatStat(format, value, rules = RULES) {
  if (format !== "time") return String(value);
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(rules.timeDigits, "0")}`;
}

// Compares one finished life with the bests. Each row: first (a record where there was none), new (beaten), tie, short (gap to the best) or
// none (nothing to compare, a zero). `active(row)` says which stats this session has. goal = the row nearest to its best (a tie first).
export function evaluate(values, best, active, rules = RULES) {
  const rows = [];
  let goal = null,
    nearest = Infinity;
  for (const stat of rules.stats) {
    if (!active(stat)) continue;
    const value = Math.max(0, Math.floor(values[stat.source] ?? 0)),
      prior = best[stat.id],
      state =
        prior === undefined
          ? value > 0
            ? "first"
            : "none"
          : value > prior
            ? "new"
            : value < prior
              ? "short"
              : value > 0
                ? "tie"
                : "none",
      row = { id: stat.id, format: stat.format, value, prior, state, gap: state === "short" ? prior - value : 0 };
    rows.push(row);
    if ((state === "short" || state === "tie") && row.gap / prior < nearest) {
      nearest = row.gap / prior;
      goal = row;
    }
  }
  return { rows, goal };
}

// The bests after this life: each stat's higher figure.
export function mergeBest(best, result) {
  const next = { ...best };
  for (const row of result.rows) if (row.value > (next[row.id] ?? 0)) next[row.id] = row.value;
  return next;
}

// The words for one row and for the goal line, from webText.json (summary.*).
export function describeRow(row, rules = RULES) {
  const show = (v) => formatStat(row.format, v, rules);
  return {
    label: webText(`summary.label.${row.id}`),
    value: show(row.value),
    tag: row.state === "new" ? webText("summary.newBest") : row.state === "first" ? webText("summary.first") : "",
    note:
      row.state === "short"
        ? webText("summary.short", { best: show(row.prior), gap: show(row.gap) })
        : row.state === "tie"
          ? webText("summary.tied")
          : row.state === "new" && row.prior !== undefined
            ? webText("summary.was", { best: show(row.prior) })
            : "",
  };
}
export function describeGoal(result) {
  const goal = result.goal;
  if (!goal) return webText(result.rows.some((r) => r.state === "new") ? "summary.goal.beaten" : "summary.goal.first");
  const more = goal.gap + 1, // to beat the best, not just match it
    one = more === 1 && has(`summary.goal.${goal.id}.one`) ? ".one" : "";
  return webText(`summary.goal.${goal.id}${one}`, { n: more, target: goal.prior + 1 });
}

// Reads the live game once a frame and keeps what the card needs after the run has ended: the waves' state is cleared on death, so the wave
// counters (folded in when the state is replaced by an area change) and the heat peak are noted while the player is alive. Kills and time are
// read from the game itself. A new game object (a retry) starts a new life.
export function createRunTracker() {
  let game = null,
    base = 0,
    wave = null,
    carry = { cleared: 0, score: 0 },
    last = { cleared: 0, score: 0 },
    best = 0,
    peak = 0,
    heat = false;
  const reset = (g) => {
    game = g;
    base = g.kills ?? 0; // a restored save counts earlier kills; this life starts from there
    wave = null;
    carry = { cleared: 0, score: 0 };
    last = { cleared: 0, score: 0 };
    best = peak = 0;
    heat = false;
  };
  return {
    observe(g) {
      if (g !== game) reset(g);
      if (g.finished || g.player.hp <= 0) return;
      const state = g.trashWave;
      if (state) {
        if (state !== wave) {
          carry = { cleared: carry.cleared + last.cleared, score: carry.score + last.score };
          wave = state;
        }
        last = { cleared: state.cleared, score: state.score };
        best = Math.max(best, state.wave);
      }
      if (g.heat) {
        heat = true;
        peak = Math.max(peak, g.heat.count);
      }
    },
    // The session's waves cleared so far (what the perk offers count).
    cleared: () => carry.cleared + last.cleared,
    snapshot: (g) => ({
      time: g.time,
      kills: Math.max(0, (g.kills ?? 0) - base),
      cleared: carry.cleared + last.cleared,
      wave: best,
      score: carry.score + last.score,
      heat: peak,
      hasHeat: heat,
    }),
  };
}

const inert = { frame() {}, dispose() {} };

// The card. The loop calls tracker.observe(g) and then `frame(g)` once a frame with the live game; the card shows while the player is dead
// and is filled again for each death from a pool of rows made once. `store` is for tests.
export function createRunSummary({
  tracker = createRunTracker(),
  doc = globalThis.document,
  store = undefined,
  rules = RULES,
  waves = () => wavesEnabled(),
} = {}) {
  const el = (id) => (typeof doc?.getElementById === "function" ? doc.getElementById(id) : null),
    card = el("run-summary");
  if (!card) return inert;
  const heading = doc.createElement("p"),
    list = doc.createElement("ul"),
    goal = doc.createElement("p"),
    cells = rules.stats.map((stat) => {
      const item = doc.createElement("li"),
        label = doc.createElement("span"),
        value = doc.createElement("b"),
        note = doc.createElement("span"),
        tag = doc.createElement("em"),
        words = doc.createElement("span");
      label.className = "rs-label";
      value.className = "rs-value";
      note.className = "rs-note";
      tag.className = "rs-tag";
      note.append(tag, words);
      item.append(label, value, note);
      list.append(item);
      return { stat, item, label, value, tag, words };
    });
  heading.className = "rs-heading";
  goal.className = "rs-goal";
  list.className = "rs-list";
  card.replaceChildren(heading, list, goal);
  let shown = null;
  function show(g) {
    const storage = store === undefined ? defaultStorage() : store,
      best = readBest(storage, rules),
      wavesOn = waves(),
      values = tracker.snapshot(g),
      result = evaluate(
        values,
        best,
        (s) => s.needs === "always" || (s.needs === "waves" ? wavesOn : values.hasHeat),
        rules,
      );
    if (storage) writeBest(storage, mergeBest(best, result), rules);
    heading.textContent = webText("summary.heading");
    for (const c of cells) {
      const row = result.rows.find((r) => r.id === c.stat.id);
      c.item.hidden = !row;
      if (!row) continue;
      const text = describeRow(row, rules);
      c.label.textContent = text.label;
      c.value.textContent = text.value;
      c.tag.textContent = text.tag;
      c.tag.hidden = !text.tag;
      c.words.textContent = text.note;
      c.item.classList.toggle("rs-new", row.state === "new" || row.state === "first");
    }
    goal.textContent = describeGoal(result);
    card.hidden = false;
    shown = g;
  }
  return {
    frame(g) {
      if (dead(g) && !g.runSaveInvalid) {
        if (shown !== g) show(g);
      } else if (shown) {
        card.hidden = true;
        shown = null;
      }
    },
    dispose() {
      card.hidden = true;
      shown = null;
    },
  };
}
