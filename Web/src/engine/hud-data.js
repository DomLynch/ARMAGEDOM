import { closed } from "./content-schema.js";
// visual.json `hud` (hud.js): the cooldown shown on the Heavy and Dodge buttons until the game gives a ready time, the reach of the start
// pistol's "Equip pistol" prompt in metres, and the throw range shown for a grenade before the player picks one. Called from validateVisual in
// game-data.js; hud.js reads the row through GAME_DATA.visual.hud.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: hud.${why}`);
};
export function validateHud(h) {
  const fields = ["heavyFallbackSeconds", "dodgeFallbackSeconds", "pistolInteractRadius", "grenadeDefaultRange", "equipMessageSeconds"];
  closed(h, fields);
  for (const f of fields)
    if (!Number.isFinite(h[f]) || !(h[f] > 0)) fail(`${f} must be a finite number above 0`);
}
