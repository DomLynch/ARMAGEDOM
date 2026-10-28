import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateQualityTier } from "../src/engine/game-data-quality.js";
import { createQualityTier, QUALITY } from "../src/engine/quality-tier.js";
import { createOffscreenThrottle } from "../src/engine/offscreen-actors.js";

const rules = GAME_DATA.qualityTier;
const [full, mid, low] = rules.tiers;
const strong = { cores: 8, memoryGb: 8, textureSize: 16384, devicePixelRatio: 2 };
const weak = { cores: 4, memoryGb: 2, textureSize: 4096, devicePixelRatio: 3 };

test("the tier data validates and bad rows are refused", () => {
  validateQualityTier(rules);
  for (const bad of [
    { ...rules, extra: 1 },
    { ...rules, tiers: [{ ...mid }] },
    { ...rules, tiers: [full, { ...mid, weakSignals: 0 }] },
    { ...rules, tiers: [full, { ...mid, pixelRatio: 0.5 }] },
    { ...rules, tiers: [full, { ...mid, name: rules.autoValue }] },
    { ...rules, signals: [{ name: "cores", weak: "sideways", limit: 4 }] },
  ])
    assert.throws(() => validateQualityTier(bad));
});

test("the unit test environment and a strong device both stay on the full tier", () => {
  assert.equal(QUALITY.row(), full);
  const q = createQualityTier(rules, "");
  q.probe(strong);
  assert.equal(q.row().name, full.name);
  q.probe({});
  assert.equal(q.cap(3, "ragdolls"), 3);
});

test("a device that does not report a signal is not counted weak for it", () => {
  const q = createQualityTier(rules, "");
  q.probe({ cores: weak.cores, memoryGb: undefined, textureSize: strong.textureSize });
  assert.equal(q.row().name, full.name, "one weak signal is not enough");
});

test("weak signals pick the mid and low tiers and tell listeners", () => {
  const q = createQualityTier(rules, ""),
    seen = [];
  q.onChange((row) => seen.push(row.name));
  q.probe({ cores: weak.cores, memoryGb: weak.memoryGb });
  assert.equal(q.row().name, mid.name);
  q.probe(weak);
  assert.equal(q.row().name, low.name);
  assert.deepEqual(seen, [mid.name, low.name]);
  assert.equal(q.cap(3, "ragdolls"), low.ragdolls);
  assert.equal(q.ragdollRows({ max_simultaneous_ragdolls: 3 }).max_simultaneous_ragdolls, low.ragdolls);
  assert.equal(q.ragdollRows({ max_simultaneous_ragdolls: 1 }).max_simultaneous_ragdolls, 1, "never raises the data cap");
});

test("the frame-time sample lowers the tier once, after warmup, and ignores stalls", () => {
  const q = createQualityTier(rules, ""),
    { warmupFrames, sampleFrames, maxFrameMs } = rules.probe;
  q.probe({ cores: weak.cores, memoryGb: weak.memoryGb });
  let ms = 0;
  const tick = (step) => q.frame((ms += step));
  tick(1);
  for (let i = 0; i < warmupFrames; i++) tick(maxFrameMs - 1);
  tick(maxFrameMs + 1);
  assert.equal(q.row().name, mid.name, "warmup and a stall do not count");
  for (let i = 0; i < sampleFrames; i++) tick(rules.signals.find((s) => s.name === "frameMs").limit + 1);
  assert.equal(q.row().name, low.name, "a slow median adds the third weak signal");
});

test("a fast frame sample changes nothing", () => {
  const q = createQualityTier(rules, "");
  q.probe(strong);
  let ms = 0;
  for (let i = 0; i < rules.probe.warmupFrames + rules.probe.sampleFrames + 2; i++) q.frame((ms += 1000 / 60));
  assert.equal(q.row().name, full.name);
});

test("the address can force a tier or the full tier, and the data can switch the tier off", () => {
  const forcedLow = createQualityTier(rules, `?${rules.param}=${low.name}`);
  assert.equal(forcedLow.row().name, low.name);
  const forcedFull = createQualityTier(rules, `?${rules.param}=${full.name}`);
  forcedFull.probe(weak);
  assert.equal(forcedFull.row().name, full.name, "forcing full is the off switch");
  const auto = createQualityTier(rules, `?${rules.param}=${rules.autoValue}`);
  auto.probe(weak);
  assert.equal(auto.row().name, low.name);
  const off = createQualityTier({ ...rules, enabled: false }, "");
  off.probe(weak);
  assert.equal(off.row().name, full.name);
});

test("a weak tier shortens the distances the off-screen throttle and the LOD see", () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 5, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const t = createOffscreenThrottle(THREE, GAME_DATA.offscreenActors),
    spots = new Set(),
    view = () => ({ root: new THREE.Group(), shadow: new THREE.Mesh() }),
    near = GAME_DATA.offscreenActors.shadowMaxDistance * (low.shadowScale + full.shadowScale) * 0.5,
    entity = { id: 1, pos: { x: 0, z: near }, radius: 0.5, rig: "none", hp: 5 };
  t.begin(camera, { x: 0, z: 0 });
  const fullView = view();
  t.skip(entity, fullView, 0.016);
  spots.add(fullView.shadow.visible);
  const row = QUALITY.row;
  QUALITY.row = () => low;
  try {
    const lowView = view();
    t.skip(entity, lowView, 0.016);
    spots.add(lowView.shadow.visible);
  } finally {
    QUALITY.row = row;
  }
  assert.deepEqual([...spots].sort(), [false, true], "the blob shadow drawn on the full tier is dropped on the low tier at the same spot");
});
