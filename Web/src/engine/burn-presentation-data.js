// burnPresentation.json (engine/burn-presentation.js): the validator, called from game-data.js. Metres, seconds, shares 0 to 1.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const HEX = /^[0-9a-f]{6}$/;
const FILE = "burnPresentation";
const share = (field, v) => {
  if (!(Number.isFinite(v) && v >= 0 && v <= 1)) fail(FILE, `${field} must be 0 to 1`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !HEX.test(v)) fail(FILE, `${field} must be a six-digit lowercase hex colour`);
};
export function validateBurnPresentation(d) {
  closed(d, [
    "schema_version",
    "note",
    "flagParam",
    "offValue",
    "defaultOn",
    "maxActors",
    "living",
    "dying",
    "tint",
    "flame",
    "smoke",
    "texture",
    "floorClearance",
  ]);
  if (typeof d.note !== "string" || !d.note) fail(FILE, "note must say what the row does");
  if (typeof d.flagParam !== "string" || !d.flagParam || typeof d.offValue !== "string" || !d.offValue)
    fail(FILE, "flagParam and offValue must be non-empty strings");
  if (typeof d.defaultOn !== "boolean") fail(FILE, "defaultOn must be true or false");
  count(FILE, "maxActors", d.maxActors, 1, 8);
  number(FILE, "floorClearance", d.floorClearance, 0);
  closed(d.living, ["chargeSeconds", "cooldownSeconds", "maxChar", "afterburnSeconds"]);
  for (const k of ["chargeSeconds", "cooldownSeconds", "afterburnSeconds"])
    number(FILE, `living.${k}`, d.living[k], 0.01);
  share("living.maxChar", d.living.maxChar);
  closed(d.dying, [
    "graceSeconds",
    "charSeconds",
    "maxChar",
    "burnSeconds",
    "smokeSeconds",
    "lieSeconds",
    "lieHeightShare",
  ]);
  for (const k of ["graceSeconds", "charSeconds", "burnSeconds", "smokeSeconds", "lieSeconds"])
    number(FILE, `dying.${k}`, d.dying[k], 0.01);
  share("dying.maxChar", d.dying.maxChar);
  share("dying.lieHeightShare", d.dying.lieHeightShare);
  closed(d.tint, [
    "sootColour",
    "blend",
    "emberColour",
    "emberIntensity",
    "flickerHz",
    "flickerDepth",
    "roughnessFloor",
  ]);
  hex("tint.sootColour", d.tint.sootColour);
  hex("tint.emberColour", d.tint.emberColour);
  share("tint.blend", d.tint.blend);
  share("tint.flickerDepth", d.tint.flickerDepth);
  share("tint.roughnessFloor", d.tint.roughnessFloor);
  number(FILE, "tint.emberIntensity", d.tint.emberIntensity, 0);
  number(FILE, "tint.flickerHz", d.tint.flickerHz, 0.01);
  closed(d.flame, [
    "puffs",
    "reducedPuffs",
    "width",
    "aspect",
    "cyclesPerSecond",
    "heightMin",
    "heightMax",
    "spread",
    "palette",
  ]);
  count(FILE, "flame.puffs", d.flame.puffs, 1, 8);
  count(FILE, "flame.reducedPuffs", d.flame.reducedPuffs, 1, d.flame.puffs);
  for (const k of ["width", "aspect", "cyclesPerSecond"]) number(FILE, `flame.${k}`, d.flame[k], 0.01);
  number(FILE, "flame.spread", d.flame.spread, 0);
  share("flame.heightMin", d.flame.heightMin);
  share("flame.heightMax", d.flame.heightMax);
  if (d.flame.heightMin > d.flame.heightMax) fail(FILE, "flame.heightMin must not exceed heightMax");
  if (!Array.isArray(d.flame.palette) || !d.flame.palette.length)
    fail(FILE, "flame.palette must list at least one colour");
  d.flame.palette.forEach((c) => hex("flame.palette", c));
  closed(d.smoke, [
    "puffs",
    "reducedPuffs",
    "startWidth",
    "endWidth",
    "aspect",
    "rise",
    "lifeSeconds",
    "drift",
    "opacity",
    "colour",
    "startHeightShare",
  ]);
  count(FILE, "smoke.puffs", d.smoke.puffs, 1, 10);
  count(FILE, "smoke.reducedPuffs", d.smoke.reducedPuffs, 1, d.smoke.puffs);
  for (const k of ["startWidth", "endWidth", "aspect", "lifeSeconds"]) number(FILE, `smoke.${k}`, d.smoke[k], 0.01);
  for (const k of ["rise", "drift"]) number(FILE, `smoke.${k}`, d.smoke[k], 0);
  share("smoke.opacity", d.smoke.opacity);
  share("smoke.startHeightShare", d.smoke.startHeightShare);
  hex("smoke.colour", d.smoke.colour);
  closed(d.texture, ["size", "falloffPower", "peakAlpha", "alphaTest", "renderOrder"]);
  count(FILE, "texture.size", d.texture.size, 2, 256);
  number(FILE, "texture.falloffPower", d.texture.falloffPower, 0.1);
  if (!(d.texture.peakAlpha >= 1 && d.texture.peakAlpha <= 255)) fail(FILE, "texture.peakAlpha must be 1 to 255");
  share("texture.alphaTest", d.texture.alphaTest);
  if (!Number.isInteger(d.texture.renderOrder)) fail(FILE, "texture.renderOrder must be an integer");
}
