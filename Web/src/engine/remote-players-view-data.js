import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// How the other players' plain figures and name tags are drawn (engine/remote-players-view.js), from data/visual.json `remotePlayers`.
// Checked when this module loads. Metres unless a name says otherwise; the tag card is in canvas pixels.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: remotePlayers.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const whole = (field, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${field} must be an integer from ${min} to ${max}`);
};
const ensureNumbers = (field, v, length) => {
  if (!Array.isArray(v) || v.length !== length || !v.every((n) => Number.isFinite(n) && n >= 0)) fail(`${field} must hold ${length} non-negative numbers`);
};
export function validateRemotePlayers(r) {
  closed(r, ["capsule", "head", "tag"]);
  closed(r.capsule, ["bodyHeight", "radius", "capSegments", "radialSegments", "saturation", "lightness", "hueStep"]);
  number("capsule.bodyHeight", r.capsule.bodyHeight, 0.001);
  number("capsule.radius", r.capsule.radius, 0.001);
  whole("capsule.capSegments", r.capsule.capSegments, 1, 64);
  whole("capsule.radialSegments", r.capsule.radialSegments, 3, 64);
  for (const f of ["saturation", "lightness"]) if (!(r.capsule[f] >= 0 && r.capsule[f] <= 1)) fail(`capsule.${f} must be from 0 to 1`);
  whole("capsule.hueStep", r.capsule.hueStep, 1, 359);
  closed(r.head, ["radius", "widthSegments", "heightSegments"]);
  number("head.radius", r.head.radius, 0.001);
  whole("head.widthSegments", r.head.widthSegments, 3, 64);
  whole("head.heightSegments", r.head.heightSegments, 2, 64);
  closed(r.tag, ["height", "scale", "canvas", "band", "textX", "textY", "fonts"]);
  number("tag.height", r.tag.height, 0);
  ensureNumbers("tag.scale", r.tag.scale, 2);
  ensureNumbers("tag.canvas", r.tag.canvas, 2);
  ensureNumbers("tag.band", r.tag.band, 4);
  number("tag.textX", r.tag.textX, 0);
  number("tag.textY", r.tag.textY, 0);
  if (!Array.isArray(r.tag.fonts) || r.tag.fonts.length !== 1 || !/^(bold )?\d+px [a-z-]+$/.test(r.tag.fonts[0]))
    fail("tag.fonts must hold one CSS font string");
}
validateRemotePlayers(GAME_DATA.visual.remotePlayers);
export const REMOTE_PLAYERS = GAME_DATA.visual.remotePlayers;
