import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateQualityTier } from "../src/engine/game-data-quality.js";
import { createQualityTier, exposeQualityTier, QUALITY } from "../src/engine/quality-tier.js";
import { createOffscreenThrottle } from "../src/engine/offscreen-actors.js";

const rules = GAME_DATA.qualityTier;
const [full, mid, low] = rules.tiers;
const frameLimit = rules.signals.find((s) => s.name === "frameMs").limit;
const strong = { cores: 8, memoryGb: 8, textureSize: 16384 };
const iphone = { cores: 6, textureSize: 16384 }; // Safari reports no deviceMemory; its pixel ratio (3) is not a signal at all
const weak = { cores: 4, memoryGb: 2, textureSize: 4096 };
const soft = { cores: 4, memoryGb: 2, textureSize: 16384 };
const thirtyFps = 1000 / 30;

// Feeds a tier enough real frames (warmup and sample) of a steady frame time.
function runFrames(q, step, extra = 0) {
  let ms = 0;
  q.frame((ms += 1));
  for (let i = 0; i < rules.probe.warmupFrames + rules.probe.sampleFrames + extra; i++) q.frame((ms += step));
}

test("the tier data validates and bad rows are refused", () => {
  validateQualityTier(rules);
  for (const bad of [
    { ...rules, extra: 1 },
    { ...rules, tiers: [{ ...mid }] },
    { ...rules, tiers: [full, { ...mid, weakSignals: 0 }] },
    { ...rules, tiers: [full, { ...mid, weakSignals: 1 }] },
    { ...rules, tiers: [full, { ...mid, pixelRatio: 0.5 }] },
    { ...rules, tiers: [full, { ...mid, name: rules.autoValue }] },
    { ...rules, signals: [{ name: "cores", weak: "sideways", limit: 4 }] },
    { ...rules, globalName: 5 },
  ])
    assert.throws(() => validateQualityTier(bad));
});

test("pixel ratio is not a signal and the frame limit sits far above a 30 fps cap", () => {
  assert.ok(!rules.signals.some((s) => /pixel/i.test(s.name)));
  assert.ok(frameLimit > thirtyFps * 1.2);
  assert.ok(rules.tiers.slice(1).every((t) => t.weakSignals >= 2));
});

test("the unit test environment and a strong device both stay on the full tier", () => {
  assert.equal(QUALITY.row(), full);
  const q = createQualityTier(rules, "");
  q.probe(strong);
  assert.equal(q.row().name, full.name);
  assert.equal(q.cap(3, "ragdolls"), 3);
});

test("an iPhone-like device (6 cores, no deviceMemory, pixel ratio 3, rAF capped at 30 fps) stays on full", () => {
  const q = createQualityTier(rules, "");
  q.probe(iphone);
  runFrames(q, thirtyFps, 20);
  assert.equal(q.row().name, full.name);
  assert.deepEqual(q.report().reasons, []);
});

test("one weak signal is never enough, and a signal the device does not report is not counted", () => {
  const q = createQualityTier(rules, "");
  q.probe({ cores: weak.cores, memoryGb: undefined, textureSize: strong.textureSize });
  assert.equal(q.row().name, full.name);
});

test("a genuinely weak device lands on low and tells listeners and the report why", () => {
  const q = createQualityTier(rules, ""),
    seen = [];
  q.onChange((row) => seen.push(row.name));
  q.probe(soft);
  assert.equal(q.row().name, mid.name, "two weak hardware signals is the mid tier");
  runFrames(q, frameLimit + 5);
  assert.equal(q.row().name, low.name, "a sustained slow median adds a third weak signal");
  assert.deepEqual(seen, [mid.name, low.name]);
  assert.equal(q.cap(3, "ragdolls"), low.ragdolls);
  assert.equal(q.ragdollRows({ max_simultaneous_ragdolls: 3 }).max_simultaneous_ragdolls, low.ragdolls);
  assert.equal(q.ragdollRows({ max_simultaneous_ragdolls: 1 }).max_simultaneous_ragdolls, 1, "never raises the data cap");
  const report = q.report();
  assert.equal(report.tier, low.name);
  assert.deepEqual(report.reasons, ["cores", "memoryGb", "frameMs"]);
  const hardware = createQualityTier(rules, "");
  hardware.probe(weak);
  assert.equal(hardware.row().name, low.name, "three weak hardware signals alone are the low tier");
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.reasons));
});

test("the frame sample ignores warmup, stalls and a few slow frames", () => {
  const q = createQualityTier(rules, ""),
    { warmupFrames, maxFrameMs } = rules.probe;
  q.probe({ cores: weak.cores, memoryGb: weak.memoryGb });
  assert.equal(q.row().name, mid.name);
  let ms = 0;
  q.frame((ms += 1));
  for (let i = 0; i < warmupFrames; i++) q.frame((ms += maxFrameMs - 1));
  q.frame((ms += maxFrameMs + 1));
  for (let i = 0; i < rules.probe.sampleFrames; i++) q.frame((ms += i % 5 ? 16 : frameLimit + 20));
  assert.equal(q.row().name, mid.name, "warmup, a stall and a minority of slow frames do not count");
});

test("the probe runs once: a second probe (a resize asks again) changes nothing and the tier never moves up", () => {
  const q = createQualityTier(rules, "");
  q.probe(soft);
  assert.equal(q.row().name, mid.name);
  q.probe(strong);
  assert.equal(q.row().name, mid.name, "a later, better probe is ignored");
  assert.equal(q.report().values.cores, soft.cores);
  runFrames(q, 1000 / 60, 5);
  assert.equal(q.row().name, mid.name, "a fast sample after a weak probe does not raise the tier");
  const fresh = createQualityTier(rules, "");
  fresh.probe(strong);
  fresh.probe(weak);
  assert.equal(fresh.row().name, full.name, "the first probe wins either way");
});

test("a fast frame sample changes nothing", () => {
  const q = createQualityTier(rules, "");
  q.probe(strong);
  runFrames(q, 1000 / 60, 2);
  assert.equal(q.row().name, full.name);
});

test("the address can force a tier or the full tier, and the data can switch the tier off", () => {
  const forcedLow = createQualityTier(rules, `?${rules.param}=${low.name}`);
  assert.equal(forcedLow.row().name, low.name);
  assert.equal(forcedLow.report().how, "forced");
  const forcedFull = createQualityTier(rules, `?${rules.param}=${full.name}`);
  forcedFull.probe(weak);
  assert.equal(forcedFull.row().name, full.name, "forcing full is the off switch");
  const auto = createQualityTier(rules, `?${rules.param}=${rules.autoValue}`);
  auto.probe(weak);
  runFrames(auto, frameLimit + 5);
  assert.equal(auto.row().name, low.name);
  const off = createQualityTier({ ...rules, enabled: false }, "");
  off.probe(weak);
  assert.equal(off.row().name, full.name);
});

test("the tier and its reasons are exposed on a read-only global named in the data", () => {
  const target = {},
    q = exposeQualityTier(createQualityTier(rules, ""), rules, target);
  q.probe(soft);
  assert.equal(target[rules.globalName].tier, mid.name);
  assert.deepEqual(target[rules.globalName].reasons, ["cores", "memoryGb"]);
  assert.throws(() => {
    "use strict";
    target[rules.globalName] = { tier: full.name };
  });
  assert.equal(target[rules.globalName].tier, mid.name, "assigning does not change it");
  assert.equal(globalThis[rules.globalName].tier, QUALITY.row().name, "the live game's tier is on the global too");
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
