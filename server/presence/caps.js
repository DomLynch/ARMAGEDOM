// What presence clamps a hit to before it reaches the writer: Combat's per-weapon table (weaponRules) with each damage cap raised to
// base x the largest progression multiplier (so a fully mastered hit is inside it), as the database's own weapon rules will be loaded.
// Loud on a gap: a weapon with no damage or rate in the game data stops the start instead of getting a default.
import { applyProgressionCeiling, buildWeaponRows } from "../data/world-rows.js";
import { weaponRules } from "../../Web/src/engine/world-events.js";

/** content: the parsed Web/public/world/area-content.json -> { [weapon]: { maxDamage, maxHitsPerS } } */
export function weaponCaps(content) {
  const rows = applyProgressionCeiling(buildWeaponRows(weaponRules()), content.progression);
  return Object.fromEntries(rows.map(([weapon, maxDamage, maxHitsPerS]) => [weapon, { maxDamage, maxHitsPerS }]));
}
