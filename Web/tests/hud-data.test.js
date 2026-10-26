import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateHud } from "../src/engine/hud-data.js";

// The numbers that were inline in hud.js and motion.js before they moved to visual.json `hud` and `motion.armBendDrop`.
test("the HUD and the arm bend keep their pre-data numbers", () => {
  assert.deepEqual(GAME_DATA.visual.hud, { heavyFallbackSeconds: 1.6, dodgeFallbackSeconds: 1.05, pistolInteractRadius: 1.3, grenadeDefaultRange: 5 });
  assert.equal(GAME_DATA.visual.motion.armBendDrop, 0.5);
});

test("a bad hud row is refused", () => {
  for (const edit of [(h) => (h.heavyFallbackSeconds = 0), (h) => (h.pistolInteractRadius = Number.NaN), (h) => (h.grenadeDefaultRange = -1), (h) => (h.extra = 1)]) {
    const copy = structuredClone(GAME_DATA.visual.hud);
    edit(copy);
    assert.throws(() => validateHud(copy));
  }
});
