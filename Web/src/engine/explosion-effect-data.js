import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The shared explosion (engine/explosion-effect.js: rocket, boss rocket and grenade blasts) from data/visual.json `explosion`. Checked when
// this module loads; the key name is checked by game-data.js. Ratios multiply the blast radius in metres; seconds; colours are 6-digit
// lowercase hex strings; opacities are above 0 and at most 1.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: explosion.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const whole = (field, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${field} must be an integer from ${min} to ${max}`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail(`${field} must be 6 lowercase hex digits`);
};
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail(`${field} must be above 0 and at most 1`);
};
export function validateExplosionEffect(e) {
  closed(e, ["maxActive", "texture", "renderOrder", "groundLift", "goldenAngle", "flash", "fireball", "smoke", "sparks", "scorch"]);
  whole("maxActive", e.maxActive, 1, 8);
  closed(e.texture, ["size", "falloffPower"]);
  whole("texture.size", e.texture.size, 8, 128);
  number("texture.falloffPower", e.texture.falloffPower, 0.1);
  if (!Number.isInteger(e.renderOrder)) fail("renderOrder must be an integer");
  number("groundLift", e.groundLift, 0);
  number("goldenAngle", e.goldenAngle, 0.001);
  closed(e.flash, ["seconds", "diameterRatio", "colour", "lift"]);
  number("flash.seconds", e.flash.seconds, 0.001);
  number("flash.diameterRatio", e.flash.diameterRatio, 0.001);
  number("flash.lift", e.flash.lift, 0);
  hex("flash.colour", e.flash.colour);
  closed(e.fireball, [
    "lobes",
    "seconds",
    "startDiameterRatio",
    "peakDiameterRatio",
    "lobeShrink",
    "spreadRatio",
    "lift",
    "liftStep",
    "colourStart",
    "colourEnd",
    "opacity",
    "easePower",
    "fadePower",
  ]);
  whole("fireball.lobes", e.fireball.lobes, 1, 8);
  number("fireball.seconds", e.fireball.seconds, 0.001);
  for (const f of ["startDiameterRatio", "peakDiameterRatio", "spreadRatio", "lift", "liftStep"])
    number(`fireball.${f}`, e.fireball[f], 0);
  if (!(e.fireball.peakDiameterRatio > e.fireball.startDiameterRatio)) fail("fireball.peakDiameterRatio must exceed startDiameterRatio");
  if (!(e.fireball.lobeShrink > 0 && e.fireball.lobeShrink <= 1)) fail("fireball.lobeShrink must be above 0 and at most 1");
  hex("fireball.colourStart", e.fireball.colourStart);
  hex("fireball.colourEnd", e.fireball.colourEnd);
  opacity("fireball.opacity", e.fireball.opacity);
  number("fireball.easePower", e.fireball.easePower, 1);
  number("fireball.fadePower", e.fireball.fadePower, 0.1);
  closed(e.smoke, [
    "count",
    "seconds",
    "delay",
    "fadeInSeconds",
    "startDiameterRatio",
    "endDiameterRatio",
    "spreadRatio",
    "riseSpeed",
    "colour",
    "opacity",
  ]);
  whole("smoke.count", e.smoke.count, 1, 12);
  for (const f of ["seconds", "startDiameterRatio", "fadeInSeconds"]) number(`smoke.${f}`, e.smoke[f], 0.001);
  for (const f of ["delay", "spreadRatio", "riseSpeed"]) number(`smoke.${f}`, e.smoke[f], 0);
  if (!(e.smoke.endDiameterRatio > e.smoke.startDiameterRatio)) fail("smoke.endDiameterRatio must exceed startDiameterRatio");
  if (!(e.smoke.fadeInSeconds < e.smoke.seconds)) fail("smoke.fadeInSeconds must be shorter than seconds");
  hex("smoke.colour", e.smoke.colour);
  opacity("smoke.opacity", e.smoke.opacity);
  closed(e.sparks, [
    "count",
    "seconds",
    "speedRatio",
    "speedStep",
    "gravity",
    "sizeRatio",
    "liftRatio",
    "elevationMin",
    "elevationMax",
    "elevationStride",
    "colour",
  ]);
  whole("sparks.count", e.sparks.count, 1, 32);
  for (const f of ["seconds", "speedRatio", "sizeRatio"]) number(`sparks.${f}`, e.sparks[f], 0.001);
  for (const f of ["speedStep", "gravity", "liftRatio", "elevationMin"]) number(`sparks.${f}`, e.sparks[f], 0);
  if (!(e.sparks.elevationMax > e.sparks.elevationMin && e.sparks.elevationMax < 1.5)) // tuning-ok: bound, just under a right angle
    fail("sparks.elevationMax must exceed elevationMin and stay below 1.5 radians");
  if (!(e.sparks.elevationStride > 0 && e.sparks.elevationStride < 1)) fail("sparks.elevationStride must be above 0 and below 1");
  hex("sparks.colour", e.sparks.colour);
  closed(e.scorch, ["seconds", "fadeStart", "diameterRatio", "opacity", "colour"]);
  number("scorch.seconds", e.scorch.seconds, 0.001);
  if (!(e.scorch.fadeStart >= 0 && e.scorch.fadeStart < 1)) fail("scorch.fadeStart must be from 0 up to 1");
  number("scorch.diameterRatio", e.scorch.diameterRatio, 0.001);
  opacity("scorch.opacity", e.scorch.opacity);
  hex("scorch.colour", e.scorch.colour);
}
validateExplosionEffect(GAME_DATA.visual.explosion);
export const EXPLOSION = GAME_DATA.visual.explosion;
