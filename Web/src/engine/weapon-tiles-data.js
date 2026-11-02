import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The weapon tile strip (engine/weapon-tiles.js) from data/visual.json `weaponTiles`: the pistol's "of N" in the ammo line, how far a finger
// may move and still be a tap, how long a new weapon flashes the strip and an empty-weapon message stays, and the paging of the strip (tiles
// per page, pixels per page). Checked when this module loads; the key name is checked by game-data.js.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: weaponTiles.${why}`);
};
const whole = (field, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${field} must be an integer from ${min} to ${max}`);
};
const positive = (field, v) => {
  if (!Number.isFinite(v) || !(v > 0)) fail(`${field} must be a finite number above 0`);
};
export function validateWeaponTiles(t) {
  closed(t, ["pistolCapacity", "tapSlopPx", "flashSeconds", "emptyMessageSeconds", "pageSize", "pageWidthPx"]);
  whole("pistolCapacity", t.pistolCapacity, 1, 99);
  positive("tapSlopPx", t.tapSlopPx);
  positive("flashSeconds", t.flashSeconds);
  positive("emptyMessageSeconds", t.emptyMessageSeconds);
  whole("pageSize", t.pageSize, 1, 8);
  positive("pageWidthPx", t.pageWidthPx);
}
validateWeaponTiles(GAME_DATA.visual.weaponTiles);
export const WEAPON_TILES = GAME_DATA.visual.weaponTiles;
