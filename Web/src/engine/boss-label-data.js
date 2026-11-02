import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The boss and guard name label placement (engine/boss-label.js) from data/visual.json `bossLabel`: the clear border kept round the screen
// edge and the gap between the label and the silhouette, both in CSS pixels. Checked when this module loads; the key name is checked by
// game-data.js.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: bossLabel.${why}`);
};
export function validateBossLabel(l) {
  closed(l, ["marginPx", "gapPx"]);
  for (const f of ["marginPx", "gapPx"]) if (!Number.isFinite(l[f]) || l[f] < 0 || l[f] > 100) fail(`${f} must be a number from 0 to 100`);
}
validateBossLabel(GAME_DATA.visual.bossLabel);
export const BOSS_LABEL = GAME_DATA.visual.bossLabel;
