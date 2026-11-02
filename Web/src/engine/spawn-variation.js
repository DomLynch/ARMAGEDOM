import { GAME_DATA } from "./game-data.js";
// Seeded area variation (data/spawnVariation.json). Each day an area re-rolls where its crates, stashes and hostiles stand, drawn
// from the hand-built points the area already has. Nothing here invents a position: a crate or hostile only ever moves onto a point
// another crate or hostile (or an unused resident row) already stands on, so every layout is walkable, and every id, key, kind and
// count stays as it was (the server's spawn rows and cash-claim ids do not change).
// The seed is the date plus the area (plus the cycle for hostiles). The generator is the same LCG the atmosphere quads use, with its
// numbers in the data. The roll runs only in a browser, and ?<offParam>=1 switches it off; headless code gets the hand-built layout.
const DATA = GAME_DATA.spawnVariation;
const RNG = DATA.rng;

function hash(text) {
  let h = RNG.hashOffset;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), RNG.hashPrime) >>> 0;
  return h;
}
export function seededRandom(seed) {
  let state = hash(seed);
  return () => {
    state = (Math.imul(state, RNG.multiplier) + RNG.increment) >>> 0;
    return state / RNG.range;
  };
}
function drawWeighted(weights, ids, random) {
  let roll = random() * ids.reduce((sum, id) => sum + weights[id], 0);
  for (const id of ids) {
    roll -= weights[id];
    if (roll < 0) return id;
  }
  return ids[ids.length - 1];
}
// { slot: point } for one row: each slot in order draws a distinct point, weighted. A slot named in `only` draws from those points
// (a trap crate needs a point the player can walk straight to), so such slots come first in the row.
export function rollSlots(spec, seed) {
  const random = seededRandom(seed),
    free = Object.keys(spec.points),
    chosen = {};
  for (const slot of spec.slots) {
    const allowed = spec.only?.[slot],
      candidates = allowed ? free.filter((id) => allowed.includes(id)) : free,
      point = drawWeighted(spec.points, candidates.length ? candidates : free, random);
    free.splice(free.indexOf(point), 1);
    chosen[slot] = point;
  }
  return chosen;
}
const seedOf = (...parts) => parts.join(DATA.seedSeparator);

// The day the browser session started, so a layout does not shift under the player at midnight.
let sessionDay = null;
export function activeDay() {
  const location = globalThis.location;
  if (!location || new URLSearchParams(location.search).get(DATA.offParam) === "1") return null;
  sessionDay ??= new Date().toISOString().split("T")[0];
  return sessionDay;
}

const crateCache = new Map();
// { pickups, traps } for an area on a day: the same rows with x and z moved to the point each drew. `day` null keeps the hand-built layout.
export function variedCrates(areaId, day) {
  const base = { pickups: GAME_DATA.worldPickups.placements[areaId] ?? [], traps: GAME_DATA.trapCrates.placements[areaId] ?? [] },
    spec = DATA.crates[areaId],
    key = seedOf(day, areaId);
  if (!day || !spec) return base;
  if (crateCache.has(key)) return crateCache.get(key);
  const chosen = rollSlots(spec, key),
    at = Object.fromEntries([...base.pickups, ...base.traps].map((row) => [row.id, row])),
    move = (row) => (chosen[row.id] ? { ...row, x: at[chosen[row.id]].x, z: at[chosen[row.id]].z } : row),
    result = { pickups: base.pickups.map(move), traps: base.traps.map(move) };
  crateCache.set(key, result);
  return result;
}

const hostileCache = new Map();
// The area's resident rows with pos and patrol swapped between the slots and the pool points. Keys, species and the active set stay put.
export function variedHostiles(rows, areaId, cycle, day) {
  const spec = DATA.hostiles[areaId]?.cycles[cycle];
  if (!day || !spec) return rows;
  const key = seedOf(day, areaId, cycle);
  if (!hostileCache.has(key)) hostileCache.set(key, rollSlots(spec, key));
  const chosen = hostileCache.get(key),
    byKey = new Map(rows.map((row) => [row.key, row]));
  return rows.map((row) => {
    const from = byKey.get(chosen[row.key]);
    return from ? { ...row, pos: from.pos, patrol: from.patrol } : row;
  });
}
