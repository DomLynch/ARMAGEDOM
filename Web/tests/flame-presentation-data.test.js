import test from "node:test";
import assert from "node:assert/strict";
import { FLAME_PRESENTATION, validateFlamePresentation } from "../src/engine/flame-presentation-data.js";

// The numbers that were inline in engine/flame-presentation.js before they moved to visual.json `flamePresentation`.
test("the flamethrower pose keeps its pre-data numbers", () => {
  assert.deepEqual(FLAME_PRESENTATION, {
    mountOffset: { x: -0.01262174057948523, y: 0.07164552251435374, z: 0.014197067151910436 },
    pitchUpDegrees: 30,
  });
  assert.equal(-(Math.PI * FLAME_PRESENTATION.pitchUpDegrees) / 180, -Math.PI / 6, "30 degrees is the old minus pi over six, to the last bit");
});

test("a bad flamePresentation row is refused", () => {
  const bad = (edit) => {
    const copy = structuredClone(FLAME_PRESENTATION);
    edit(copy);
    assert.throws(() => validateFlamePresentation(copy));
  };
  bad((p) => (p.pitchUpDegrees = 0));
  bad((p) => (p.pitchUpDegrees = 90));
  bad((p) => (p.mountOffset.x = 2));
  bad((p) => (p.mountOffset.y = Number.NaN));
  bad((p) => (p.mountOffset.w = 0));
});
