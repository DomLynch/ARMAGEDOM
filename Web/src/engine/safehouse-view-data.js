import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The safehouse view's presentation numbers (engine/safehouse-view.js), from data/visual.json `safehouseView`. They are checked when
// this module loads; the rest of visual.json is checked by game-data.js. Opacities are 0 to 1, colours are 6-digit hex strings, outline
// points are fractions of a prop's registered bounds (x across, y down).
const fail = (why) => {
  throw TypeError(`Invalid game data visual: safehouseView.${why}`);
};
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail(`${field} must be above 0 and at most 1`);
};
const ensureInteger = (field, v) => {
  if (!Number.isSafeInteger(v)) fail(`${field} must be an integer`);
};
export function validateSafehouseView(v) {
  closed(v, ["cue", "patchRenderOrder", "contour", "amountDigits", "silhouettes"]);
  closed(v.cue, ["period", "reducedOpacity", "pulseExponent", "floor"]);
  if (!(v.cue.period > 0)) fail("cue.period must be above 0");
  opacity("cue.reducedOpacity", v.cue.reducedOpacity);
  if (!(v.cue.pulseExponent >= 1)) fail("cue.pulseExponent must be at least 1");
  closed(v.cue.floor, ["selected", "near", "idle"]);
  for (const f of ["selected", "near", "idle"]) opacity(`cue.floor.${f}`, v.cue.floor[f]);
  ensureInteger("patchRenderOrder", v.patchRenderOrder);
  closed(v.contour, ["colour", "linewidth", "opacity", "renderOrder"]);
  if (typeof v.contour.colour !== "string" || !/^[0-9a-f]{6}$/.test(v.contour.colour)) fail("contour.colour must be 6 lowercase hex digits");
  if (!(v.contour.linewidth > 0)) fail("contour.linewidth must be above 0");
  opacity("contour.opacity", v.contour.opacity);
  ensureInteger("contour.renderOrder", v.contour.renderOrder);
  if (!Number.isSafeInteger(v.amountDigits) || v.amountDigits < 0 || v.amountDigits > 6) fail("amountDigits must be an integer from 0 to 6");
  closed(v.silhouettes, ["locker", "comms", "map"]);
  for (const [id, points] of Object.entries(v.silhouettes)) {
    const ok = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
    if (!Array.isArray(points) || points.length < 3 || !points.every(ok)) fail(`silhouettes.${id} must hold 3 or more [x, y] points from 0 to 1`);
  }
}
validateSafehouseView(GAME_DATA.visual.safehouseView);
export const SAFEHOUSE_VIEW = GAME_DATA.visual.safehouseView;
