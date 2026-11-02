import { closed } from "./content-schema.js";
// The movement trace's settings (engine/movement-trace.js), from data/diagnostics.json `movementTrace`. Checked with the rest of
// diagnostics.json. Metres, seconds and counts; `answerEpsilon` and `stalledIntent` are the smallest distances that count as a move.
const fail = (why) => {
  throw TypeError(`Invalid game data diagnostics: movementTrace.${why}`);
};
const whole = (field, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${field} must be an integer from ${min} to ${max}`);
};
const positive = (field, v) => {
  if (!Number.isFinite(v) || v <= 0) fail(`${field} must be a finite number > 0`);
};
export function validateMovementTrace(t) {
  closed(t, ["capacity", "answerEpsilon", "stalledIntent", "nearbyMetres", "paintSeconds", "nearestEdges", "commitChars", "decimals"]);
  whole("capacity", t.capacity, 1, 100000);
  for (const f of ["answerEpsilon", "stalledIntent", "nearbyMetres", "paintSeconds"]) positive(f, t[f]);
  whole("nearestEdges", t.nearestEdges, 1, 16);
  whole("commitChars", t.commitChars, 1, 40);
  whole("decimals", t.decimals, 0, 6);
}
