// visual.json `effects.feedback` (effects.js): the combat feedback pools (particles, tracers), colours, finisher droplet motion and the
// other numbers that used to sit inline. Called from validateVisual in game-data.js. Metres, seconds, shares, 6-digit hex colours.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";
import { eventsKeys, validateEffectsEvents } from "./effects-events-data.js";

const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("visual", `effects.feedback.${field} must be 6 lowercase hex digits`);
};
const group = (c, name, fields, min = 0) => {
  closed(c[name], fields);
  for (const f of fields) number("visual", `effects.feedback.${name}.${f}`, c[name][f], min);
};

export function validateEffectsFeedback(c) {
  closed(c, [
    "pools",
    "viewportFallback",
    "lootGemRadius",
    "flameWidthScale",
    "tracer",
    "muzzleFlashColour",
    "particle",
    "finisherDrop",
    "burst",
    "pickupGun",
    "reticle",
    "line",
    "frame",
    ...eventsKeys(),
  ]);
  validateEffectsFeedbackShapes(c);
  validateEffectsEvents(c);
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

// The hit burst, the pistol pickup, the aim reticle, the transient arc lines and the frame step.
function validateEffectsFeedbackShapes(c) {
  closed(c.burst, ["counts", "lifeSeconds", "sizes", "spread", "liftBase", "liftStep", "liftCycle"]);
  group(c.burst, "counts", ["off", "low", "killed", "hit"], 1);
  group(c.burst, "lifeSeconds", ["off", "killed", "hit"], 0.01);
  group(c.burst, "sizes", ["off", "low", "killed", "hit"], 0.001);
  for (const f of ["spread", "liftBase", "liftStep"]) number("visual", `effects.feedback.burst.${f}`, c.burst[f], 0);
  if (!Number.isInteger(c.burst.liftCycle) || c.burst.liftCycle < 1) fail("visual", "effects.feedback.burst.liftCycle must be a positive integer");
  for (const f of ["off", "low", "killed", "hit"])
    if (!Number.isInteger(c.burst.counts[f])) fail("visual", `effects.feedback.burst.counts.${f} must be an integer`);
  closed(c.pickupGun, ["tilt", "height", "scale", "contourColour"]);
  for (const f of ["tilt", "height", "scale"]) number("visual", `effects.feedback.pickupGun.${f}`, c.pickupGun[f], 0);
  hex("pickupGun.contourColour", c.pickupGun.contourColour);
  const r = c.reticle;
  closed(r, [
    "barLength", "barThickness", "outlinePad", "cornerNear", "cornerFar", "cornerLength", "cornerThickness",
    "outlineColour", "cueColour", "accentColour", "accentTriangle", "accentY", "renderOrders",
  ]);
  for (const f of ["barLength", "barThickness", "outlinePad", "cornerNear", "cornerFar", "cornerLength", "cornerThickness", "accentY"])
    number("visual", `effects.feedback.reticle.${f}`, r[f], 0);
  for (const f of ["outlineColour", "cueColour", "accentColour"]) hex(`reticle.${f}`, r[f]);
  if (!Array.isArray(r.accentTriangle) || r.accentTriangle.length !== 9 || !r.accentTriangle.every(Number.isFinite))
    fail("visual", "effects.feedback.reticle.accentTriangle must be nine numbers (three points)");
  closed(r.renderOrders, ["outline", "cue", "accent"]);
  for (const f of ["outline", "cue", "accent"])
    if (!Number.isInteger(r.renderOrders[f])) fail("visual", `effects.feedback.reticle.renderOrders.${f} must be an integer`);
  closed(c.line, ["defaultHeight", "ringArcDegrees", "steps", "opacity"]);
  number("visual", "effects.feedback.line.defaultHeight", c.line.defaultHeight, 0);
  if (!(c.line.ringArcDegrees > 180 && c.line.ringArcDegrees < 360)) fail("visual", "effects.feedback.line.ringArcDegrees must be between 180 and 360");
  if (!Number.isInteger(c.line.steps) || c.line.steps < 2) fail("visual", "effects.feedback.line.steps must be an integer of at least 2");
  if (!(c.line.opacity > 0 && c.line.opacity <= 1)) fail("visual", "effects.feedback.line.opacity must be above 0 and at most 1");
  group(c, "frame", ["maxStep", "recoilDecay", "recoilSettle", "offRecoilShare"], 0.0001);
}
