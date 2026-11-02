import { closed } from "./content-schema.js";
// The journal's rate and retention settings (engine/world-events.js WORLD_EVENT_RULES), from data/worldEvents.json `rules`. Checked with
// the rest of worldEvents.json. The wire schema itself (field lists, codes, flag bits) stays in world-events.js.
const fail = (why) => {
  throw TypeError(`Invalid game data worldEvents: rules.${why}`);
};
const whole = (field, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${field} must be an integer from ${min} to ${max}`);
};
export function validateWorldEventRules(r) {
  closed(r, ["moveEveryTicks", "retainEvents", "compactFactor"]);
  whole("moveEveryTicks", r.moveEveryTicks, 1, 600);
  whole("retainEvents", r.retainEvents, 1, 1000000);
  whole("compactFactor", r.compactFactor, 2, 64);
}
