import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { TAP_FALLBACK, validateTapFallback } from "../src/engine/tap-fallback-data.js";
import { HINT_SECONDS } from "../src/first-time-hints.js";

// The numbers that were inline in engine/tap-fallback.js and first-time-hints.js before they moved to visual.json.
test("the tap fallback and the hint duration keep their pre-data numbers", () => {
  assert.deepEqual(TAP_FALLBACK, { graceMs: 80, slopPx: 10 });
  assert.equal(HINT_SECONDS, 5);
  assert.deepEqual(GAME_DATA.visual.firstTimeHints, { seconds: 5 });
});

test("a bad tapFallback row is refused", () => {
  for (const edit of [(t) => (t.graceMs = 0), (t) => (t.slopPx = Number.NaN), (t) => (t.slopPx = -1), (t) => (t.extra = 1)]) {
    const copy = structuredClone(TAP_FALLBACK);
    edit(copy);
    assert.throws(() => validateTapFallback(copy));
  }
});
