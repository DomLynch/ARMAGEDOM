// data/heat.json (engine/heat.js, engine/heat-tally-view.js): the wanted/heat tally and the hunter pressure it adds. The validator lives here
// so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

const checkHex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("heat", `${field} must be a six-digit hex colour`);
};
const checkNumbers = (path, o) => {
  for (const k of Object.keys(o)) if (!Number.isFinite(o[k])) fail("heat", `${path}.${k} must be a number`);
};

function validateLook(s) {
  closed(s, ["label", "centre", "colours", "mark", "companions", "strike"]);
  number("heat", "look.centre", s.centre, 0);
  closed(s.colours, ["fill", "core", "edge", "glow", "glowAlpha", "glowBlurPx"]);
  for (const k of ["fill", "core", "edge", "glow"]) checkHex(`look.colours.${k}`, s.colours[k]);
  number("heat", "look.colours.glowAlpha", s.colours.glowAlpha);
  number("heat", "look.colours.glowBlurPx", s.colours.glowBlurPx);
  closed(s.mark, [
    "lengthPx",
    "widthPx",
    "bendPx",
    "segments",
    "edgeJitterPx",
    "notchProb",
    "notchPx",
    "notchBias",
    "tipSharpness",
    "entryPower",
    "bodyPower",
    "tiltJitterDeg",
    "baseTiltDeg",
    "spacingPx",
    "edgeLinePx",
    "coreShare",
  ]);
  checkNumbers("look.mark", s.mark);
  count("heat", "look.mark.segments", s.mark.segments, 4, 64);
  closed(s.companions, ["offsetsPx", "widthPx", "lengthShare", "startShare", "followShare"]);
  if (!Array.isArray(s.companions.offsetsPx) || s.companions.offsetsPx.some((n) => !Number.isFinite(n)))
    fail("heat", "look.companions.offsetsPx must list numbers");
  for (const k of ["widthPx", "lengthShare", "startShare", "followShare"]) number("heat", `look.companions.${k}`, s.companions[k]);
  closed(s.strike, ["angleDeg", "halfLengthPx", "widthPx", "bendPx"]);
  checkNumbers("look.strike", s.strike);
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
  closed(d, ["schema_version", "enabled", "offSwitch", "groupSize", "seed", "rng", "decay", "pressure", "world", "look"]);
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
  closed(d.world, ["heightMetres", "widthMetresPerGroup", "canvasPxPerGroup", "canvasHeightPx", "maxGroups", "renderOrder"]);
  for (const k of ["heightMetres", "widthMetresPerGroup", "canvasPxPerGroup", "canvasHeightPx"]) number("heat", `world.${k}`, d.world[k], 0.1);
  count("heat", "world.maxGroups", d.world.maxGroups, 1, 12);
  count("heat", "world.renderOrder", d.world.renderOrder, 0, 1000);
  validateLook(d.look);
}
