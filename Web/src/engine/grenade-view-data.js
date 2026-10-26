import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// Where a thrown grenade is aimed and how its flight is drawn (engine/grenade-surface.js, sticky-grenade-runtime.js), from data/visual.json
// `grenadeView`. Checked when this module loads. Metres and seconds. `groundHeight` is the aim and landing height over the ground;
// the fuse itself is the grenade payload's `fuseSeconds` in weapons.json.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: grenadeView.${why}`);
};
export function validateGrenadeView(v) {
  closed(v, ["groundHeight", "flightSeconds", "arcHeight"]);
  if (!Number.isFinite(v.groundHeight) || v.groundHeight < 0 || v.groundHeight > 2) fail("groundHeight must be 0 to 2 metres");
  if (!Number.isFinite(v.flightSeconds) || v.flightSeconds <= 0) fail("flightSeconds must be a finite number > 0");
  const fuse = GAME_DATA.weapons.ranged["standard-grenade-v1"].payload.fuseSeconds;
  if (v.flightSeconds > fuse) fail("flightSeconds must not exceed the grenade fuse");
  if (!Number.isFinite(v.arcHeight) || v.arcHeight < 0 || v.arcHeight > 10) fail("arcHeight must be 0 to 10 metres");
}
validateGrenadeView(GAME_DATA.visual.grenadeView);
export const GRENADE_VIEW = GAME_DATA.visual.grenadeView;
export const GRENADE_FUSE_SECONDS = GAME_DATA.weapons.ranged["standard-grenade-v1"].payload.fuseSeconds;
