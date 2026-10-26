import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";

test("effects.js feedback numbers live in visual.json and equal the old inline ones (phase 2b part 1)", () => {
  assert.deepEqual(GAME_DATA.visual.effects.feedback, {
    pools: { particles: 48, tracers: 16 },
    viewportFallback: { width: 852, height: 393 },
    lootGemRadius: 0.21,
    flameWidthScale: { witch: 2, salamander: 2 },
    tracer: { colour: "f5d498", opacity: 0.8, defaultSeconds: 0.065 },
    muzzleFlashColour: "ffedb0",
    particle: { palette: "ffca85", gravity: 8, minLife: 0.001, dimBase: 0.6, dimSpan: 0.4 },
    finisherDrop: { speedBase: 0.6, speedSpread: 0.4, speedStride: 7, liftShare: 0.1, liftCycle: 3, baseLift: 0.3, tailSpeedShare: 0.75, tailTravelShare: 0.65 },
  });
  assert.equal(Number("0xf5d498"), 16110744);
  assert.equal(Number("0xffedb0"), 0xffedb0);
  assert.equal(Number("0xffca85"), 0xffca85);
});

test("the effects.feedback validator rejects bad rows", () => {
  const raw = () => JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url)));
  assert.doesNotThrow(() => validateVisual(raw()));
  for (const mutate of [
    (f) => (f.extra = 1),
    (f) => (f.pools.particles = 0),
    (f) => (f.pools.tracers = 1.5),
    (f) => (f.tracer.colour = "F5D498"),
    (f) => (f.tracer.opacity = 0),
    (f) => (f.particle.dimBase = 0.9),
    (f) => (f.finisherDrop.liftCycle = 0),
    (f) => delete f.flameWidthScale,
  ]) {
    const d = raw();
    mutate(d.effects.feedback);
    assert.throws(() => validateVisual(d));
  }
});
