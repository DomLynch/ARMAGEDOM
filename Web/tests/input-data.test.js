import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateInput, validateTouchTarget } from "../src/engine/input-data.js";

// The numbers that were inline in input.js and engine/touch-target.js before they moved to visual.json `input` and `touchTarget`.
test("input feel and the touch-target padding keep their pre-data numbers", () => {
  assert.deepEqual(GAME_DATA.visual.input, {
    knobPadPx: 106,
    knobTravelShare: 0.34,
    stickRadiusPx: 46,
    runTilt: 1.4,
    aimStartPx: 12,
    doubleTapMs: 350,
    worldTapMaxMs: 350,
    worldTapSlopPx: 10,
  });
  assert.deepEqual(GAME_DATA.visual.touchTarget, { paddingPx: 8 });
  assert.equal(Math.round(106 * GAME_DATA.visual.input.knobTravelShare), 36, "the old 106 px pad still gives 36 px of knob travel");
});

test("a bad input or touchTarget row is refused", () => {
  const bad = (name, check, edit) => {
    const copy = structuredClone(GAME_DATA.visual[name]);
    edit(copy);
    assert.throws(() => check(copy));
  };
  bad("input", validateInput, (i) => (i.stickRadiusPx = 0));
  bad("input", validateInput, (i) => (i.knobTravelShare = 1.5));
  bad("input", validateInput, (i) => (i.runTilt = 1));
  bad("input", validateInput, (i) => (i.doubleTapMs = Number.NaN));
  bad("input", validateInput, (i) => (i.extra = 1));
  bad("touchTarget", validateTouchTarget, (t) => (t.paddingPx = -1));
});
