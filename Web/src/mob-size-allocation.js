// Allocate once from FULL registered keys, including dead residents. Rendering
// and Combat consume the SAME absolute factor; this module changes no bodies.
import { GAME_DATA } from "./engine/game-data.js";
// The approved factor pool and its allowed range live in Web/src/data/creatures.json `mobSize` (read through game-data.js).
const MOB_SIZE = GAME_DATA.creatures.mobSize;
const text = (value) => typeof value === "string" && value.trim().length > 0;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function hash(value) {
  let h = 2166136261; // tuning-ok: FNV-1a 32-bit offset basis
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); // tuning-ok: FNV-1a 32-bit prime
  return h >>> 0;
}
export function allocateMobSizes(areaId, residentKeys, factors = MOB_SIZE.factors) {
  if (!text(areaId) || !Array.isArray(residentKeys)) throw Error("Mob sizes require an area and stable resident keys");
  const keys = Array.from(residentKeys);
  if (keys.some((key) => !text(key)) || new Set(keys).size !== keys.length)
    throw Error("Mob size keys must be nonempty unique strings");
  if (!Array.isArray(factors) || !factors.length) throw Error("Mob sizes require an approved factor pool");
  const pool = Array.from(factors);
  if (
    pool.some((factor) => !Number.isFinite(factor) || factor < MOB_SIZE.min || factor > MOB_SIZE.max) ||
    new Set(pool).size !== pool.length
  )
    throw Error(`Mob size factors must be unique finite numbers within ${MOB_SIZE.min}–${MOB_SIZE.max}`);
  keys.sort(compare);
  pool.sort((a, b) => a - b);
  const result = new Map();
  for (let start = 0; start < keys.length; start += pool.length) {
    // A seeded priority permutes an UNUSED pool, never per-actor hash modulo.
    // Every complete roster block uses each size exactly once. Hash ties resolve
    // numerically, so they cannot duplicate factors or make spawn order matter.
    const score = (factor) => hash(JSON.stringify([areaId, keys[start], factor]));
    const order = [...pool].sort((a, b) => score(a) - score(b) || a - b);
    for (let i = 0; i < order.length && start + i < keys.length; i++) result.set(keys[start + i], order[i]);
  }
  return result;
}
