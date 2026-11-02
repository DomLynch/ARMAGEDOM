import { closed } from "./content-schema.js";
// visual.json `pickupFlash` (engine/pickup-flash.js): the brief gold glow at the screen edge when something is picked up. `seconds` is how
// long it takes to fade, `colour` a six-digit hex, `peakOpacity` the strongest edge opacity (0 to 1, kept subtle), `events` the game events
// that mean "the player picked something up". Called from validateVisual in game-data.js.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: pickupFlash.${why}`);
};
export function validatePickupFlash(d) {
  closed(d, ["seconds", "colour", "peakOpacity", "events"]);
  if (!Number.isFinite(d.seconds) || !(d.seconds > 0 && d.seconds <= 5)) fail("seconds must be above 0 and at most 5");
  if (!/^[0-9a-f]{6}$/i.test(d.colour)) fail("colour must be six hex digits");
  if (!Number.isFinite(d.peakOpacity) || !(d.peakOpacity > 0 && d.peakOpacity <= 1))
    fail("peakOpacity must be above 0 and at most 1");
  if (!Array.isArray(d.events) || !d.events.length || d.events.some((e) => typeof e !== "string" || !e))
    fail("events must be event names");
}
