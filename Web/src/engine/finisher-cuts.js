// The Pitborn's dismemberment finishers as physics cuts (data/pitbornCuts.json). PRESENTATION ONLY and three-free: which finisher a kill rolls, which
// package cut units it takes and when, and the flag. engine/physics-death-impl.js carries the cuts out on the ragdoll (rd.cut) and shows the cut GLB.
// Mirrors Frankendom V3's rows (src/fight/finisher-cuts.ts) and its seeded no-repeat pick, keyed on OUR weapons instead of a blade duel.
import { GAME_DATA } from "./game-data.js";
import { draw } from "../finisher-selection.js";

const CFG = () => GAME_DATA.pitbornCuts;

let flag = null; // read once, like the ragdoll's flag: the off path allocates nothing per frame
const fromSearch = (search, cfg) => {
  const v = new URLSearchParams(search).get(cfg.flagParam);
  return v === cfg.offValue ? false : cfg.defaultOn;
};
export const cutsEnabled = (search) =>
  search === undefined ? (flag ??= fromSearch(globalThis.location?.search ?? "", CFG())) : fromSearch(search, CFG());

// What the last kills showed: `last` keeps one finisher from repeating, `misses` feeds the pity rule, `ordinal` makes each draw its own.
const pickState = () => ({ last: null, misses: 0, ordinal: 0 });
const state = pickState();

const bindingFor = (weapon, cfg) => cfg.bindings.find((b) => b.weapons.includes(weapon)) ?? null;

/** The finisher id this kill rolls, or null (plain ragdoll death). Pure of the clock: the same victim, weapon and history give the same pick. */
export function pickCutFinisher(blow, victimId, st = state, cfg = CFG()) {
  const binding = bindingFor(blow?.weapon, cfg);
  if (!binding) return null; // a weapon with no cut row (flame, bites) keeps its own death
  const ordinal = st.ordinal++,
    ctx = { victimId };
  if (st.misses < cfg.pityAfter && draw(ctx, ordinal, cfg.seed, "cut-admission") >= cfg.chance) {
    st.misses++;
    return null;
  }
  st.misses = 0;
  const fresh = cfg.noRepeat ? binding.pool.filter((p) => p.id !== st.last) : binding.pool,
    pool = fresh.length ? fresh : binding.pool;
  let w = draw(ctx, ordinal, cfg.seed, "cut-recipe") * pool.reduce((sum, p) => sum + p.weight, 0);
  let pick = pool[pool.length - 1];
  for (const p of pool) {
    w -= p.weight;
    if (w < 0) {
      pick = p;
      break;
    }
  }
  st.last = pick.id;
  return pick.id;
}

/** The units a finisher cuts, in order, with the seconds after the killing blow each is cut: `unit` (or the row's `fallback` when the body lacks it)
 * at atS, then every `also` the body has at atS + alsoAtS. `has(unit)`: the cut GLB and the ragdoll both carry the unit. Empty = no cut. */
export function finisherSteps(row, has) {
  const first = has(row.unit) ? row.unit : (row.fallback ?? null),
    steps = first === null ? [] : [{ unit: first, atS: row.atS }];
  for (const unit of row.also) if (has(unit) && unit !== first) steps.push({ unit, atS: row.atS + row.alsoAtS });
  return steps;
}

/** The units a cut manifest declares (regions it detaches or separates, caps it shows, optional visual units). */
export function manifestUnits(manifest) {
  const out = new Set();
  for (const r of manifest?.regions ?? []) for (const u of [r.detached_by, r.separated_by]) if (u) out.add(u);
  for (const c of manifest?.caps ?? []) if (c.shown_when_cut) out.add(c.shown_when_cut);
  for (const [unit, o] of Object.entries(manifest?.optional_units ?? {})) if (o?.enabled !== false) out.add(unit);
  return out;
}

/** The plan for one kill: the rolled finisher with its steps on this body, or null (no cut: the plain ragdoll). */
export function planCut(blow, victimId, has, st = state, cfg = CFG()) {
  const id = pickCutFinisher(blow, victimId, st, cfg),
    row = id === null ? null : cfg.finishers[id],
    steps = row ? finisherSteps(row, has) : [];
  return row && steps.length ? { id, row, steps } : null;
}

/** Cuts made some seconds after the killing blow: add them on the kill, tick each presentation frame. */
export function createLateCuts() {
  let queue = [];
  return {
    add(unit, atS) {
      queue.push({ unit, left: atS });
    },
    /** The units due after `dt` more seconds, in the order they were added. */
    tick(dt) {
      if (!queue.length) return [];
      for (const q of queue) q.left -= dt;
      const due = queue.filter((q) => q.left <= 0).map((q) => q.unit);
      if (due.length) queue = queue.filter((q) => q.left > 0);
      return due;
    },
    get pending() {
      return queue.length;
    },
  };
}
