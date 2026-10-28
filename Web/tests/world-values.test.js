import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LondonWorld, backdropTextureBytes } from "../src/world.js";

// Differential test: the camera crop (zoom, follow, damping), the backdrop quad geometry, the starting spawn and the texture byte count
// are exactly what the inline numbers in world.js produced. The expected digests were recorded from the code before the numbers moved
// to areaRuntime.json (UPDATE_WORLD_DIGEST=1 rewrites them; only for an intended change). Re-pinned for the worn ammo crate and medkit
// (worldPickups.json looks, finish and contour): the pickup meshes changed on purpose, the camera, quads and spawn did not.
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8")),
  manifest = read("../public/world/manifest.json"),
  digestPath = new URL("./fixtures/world-values.json", import.meta.url);
const hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const round = (n) => Math.round(n * 1e9) / 1e9;

function snapshot() {
  const out = { bytes: [backdropTextureBytes({ image: { width: 1672, height: 941 } }), backdropTextureBytes({ image: { width: 1672, height: 941 } }, true), backdropTextureBytes({})] };
  for (const area of Object.keys(manifest.areas ?? Object.fromEntries(manifest.links.map((l) => [l.from, 1])))) {
    let layout;
    try {
      layout = read(`../public/world/${area}/layout.json`);
    } catch {
      continue;
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(),
      world = new LondonWorld({ THREE, scene, camera, layout, texture: new THREE.Texture(), manifest });
    world.areaId = area;
    const g = world.geometry,
      log = [];
    log.push(["spawn", world.spawn, world.center, world.velocity]);
    for (const [w, h] of [
      [393, 695],
      [844, 390],
      [1672, 941],
      [600, 600],
      [320, 900],
    ])
      for (const [ix, iy] of [
        [0.2, 0.3],
        [0.5, 0.5],
        [0.52, 0.78],
        [0.8, 0.7],
        [0.95, 0.1],
      ]) {
        const p = g.ground({ x: ix, y: iy });
        for (const [dt, immediate] of [
          [0, true],
          [0.016, false],
          [0.016, false],
          [1, false],
        ]) {
          world.update(p, dt, w, h, immediate);
          log.push([
            w,
            h,
            ix,
            iy,
            dt,
            Array.from(world.crop.elements, round),
            [world.center.x, world.center.y, world.velocity.x, world.velocity.y].map(round),
            Array.from(world.camera.projectionMatrix.elements, round),
          ]);
        }
      }
    const meshes = [];
    world.group.traverse((o) => {
      if (o.geometry?.attributes?.position && !o.name.startsWith("Exit ring") && !o.userData.pickupType && !o.parent?.userData.pickupType) // exit rings: exit-rings.test.js; ground pickups and their contours: world-pickups.test.js
        meshes.push([o.name, o.renderOrder, Array.from(o.geometry.attributes.position.array, round), Array.from(o.geometry.attributes.uv?.array ?? [], round), Array.from(o.geometry.index?.array ?? [])]);
    });
    out[area] = { log: hash(log), meshes: hash(meshes), first: log[0], layout: [layout.zoom, layout.followPlayerSize, layout.characterScale] };
    world.dispose();
  }
  return out;
}

// Re-pinned 28 Oct 2026 (pickup readability, #399): the area's pickups now carry ground rings and name labels (extra meshes), so each
// area's `meshes` digest changed. Intentional; the camera log, layout and first frame are unchanged.
test("world camera crop, backdrop quads and spawn are value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_WORLD_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
  assert(Object.keys(got).length > 3, "several areas are covered");
});
