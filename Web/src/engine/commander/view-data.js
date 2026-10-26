import { GAME_DATA } from "../game-data.js";
import { closed } from "../content-schema.js";
// The Commander battlefield view's presentation numbers (engine/commander/view.js), from data/commander.json `view`. They are checked
// when this module loads; the match rules beside them are checked by game-data.js. Metres unless a name says otherwise; colours are
// 6-digit hex strings and opacities are 0 to 1.
const fail = (why) => {
  throw TypeError(`Invalid game data commander: view.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail(`${field} must be 6 lowercase hex digits`);
};
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail(`${field} must be above 0 and at most 1`);
};
const ensureNumbers = (field, v, length) => {
  if (!Array.isArray(v) || v.length !== length || !v.every(Number.isFinite)) fail(`${field} must hold ${length} numbers`);
};
export function validateCommanderView(v) {
  closed(v, ["backdropSize", "startFocus", "fillLight", "sun", "actorScale", "unitRing", "objectiveRing", "pick", "diagnostics"]);
  ensureNumbers("backdropSize", v.backdropSize, 2);
  if (!v.backdropSize.every((n) => n > 0)) fail("backdropSize must be positive");
  closed(v.startFocus, ["x", "y"]);
  for (const f of ["x", "y"]) if (!(v.startFocus[f] >= 0 && v.startFocus[f] <= 1)) fail(`startFocus.${f} must be from 0 to 1`);
  closed(v.fillLight, ["sky", "ground", "intensity"]);
  hex("fillLight.sky", v.fillLight.sky);
  hex("fillLight.ground", v.fillLight.ground);
  number("fillLight.intensity", v.fillLight.intensity, 0);
  closed(v.sun, ["colour", "intensity", "position"]);
  hex("sun.colour", v.sun.colour);
  number("sun.intensity", v.sun.intensity, 0);
  ensureNumbers("sun.position", v.sun.position, 3);
  number("actorScale", v.actorScale, 0.001);
  const u = v.unitRing;
  closed(u, ["inner", "outer", "segments", "colour", "opacity", "selectedOpacity", "idleOpacity", "height"]);
  number("unitRing.inner", u.inner, 0.001);
  if (!(u.outer > u.inner)) fail("unitRing.outer must exceed inner");
  if (!Number.isSafeInteger(u.segments) || u.segments < 3 || u.segments > 128) fail("unitRing.segments must be an integer from 3 to 128");
  hex("unitRing.colour", u.colour);
  for (const f of ["opacity", "selectedOpacity", "idleOpacity"]) opacity(`unitRing.${f}`, u[f]);
  number("unitRing.height", u.height, 0);
  const o = v.objectiveRing;
  closed(o, ["width", "segments", "captureColour", "otherColour", "opacity", "height"]);
  number("objectiveRing.width", o.width, 0.001);
  if (!Number.isSafeInteger(o.segments) || o.segments < 3 || o.segments > 128) fail("objectiveRing.segments must be an integer from 3 to 128");
  hex("objectiveRing.captureColour", o.captureColour);
  hex("objectiveRing.otherColour", o.otherColour);
  opacity("objectiveRing.opacity", o.opacity);
  number("objectiveRing.height", o.height, 0);
  closed(v.pick, ["boxPadding"]);
  number("pick.boxPadding", v.pick.boxPadding, 0);
  closed(v.diagnostics, ["unitHeight", "opponentHeight"]);
  number("diagnostics.unitHeight", v.diagnostics.unitHeight, 0);
  number("diagnostics.opponentHeight", v.diagnostics.opponentHeight, 0);
}
validateCommanderView(GAME_DATA.commander.view);
export const COMMANDER_VIEW = GAME_DATA.commander.view;
