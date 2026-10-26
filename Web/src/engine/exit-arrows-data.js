import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The faint yellow ground arrow at each area exit (engine/exit-arrows.js), from data/visual.json `exitArrows`. The arrow's shape and
// colour are the route-guidance arrow's; these numbers only thin and fade it. Checked when this module loads.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: exitArrows.${why}`);
};
export function validateExitArrows(a) {
  closed(a, ["opacity", "widthScale", "lengthScale", "edgeBand", "roadInset", "bottomEdgeInset", "searchMetres", "directionSteps"]);
  if (!Number.isFinite(a.bottomEdgeInset) || a.bottomEdgeInset < a.roadInset || a.bottomEdgeInset > a.searchMetres)
    fail("bottomEdgeInset must run from roadInset to searchMetres metres");
  if (!Number.isSafeInteger(a.directionSteps) || a.directionSteps < 4 || a.directionSteps > 64) fail("directionSteps must be a whole number from 4 to 64");
  if (!Number.isFinite(a.searchMetres) || a.searchMetres < a.roadInset || a.searchMetres > 20) fail("searchMetres must run from roadInset to 20 metres");
  for (const f of ["opacity", "widthScale", "lengthScale"]) if (!(a[f] > 0 && a[f] <= 1)) fail(`${f} must be above 0 and at most 1`);
  if (!(a.edgeBand > 0 && a.edgeBand < 0.5)) fail("edgeBand must be above 0 and below 0.5 (a share of the painting)");
  if (!Number.isFinite(a.roadInset) || a.roadInset < 0 || a.roadInset > 3) fail("roadInset must be 0 to 3 metres");
}
validateExitArrows(GAME_DATA.visual.exitArrows);
export const EXIT_ARROWS = GAME_DATA.visual.exitArrows;
