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
    burst: {
      counts: { off: 1, low: 3, killed: 12, hit: 8 },
      lifeSeconds: { off: 0.12, killed: 0.42, hit: 0.3 },
      sizes: { off: 0.14, low: 0.055, killed: 0.16, hit: 0.12 },
      spread: 1.8,
      liftBase: 1.3,
      liftStep: 0.7,
      liftCycle: 3,
    },
    pickupGun: { tilt: 0.45, height: 0.15, scale: 1.8, contourColour: "f1d28c" },
    reticle: {
      barLength: 0.42,
      barThickness: 0.055,
      outlinePad: 0.06,
      cornerNear: 0.39,
      cornerFar: 0.5,
      cornerLength: 0.22,
      cornerThickness: 0.045,
      outlineColour: "161b1d",
      cueColour: "f2eee4",
      accentColour: "dca64d",
      accentTriangle: [-0.13, 0.1, 0, 0, -0.1, 0, 0.13, 0.1, 0],
      accentY: 0.76,
      renderOrders: { outline: 101, cue: 102, accent: 103 },
    },
    line: { defaultHeight: 0.08, ringArcDegrees: 359, steps: 36, opacity: 0.9 },
    frame: { maxStep: 0.05, recoilDecay: 12, recoilSettle: 0.001, offRecoilShare: 0.2 },
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
