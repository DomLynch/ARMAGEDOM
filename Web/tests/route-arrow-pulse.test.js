import test from "node:test";
import assert from "node:assert/strict";
import { arrowOpacity, ARROW_PULSE_SECONDS, ARROW_MIN_OPACITY } from "../src/engine/route-guidance.js";

test("the ground route arrow fades slowly between 0.35 and full opacity", () => {
  assert.ok(ARROW_PULSE_SECONDS >= 1.2 && ARROW_PULSE_SECONDS <= 1.5);
  assert.equal(ARROW_MIN_OPACITY, 0.35);
  assert.ok(Math.abs(arrowOpacity(0) - 1) < 1e-9, "full at the start of a cycle");
  assert.ok(Math.abs(arrowOpacity(ARROW_PULSE_SECONDS / 2) - 0.35) < 1e-9, "faded at half a cycle");
  assert.ok(Math.abs(arrowOpacity(ARROW_PULSE_SECONDS) - 1) < 1e-9, "periodic");
  for (let t = 0; t < 5; t += 0.05) {
    const o = arrowOpacity(t);
    assert.ok(o >= 0.35 - 1e-9 && o <= 1 + 1e-9);
  }
});
