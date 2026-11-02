import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The journal atlas grid, the supply-case model scale and the guard-label reach (engine/expedition-runtime.js), from data/visual.json
// `expeditionHud`. Checked when this module loads. The atlas is drawn in SVG units: `cell` per card, `gutter` the strip outside the
// first and last column, `lanes` the two lines a long link uses between rows.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: expeditionHud.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
export function validateExpeditionHud(h) {
  closed(h, ["atlas", "caseScale", "guardLabelDistance"]);
  closed(h.atlas, ["cell", "gutter", "columns", "rows", "lanes"]);
  number("atlas.cell", h.atlas.cell, 1);
  number("atlas.gutter", h.atlas.gutter, 0);
  for (const f of ["columns", "rows"])
    if (!Number.isSafeInteger(h.atlas[f]) || h.atlas[f] < 3 || h.atlas[f] > 12) fail(`atlas.${f} must be an integer from 3 to 12`);
  const inside = (n) => Number.isFinite(n) && n > 0 && n < h.atlas.cell * h.atlas.rows;
  if (!Array.isArray(h.atlas.lanes) || h.atlas.lanes.length !== 2 || !h.atlas.lanes.every(inside))
    fail("atlas.lanes must hold two lines inside the grid");
  number("caseScale", h.caseScale, 0.001);
  number("guardLabelDistance", h.guardLabelDistance, 0.001);
}
validateExpeditionHud(GAME_DATA.visual.expeditionHud);
export const EXPEDITION_HUD = GAME_DATA.visual.expeditionHud;
