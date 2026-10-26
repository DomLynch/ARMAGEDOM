// NPC ranged-attack numbers beside the per-boss rows in weapons.json `bossRanged`: pellet fan, warning arcs, the rocket's
// ground height and wall bisection, and the stagger and stamina each shot carries. Kept out of game-data.js (size budget).
import input from "./boss-ranged-data.json" with { type: "json" };
import { closed, freeze } from "./content-schema.js";

const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const fail = () => {
  throw TypeError("Invalid boss ranged data");
};
export function validateBossRangedData(value) {
  const d = structuredClone(value);
  closed(d, ["shotgun", "rocket"]);
  closed(d.shotgun, ["pellets", "spreadDegrees", "warningArcDegrees", "stagger", "staminaDamage"]);
  closed(d.rocket, ["warningArcDegrees", "groundHeight", "bisectSteps", "stagger", "staminaDamage"]);
  if (
    !Number.isInteger(d.shotgun.pellets) ||
    !finite(d.shotgun.pellets, 2, 64) ||
    !finite(d.shotgun.spreadDegrees, 0, 45) ||
    !Number.isInteger(d.rocket.bisectSteps) ||
    !finite(d.rocket.bisectSteps, 1, 32) ||
    !finite(d.rocket.groundHeight, 0, 1)
  )
    fail();
  for (const row of Object.values(d))
    if (!finite(row.warningArcDegrees, 0, 90) || !finite(row.stagger, 0, 5) || !finite(row.staminaDamage, 0, 200))
      fail();
  return freeze(d);
}
export const BOSS_RANGED_EXTRA = validateBossRangedData(input);
