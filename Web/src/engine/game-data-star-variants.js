// starVariants.json: hostiles and bosses that spawn as 1-star or 2-star. Per star count: the chance an ordinary hostile (`chance`) or a boss
// (`bossChance`) rolls it, and the HP, damage and scale multipliers, the drop tier it pays at and the visible tell. engine/star-variants.js
// rolls and applies it, engine/star-variants-view.js draws the tell. Rows are listed highest star count first; chances add up and stay below 1.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const HEX = /^[0-9a-f]{6}$/;

export function validateStarVariants(d) {
  closed(d, ["schema_version", "enabled", "roll", "excludedAreas", "stars"]);
  if (typeof d.enabled !== "boolean") fail("starVariants", "enabled must be true or false");
  closed(d.roll, ["seed", "prime", "modulus", "shift"]);
  for (const k of ["seed", "prime", "modulus"]) count("starVariants", `roll.${k}`, d.roll[k], 1, 2 ** 32);
  count("starVariants", "roll.shift", d.roll.shift, 1, 31);
  if (!Array.isArray(d.excludedAreas) || !d.excludedAreas.every((a) => /^[a-z0-9-]{1,40}$/.test(a))) fail("starVariants", "excludedAreas");
  if (!Array.isArray(d.stars) || d.stars.length < 1 || d.stars.length > 4) fail("starVariants", "stars must list 1 to 4 rows");
  let top = Infinity,
    odds = 0,
    bossOdds = 0;
  for (const row of d.stars) {
    closed(row, ["stars", "chance", "bossChance", "hp", "damage", "scale", "dropTier", "tell"]);
    count("starVariants", "stars", row.stars, 1, 4);
    if (row.stars >= top) fail("starVariants", "rows must list the highest star count first, once each");
    top = row.stars;
    number("starVariants", "chance", row.chance, 0);
    number("starVariants", "bossChance", row.bossChance, 0);
    odds += row.chance;
    bossOdds += row.bossChance;
    for (const k of ["hp", "damage", "scale"]) number("starVariants", `${k} (${row.stars} star)`, row[k], 1);
    if (row.scale > 1.5) fail("starVariants", "scale above 1.5 outgrows the physics rows");
    if (!["trash", "creature", "boss"].includes(row.dropTier)) fail("starVariants", "dropTier");
    closed(row.tell, ["emissive", "intensity", "tint", "tintMix"]);
    if (!HEX.test(row.tell.emissive) || !HEX.test(row.tell.tint)) fail("starVariants", "tell colours are six hex digits");
    number("starVariants", "tell.intensity", row.tell.intensity, 0);
    number("starVariants", "tell.tintMix", row.tell.tintMix, 0);
    if (row.tell.tintMix > 1) fail("starVariants", "tell.tintMix is at most 1");
  }
  if (odds >= 1 || bossOdds >= 1) fail("starVariants", "chances must add up below 1");
}
