import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The secondary-tap click fallback (engine/tap-fallback.js) from data/visual.json `tapFallback`: how long it waits for the browser's own
// click (milliseconds) and how far a finger may move and still be a tap (pixels). Checked when this module loads; the key name is checked by
// game-data.js. A caller may still pass its own values (the tests do).
const fail = (why) => {
  throw TypeError(`Invalid game data visual: tapFallback.${why}`);
};
export function validateTapFallback(t) {
  closed(t, ["graceMs", "slopPx"]);
  for (const f of ["graceMs", "slopPx"]) if (!Number.isFinite(t[f]) || !(t[f] > 0)) fail(`${f} must be a finite number above 0`);
}
validateTapFallback(GAME_DATA.visual.tapFallback);
export const TAP_FALLBACK = GAME_DATA.visual.tapFallback;
