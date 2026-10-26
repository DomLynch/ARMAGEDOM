import { GAME_DATA } from "./engine/game-data.js";
import { closed } from "./engine/content-schema.js";
// How the painted artwork maps to the ground and how walking steps against walls (world-geometry.js), from data/visual.json `worldGeometry`.
// Checked when this module loads. The image size is the painted scene's pixel size; distances are metres.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: worldGeometry.${why}`);
};
const positive = (field, v) => {
  if (!Number.isFinite(v) || v <= 0) fail(`${field} must be a finite number > 0`);
};
export function validateWorldGeometry(g) {
  closed(g, ["imageWidth", "imageHeight", "wallMargin", "defaultRadius", "stepRadiusShare", "minStep", "maxStep"]);
  for (const f of ["imageWidth", "imageHeight", "wallMargin", "defaultRadius", "stepRadiusShare", "minStep", "maxStep"]) positive(f, g[f]);
  if (g.minStep > g.maxStep) fail("minStep must not exceed maxStep");
}
validateWorldGeometry(GAME_DATA.visual.worldGeometry);
export const WORLD_GEOMETRY = GAME_DATA.visual.worldGeometry;
