import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// Where the water plane sits and how it is timed (engine/water-effect.js), from data/visual.json `waterEffect`.
// Checked when this module loads. The image size is the painted scene's pixel size; the plane is placed `planeDistance` metres from the camera.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: waterEffect.${why}`);
};
const positive = (field, v) => {
  if (!Number.isFinite(v) || v <= 0) fail(`${field} must be a finite number > 0`);
};
export function validateWaterEffect(w) {
  closed(w, ["imageWidth", "imageHeight", "ndcDepth", "planeDistance", "renderOrder", "maxStepSeconds"]);
  for (const f of ["imageWidth", "imageHeight", "planeDistance", "maxStepSeconds"]) positive(f, w[f]);
  if (!(w.ndcDepth >= 0 && w.ndcDepth <= 1)) fail("ndcDepth must be from 0 to 1");
  if (!Number.isSafeInteger(w.renderOrder)) fail("renderOrder must be an integer");
}
validateWaterEffect(GAME_DATA.visual.waterEffect);
export const WATER_EFFECT = GAME_DATA.visual.waterEffect;
