import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createGeometry } from "../src/world-geometry.js";
import { createExitRings } from "../src/engine/exit-rings.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../public/world/manifest.json", import.meta.url), "utf8"));
const areas = [...new Set(manifest.links.map((l) => l.from))];
const layoutOf = (id) => JSON.parse(fs.readFileSync(new URL(`../public/world/${id}/layout.json`, import.meta.url), "utf8"));
const fakeWorld = (areaId) => {
  const layout = layoutOf(areaId);
  return {
    THREE,
    areaId,
    layout,
    geometry: createGeometry(layout),
    registry: { links: (id) => manifest.links.filter((l) => l.from === id) },
    group: new THREE.Group(),
    toRender: (p, y = 0) => new THREE.Vector3(p.x, y, -p.z),
  };
};
// East Bridge keeps the ring and sign route-guidance already draws there.
const signed = (id) => new Set((layoutOf(id).guidance ?? []).filter((r) => r.sign).map((r) => r.to));

test("every exit of every area gets one ring, except the exit route-guidance already signs; shown only while its exit is open", () => {
  let total = 0;
  for (const id of areas) {
    const world = fakeWorld(id),
      exits = createExitRings(world),
      links = manifest.links.filter((l) => l.from === id && !signed(id).has(l.to));
    assert.deepEqual(exits.rings.map((r) => r.to).sort(), links.map((l) => l.to).sort(), `${id}: ring and exit lists differ`);
    total += exits.rings.length;
    if (exits.rings.length) {
      exits.sync((to) => to !== exits.rings[0].to);
      assert.equal(exits.rings[0].mesh.visible, false, `${id}: closed exit still shows`);
      assert.ok(exits.rings.slice(1).every((r) => r.mesh.visible));
    }
    exits.dispose();
  }
  assert.equal(total, 27);
});

test("each ring stands on clear ground, at or within two metres of its exit zone", () => {
  const bad = [];
  for (const id of areas) {
    const world = fakeWorld(id),
      g = world.geometry,
      exits = createExitRings(world);
    for (const { at, link, to } of exits.rings) {
      if (!g.clear(at, 0)) bad.push(`${id} -> ${to}: off the road`);
      const c = link.condition,
        p = g.point(at),
        zone = g.ground({ x: Math.min(Math.max(p.x, c.xMin ?? 0), c.xMax ?? 1), y: Math.min(Math.max(p.y, c.yMin ?? 0), c.yMax ?? 1) }),
        gap = Math.hypot(zone.x - at.x, zone.z - at.z);
      if (gap > 2) bad.push(`${id} -> ${to}: ${gap.toFixed(1)} m from its zone`);
    }
    exits.dispose();
  }
  assert.deepEqual(bad, []);
});
