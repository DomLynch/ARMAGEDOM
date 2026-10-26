// visual.json `effects.feedback` (effects.js): the combat feedback pools (particles, tracers), colours, finisher droplet motion and the
// other numbers that used to sit inline. Called from validateVisual in game-data.js. Metres, seconds, shares, 6-digit hex colours.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("visual", `effects.feedback.${field} must be 6 lowercase hex digits`);
};
const group = (c, name, fields, min = 0) => {
  closed(c[name], fields);
  for (const f of fields) number("visual", `effects.feedback.${name}.${f}`, c[name][f], min);
};

export function validateEffectsFeedback(c) {
  closed(c, ["pools", "viewportFallback", "lootGemRadius", "flameWidthScale", "tracer", "muzzleFlashColour", "particle", "finisherDrop"]);
  closed(c.pools, ["particles", "tracers"]);
  for (const f of ["particles", "tracers"])
    if (!Number.isInteger(c.pools[f]) || c.pools[f] < 1 || c.pools[f] > 512)
      fail("visual", `effects.feedback.pools.${f} must be an integer from 1 to 512`);
  group(c, "viewportFallback", ["width", "height"], 1);
  number("visual", "effects.feedback.lootGemRadius", c.lootGemRadius, 0.01);
  group(c, "flameWidthScale", ["witch", "salamander"], 0.1);
  closed(c.tracer, ["colour", "opacity", "defaultSeconds"]);
  hex("tracer.colour", c.tracer.colour);
  if (!(c.tracer.opacity > 0 && c.tracer.opacity <= 1)) fail("visual", "effects.feedback.tracer.opacity must be above 0 and at most 1");
  number("visual", "effects.feedback.tracer.defaultSeconds", c.tracer.defaultSeconds, 0.001);
  hex("muzzleFlashColour", c.muzzleFlashColour);
  closed(c.particle, ["palette", "gravity", "minLife", "dimBase", "dimSpan"]);
  hex("particle.palette", c.particle.palette);
  number("visual", "effects.feedback.particle.gravity", c.particle.gravity, 0);
  number("visual", "effects.feedback.particle.minLife", c.particle.minLife, 0.0001);
  const { dimBase, dimSpan } = c.particle;
  if (!(dimBase >= 0 && dimSpan >= 0 && dimBase + dimSpan <= 1)) fail("visual", "effects.feedback.particle dim must stay within 0 to 1");
  group(c, "finisherDrop", ["speedBase", "speedSpread", "speedStride", "liftShare", "liftCycle", "baseLift", "tailSpeedShare", "tailTravelShare"]);
  if (!Number.isInteger(c.finisherDrop.liftCycle) || c.finisherDrop.liftCycle < 1)
    fail("visual", "effects.feedback.finisherDrop.liftCycle must be a positive integer");
}
