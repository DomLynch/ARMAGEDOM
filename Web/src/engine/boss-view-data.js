import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// Presentation numbers of the boss view (engine/boss-view.js: name-label range and the area-hazard patch), from data/visual.json
// `bossView`. They are checked when this module loads. Metres and seconds unless a name says otherwise; colours are 6-digit hex strings
// and opacities are 0 to 1.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: bossView.${why}`);
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
export function validateBossView(v) {
  closed(v, ["labelRange", "hazard"]);
  number("labelRange", v.labelRange, 0.001);
  const h = v.hazard;
  closed(h, ["ringInner", "segments", "height", "initialFillOpacity", "initialEdgeOpacity", "warning", "active"]);
  if (!(h.ringInner > 0 && h.ringInner < 1)) fail("hazard.ringInner must be above 0 and below 1");
  if (!Number.isSafeInteger(h.segments) || h.segments < 3 || h.segments > 128) fail("hazard.segments must be an integer from 3 to 128");
  number("hazard.height", h.height, 0);
  opacity("hazard.initialFillOpacity", h.initialFillOpacity);
  opacity("hazard.initialEdgeOpacity", h.initialEdgeOpacity);
  closed(h.warning, ["colour", "fillOpacity", "edgeBase", "edgeSwing", "pulseRate"]);
  hex("hazard.warning.colour", h.warning.colour);
  opacity("hazard.warning.fillOpacity", h.warning.fillOpacity);
  number("hazard.warning.edgeBase", h.warning.edgeBase, 0);
  number("hazard.warning.edgeSwing", h.warning.edgeSwing, 0);
  number("hazard.warning.pulseRate", h.warning.pulseRate, 0);
  if (!(h.warning.edgeBase + h.warning.edgeSwing <= 1)) fail("hazard.warning edgeBase plus edgeSwing must be at most 1");
  closed(h.active, ["colour", "fillOpacity", "edgeOpacity"]);
  hex("hazard.active.colour", h.active.colour);
  opacity("hazard.active.fillOpacity", h.active.fillOpacity);
  opacity("hazard.active.edgeOpacity", h.active.edgeOpacity);
}
validateBossView(GAME_DATA.visual.bossView);
export const BOSS_VIEW = GAME_DATA.visual.bossView;
