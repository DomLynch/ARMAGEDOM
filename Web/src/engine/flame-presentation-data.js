import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The flamethrower's held pose (engine/flame-presentation.js) from data/visual.json `flamePresentation`: Art's one measured offset of the
// flamethrower inside its mount (metres, in the mount's own axes) and how far above level the barrel may tilt (degrees). Checked when this
// module loads; the key name is checked by game-data.js.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: flamePresentation.${why}`);
};
export function validateFlamePresentation(p) {
  closed(p, ["mountOffset", "pitchUpDegrees"]);
  closed(p.mountOffset, ["x", "y", "z"]);
  for (const axis of ["x", "y", "z"])
    if (!Number.isFinite(p.mountOffset[axis]) || Math.abs(p.mountOffset[axis]) > 1) fail(`mountOffset.${axis} must be a finite number within 1 metre`);
  if (!(Number.isFinite(p.pitchUpDegrees) && p.pitchUpDegrees > 0 && p.pitchUpDegrees < 90)) fail("pitchUpDegrees must be above 0 and below 90");
}
validateFlamePresentation(GAME_DATA.visual.flamePresentation);
export const FLAME_PRESENTATION = GAME_DATA.visual.flamePresentation;
