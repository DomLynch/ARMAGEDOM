import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The gold ring at each area exit (engine/exit-rings.js), from data/visual.json `exitRings`. Where a ring stands comes from the exit's
// own condition in data/areas.json; `offsets` ("<from>><to>": metres east and ground-depth) nudges one exit's ring and may stay empty.
// Checked when this module loads.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: exitRings.${why}`);
};
const positive = (v) => Number.isFinite(v) && v > 0;
export function validateExitRings(r) {
  closed(r, ["inner", "outer", "segments", "colour", "opacity", "lockedColour", "lockedOpacity", "height", "anchor", "flatRotation", "offsets"]);
  if (!positive(r.inner) || !positive(r.outer) || r.inner >= r.outer) fail("inner must be above 0 and below outer (metres)");
  if (!Number.isSafeInteger(r.segments) || r.segments < 3 || r.segments > 128) fail("segments must be a whole number from 3 to 128");
  if (typeof r.colour !== "string" || !/^[0-9a-f]{6}$/i.test(r.colour)) fail("colour must be six hex digits");
  if (!(r.opacity > 0 && r.opacity <= 1)) fail("opacity must be above 0 and at most 1");
  if (typeof r.lockedColour !== "string" || !/^[0-9a-f]{6}$/i.test(r.lockedColour)) fail("lockedColour must be six hex digits");
  if (!(r.lockedOpacity > 0 && r.lockedOpacity <= 1)) fail("lockedOpacity must be above 0 and at most 1");
  if (!Number.isFinite(r.height) || r.height < 0) fail("height must be 0 or more metres");
  if (!r.anchor || !(r.anchor.x >= 0 && r.anchor.x <= 1 && r.anchor.y >= 0 && r.anchor.y <= 1))
    fail("anchor must be {x, y} shares from 0 to 1 of the exit zone");
  if (!Number.isFinite(r.flatRotation)) fail("flatRotation must be a number (radians)");
  if (!r.offsets || typeof r.offsets !== "object" || Array.isArray(r.offsets)) fail("offsets must be an object");
  for (const [key, o] of Object.entries(r.offsets)) {
    if (!/^[a-z0-9-]+>[a-z0-9-]+$/.test(key)) fail(`offsets key ${key} must be "<from>><to>"`);
    closed(o, ["x", "z"]);
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z)) fail(`offsets.${key} must be numbers`);
  }
}
validateExitRings(GAME_DATA.visual.exitRings);
export const EXIT_RINGS = GAME_DATA.visual.exitRings;
