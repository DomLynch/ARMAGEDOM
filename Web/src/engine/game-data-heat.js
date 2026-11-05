// data/heat.json (engine/heat.js): the wanted/heat count and the hunter pressure it adds. The validator lives here
// so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

// What raises heat besides a kill: cash by source prefix (+1 per perHeat cash), a flat amount per claim source, a flat amount per event.
function validateValuables(v) {
  closed(v, ["cash", "claims", "events"]);
  for (const [list, key, extra] of [
    [v.cash, "sourcePrefix", "perHeat"],
    [v.claims, "source", "heat"],
    [v.events, "type", "heat"],
  ]) {
    if (!Array.isArray(list)) fail("heat", "valuables rows must be lists");
    for (const row of list) {
      closed(row, [key, extra]);
      if (typeof row[key] !== "string" || !row[key]) fail("heat", `valuables.${key} must be a name`);
      count("heat", `valuables.${extra}`, row[extra], 1, 1000);
    }
  }
}

function validateTiers(rows) {
  if (!Array.isArray(rows) || !rows.length) fail("heat", "pressure.tiers needs at least one tier");
  let last = 0;
  for (const t of rows) {
    closed(t, ["minHeat", "timeScale", "extraHunters", "stars"]);
    count("heat", "tier.minHeat", t.minHeat, last + 1, 999);
    last = t.minHeat;
    if (!Number.isFinite(t.timeScale) || t.timeScale <= 0 || t.timeScale > 1) fail("heat", "tier.timeScale must be above 0 and at most 1");
    count("heat", "tier.extraHunters", t.extraHunters, 0, 4);
    if (!Array.isArray(t.stars)) fail("heat", "tier.stars must be a list");
    for (const s of t.stars) {
      closed(s, ["stars", "chance"]);
      count("heat", "tier.stars.stars", s.stars, 1, 9);
      if (!Number.isFinite(s.chance) || s.chance < 0 || s.chance > 1) fail("heat", "tier.stars.chance must be from 0 to 1");
    }
    if (t.stars.reduce((a, s) => a + s.chance, 0) > 1) fail("heat", "tier.stars chances may not add up past 1");
  }
}

export function validateHeat(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "groupSize",
    "maxHeat",
    "seed",
    "rng",
    "decay",
    "tierMessageSeconds",
    "valuables",
    "pressure",
  ]);
  number("heat", "tierMessageSeconds", d.tierMessageSeconds, 0.1);
  validateValuables(d.valuables);
  if (typeof d.enabled !== "boolean") fail("heat", "enabled must be a boolean");
  closed(d.offSwitch, ["param", "value"]);
  for (const k of ["param", "value"]) if (typeof d.offSwitch[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d.offSwitch[k])) fail("heat", `offSwitch.${k}`);
  count("heat", "groupSize", d.groupSize, 2, 10);
  count("heat", "seed", d.seed, 0, 2 ** 31);
  closed(d.rng, ["multiplier", "increment", "modulus", "stride"]);
  for (const k of ["multiplier", "increment", "modulus", "stride"]) count("heat", `rng.${k}`, d.rng[k], 1, 2 ** 32);
  closed(d.decay, ["secondsPerMark", "fadeSeconds", "minAlpha"]);
  number("heat", "decay.secondsPerMark", d.decay.secondsPerMark, 1);
  number("heat", "decay.fadeSeconds", d.decay.fadeSeconds, 0);
  if (d.decay.fadeSeconds > d.decay.secondsPerMark) fail("heat", "decay.fadeSeconds may not exceed secondsPerMark");
  number("heat", "decay.minAlpha", d.decay.minAlpha, 0);
  closed(d.pressure, ["minSeconds", "tiers"]);
  number("heat", "pressure.minSeconds", d.pressure.minSeconds, 1);
  validateTiers(d.pressure.tiers);
  const top = d.pressure.tiers[d.pressure.tiers.length - 1].minHeat;
  count("heat", "maxHeat", d.maxHeat, top, 99); // reaches the top tier
}
