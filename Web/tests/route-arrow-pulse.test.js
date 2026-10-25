import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import { arrowOpacity, ARROW_PULSE_SECONDS, ARROW_MIN_OPACITY, ARROW_TAIL_GAP } from "../src/engine/route-guidance.js";

test("the ground arrow's peak opacity is data, the loader rejects a bad one, and its colour is the drop marker's", () => {
  const peak = GAME_DATA.visual.routeArrow.peakOpacity;
  assert.ok(peak > 0 && peak <= 1);
  const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url))));
  assert.doesNotThrow(() => validateVisual(raw()));
  for (const bad of [0, 1.2, -0.1, "0.5"]) {
    const d = raw();
    d.routeArrow.peakOpacity = bad;
    assert.throws(() => validateVisual(d), `peakOpacity ${bad}`);
  }
  const d = raw();
  d.routeArrow.colour = "ffffff";
  assert.throws(() => validateVisual(d), "the arrow has no colour field of its own");
  const source = fs.readFileSync(new URL("../src/engine/route-guidance.js", import.meta.url), "utf8");
  assert.ok(source.includes("GAME_DATA.visual.dropMarker.ringColour") && !source.includes("0xf1d28c"));
});

test("the ground arrow's tail gap clears the player's radius with a margin", () => {
  assert.ok(ARROW_TAIL_GAP >= 0.6 && ARROW_TAIL_GAP <= 0.8);
  assert.ok(ARROW_TAIL_GAP >= 0.4 + 0.2);
});

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
