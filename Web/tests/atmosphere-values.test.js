import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createGeometry } from "../src/world-geometry.js";
import { createAtmosphere } from "../src/atmosphere.js";
import { AREA_ATMOSPHERE } from "../src/atmosphere-areas.js";

// Differential test: the smoke, flame and ember particles atmosphere.js builds (positions, sizes, motion, phase, strength, tint,
// variation, draw order) and its clock handling are exactly what the inline numbers produced. The expected digests were recorded from
// the code before the numbers moved to atmosphere.json (UPDATE_ATMOSPHERE_DIGEST=1 rewrites them; only for an intended change).
const digestPath = new URL("./fixtures/atmosphere-values.json", import.meta.url);
const hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const round = (n) => Math.round(n * 1e9) / 1e9;

function setup(area) {
  const layout = JSON.parse(fs.readFileSync(new URL(`../public/world/${area}/layout.json`, import.meta.url), "utf8")),
    camera = new THREE.PerspectiveCamera(layout.fieldOfView, 1672 / 941, 0.1, 300);
  camera.position.set(0, layout.height, layout.distance);
  camera.lookAt(0, 0, -layout.targetZ);
  camera.updateMatrixWorld(true);
  const world = { areaId: area, camera, calibrated: camera.projectionMatrix.clone(), geometry: createGeometry(layout) },
    scene = new THREE.Scene();
  return { world, scene, fx: createAtmosphere({ THREE, scene, world }) };
}

function snapshot() {
  const out = {};
  for (const area of Object.keys(AREA_ATMOSPHERE)) {
    const { world, scene, fx } = setup(area);
    fx.update(0.016);
    const group = scene.children.find((c) => c.name === "London restrained atmosphere"),
      meshes = (group?.children ?? []).map((mesh) => ({
        name: mesh.name,
        renderOrder: mesh.renderOrder,
        frustumCulled: mesh.frustumCulled,
        index: Array.from(mesh.geometry.index.array),
        attributes: Object.fromEntries(
          Object.entries(mesh.geometry.attributes).map(([k, a]) => [k, Array.from(a.array, round)]),
        ),
        clock: mesh.material.uniforms.clock.value,
      }));
    const stats = [fx.stats()];
    fx.update(1.5);
    stats.push(fx.stats());
    fx.update(0.03, { paused: true });
    stats.push(fx.stats());
    fx.update(0.04, { enabled: false });
    stats.push(fx.stats());
    fx.reset();
    stats.push(fx.stats());
    out[area] = { meshes: hash(meshes), meshNames: meshes.map((m) => [m.name, m.renderOrder, m.index.length]), stats: hash(stats) };
    fx.dispose();
    void world;
  }
  return out;
}

// Re-recorded 28 Oct 2026 (art/south-clear-crates-hedgehog): only the south digest moved, because the fire anchor of the barrel painted out of the
// South backdrop (south-near-drum) was removed. Intentional.
test("atmosphere particles and clock are value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_ATMOSPHERE_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
  assert(Object.values(got).some((a) => a.meshNames.length > 0), "at least one area builds particles");
});
