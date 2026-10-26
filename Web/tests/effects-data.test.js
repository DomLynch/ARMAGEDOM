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
    events: {
      railgun: { seconds: 0.16, colour: "ffcb72", flashScale: [0.25, 0.25, 0.35], flashSeconds: 0.06 },
      warningColour: "ffbd62",
      attackColours: { specialKind: 3, special: "f9a83b", other: "e45735" },
      confirmationSeconds: 0.2,
      lineSeconds: 0.12,
      lowLine: { biteReach: 0.6, dogBiteReach: 0.9, otherReach: 1.2, roachBiteHeight: 0.159, dogBiteHeight: 1.05, midSlashShare: 0.7, midSlashScaleFallback: 1.6729625, height: 0.15 },
      special: { reach: 1.3, combatScaleFallback: 1.265, height: 1.1 },
      stab: { height: 1.1, length: 1.8, opacity: 0.85 },
      melee: { specialReach: 4.2, heavyReach: 1.8, slashReach: 1.5, arc: 120, height: 1.1 },
      defence: { reach: 1.05, arc: 120, seconds: 0.18, colours: { parry: "76d4df", block: "c4a665", break: "e95737" } },
    },
    shot: { originHeight: 1.05, flash: { high: { scale: [0.4, 0.35, 0.43], seconds: 0.06 }, low: { scale: [0.25, 0.22, 0.27], seconds: 0.045 } } },
    hitMarker: { sideMargin: 36, topMax: 220, topShare: 0.32, bottomShare: 0.7 },
    pickupPulse: { base: 2.4, swing: 1.2, rate: 4, phoneWidth: 480, phoneScale: 2 },
    cue: {
      edgeMargin: 52,
      minViewport: 53,
      clampZ: 0.99,
      pixels: { target: 24, ground: 16 },
      fallbackScale: { target: 0.6, ground: 0.2 },
      opacity: { readyTarget: 0.95, ready: 0.75, notReady: 0.65 },
      outlineOpacity: 0.9,
    },
    loot: { spinRate: 1.5, height: 0.3 },
    audio: {
      frequencies: { attack: 180, hit: 95, parry: 660, block: 260, dodge: 120, loot: 880, death: 55, wave: 330 },
      seconds: { death: 0.25, other: 0.08 },
      sineEvents: ["loot", "parry"],
      minFrequency: 30,
      rampShare: 0.55,
      gain: 0.035,
      gainEnd: 0.001,
    },
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
    (f) => (f.events.railgun.colour = "nothex"),
    (f) => (f.events.railgun.flashScale = [1, 2]),
    (f) => (f.events.defence.colours.extra = "ffffff"),
    (f) => (f.cue.opacity.ready = 2),
    (f) => (f.audio.sineEvents = ["nope"]),
    (f) => (f.audio.frequencies.hit = 0),
    (f) => delete f.hitMarker,
  ]) {
    const d = raw();
    mutate(d.effects.feedback);
    assert.throws(() => validateVisual(d));
  }
});
