import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createWaterEffect } from "../src/engine/water-effect.js";

// Differential test: the water mesh (screen-to-world projection, edge table in image pixels, uniforms, render order, clock clamp)
// is exactly what the inline numbers built. The expected snapshot was recorded from the code before the numbers moved to
// world.json `waterEffect` (UPDATE_WATER_EFFECT_DIGEST=1 rewrites it; only for an intended change).
const digestPath = new URL("./fixtures/water-effect-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e6) / 1e6;
const flat = (a) => Array.from(a, round);

function snapshot() {
  const camera = new THREE.PerspectiveCamera(40, 1672 / 941, 0.1, 500);
  camera.position.set(3, 7, 11);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const world = { camera, calibrated: camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse) },
    square = (x, y, s) => [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ],
    profile = {
      seed: 3054321987,
      flow: { direction: { x: 0.6, y: -0.8 }, speedPixelsPerSecond: 14 },
      rippleScalePixels: 22,
      rippleAmplitudePixelsMax: 3.5,
      opacityMax: 0.4,
      edgeFeatherPixels: 12,
      glint: { alphaMax: 0.3, density: 0.45, tintLinearProposal: [0.5, 0.7, 0.8] },
    },
    config = {
      enabled: true,
      profile,
      regions: [
        { points: square(0.1, 0.2, 0.5), holes: [square(0.25, 0.35, 0.1)] },
        { points: square(0.7, 0.6, 0.2), holes: [] },
      ],
    },
    scene = new THREE.Scene(),
    fx = createWaterEffect({ THREE, scene, world, config, reducedMotion: () => false }),
    mesh = scene.children[0],
    u = mesh.material.uniforms,
    out = { name: mesh.name, renderOrder: mesh.renderOrder, culled: mesh.frustumCulled };
  out.position = flat(mesh.geometry.getAttribute("position").array);
  out.uv = flat(mesh.geometry.getAttribute("uv").array);
  out.index = Array.from(mesh.geometry.index.array);
  out.uniforms = {
    clock: u.clock.value,
    imageSize: u.imageSize.value.toArray(),
    flow: u.flow.value.toArray(),
    speed: u.speed.value,
    spacing: u.spacing.value,
    amplitude: u.amplitude.value,
    opacity: u.opacity.value,
    glint: u.glint.value,
    edgeCount: u.edgeCount.value,
    feather: u.feather.value,
    density: u.density.value,
    tint: u.tint.value.toArray(),
    phase: round(u.phase.value),
    edges: u.edges.value.length,
    edgeData: flat(u.edges.value.flatMap((e) => e.toArray())),
  };
  fx.update(5);
  out.clockAfterBigStep = u.clock.value;
  fx.update(0.04);
  out.clockAfterSmallStep = round(u.clock.value);
  out.stats = fx.stats();
  fx.dispose();
  return JSON.parse(JSON.stringify(out));
}

test("water effect is value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_WATER_EFFECT_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
  assert.equal(got.uniforms.edgeCount, 12);
});
