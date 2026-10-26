import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createGeometry } from "../src/world-geometry.js";
import { createExitArrows, exitDirection, zoneCentre } from "../src/engine/exit-arrows.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../public/world/manifest.json", import.meta.url), "utf8"));
const areas = [...new Set(manifest.links.map((l) => l.from))];
const layoutOf = (id) => JSON.parse(fs.readFileSync(new URL(`../public/world/${id}/layout.json`, import.meta.url), "utf8"));
const fakeWorld = (areaId) => ({
  THREE,
  areaId,
  geometry: createGeometry(layoutOf(areaId)),
  registry: { links: (id) => manifest.links.filter((l) => l.from === id) },
  group: new THREE.Group(),
  toRender: (p, y = 0) => new THREE.Vector3(p.x, y, -p.z),
});

test("every exit of every area gets exactly one arrow, shown only while its exit is open", () => {
  let total = 0;
  for (const id of areas) {
    const world = fakeWorld(id),
      exits = createExitArrows(world),
      links = manifest.links.filter((l) => l.from === id);
    assert.equal(exits.arrows.length, links.length, `${id}: an exit has no arrow`);
    assert.deepEqual(exits.arrows.map((a) => a.to).sort(), links.map((l) => l.to).sort());
    total += exits.arrows.length;
    exits.sync((to) => to !== links[0].to);
    assert.equal(exits.arrows[0].mesh.visible, false, `${id}: closed exit still shows`);
    assert.ok(exits.arrows.slice(1).every((a) => a.mesh.visible));
    exits.dispose();
  }
  assert.equal(total, 28);
});

test("arrows lie on the road and point out through their exit", () => {
  const bad = [];
  for (const id of areas) {
    const world = fakeWorld(id),
      g = world.geometry,
      exits = createExitArrows(world);
    for (const { mesh, link, to } of exits.arrows) {
      const dir = { x: Math.sin(mesh.rotation.y), z: -Math.cos(mesh.rotation.y) }, // render z is the ground's z mirrored
        tail = { x: mesh.position.x, z: -mesh.position.z },
        tip = { x: tail.x + dir.x * 1.2, z: tail.z + dir.z * 1.2 };
      if (!g.clear(tail, 0) || !g.clear(tip, 0)) bad.push(`${id} -> ${to}`);
      const c = zoneCentre(link.condition);
      assert.ok(c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1);
    }
    exits.dispose();
  }
  assert.deepEqual(bad, [], "arrows off the road");
});

test("an exit against a painting edge points out through that edge; any other points from the road's middle", () => {
  const middle = { x: 0, z: 0 };
  assert.deepEqual(exitDirection({ xMin: 0.955, yMin: 0.2, yMax: 0.3 }, 0.06, middle, { x: 9, z: 9 }), { x: 1, z: 0 });
  assert.deepEqual(exitDirection({ xMax: 0.04 }, 0.06, middle, { x: -9, z: 9 }), { x: -1, z: 0 });
  assert.deepEqual(exitDirection({ yMin: 0.97, xMin: 0.49, xMax: 0.75 }, 0.06, middle, { x: 0, z: 9 }), { x: 0, z: -1 });
  assert.deepEqual(exitDirection({ yMax: 0.045, xMin: 0.48, xMax: 0.52 }, 0.06, middle, { x: 0, z: 9 }), { x: 0, z: 1 });
  assert.deepEqual(exitDirection({ xMin: 0.43, xMax: 0.47, yMin: 0.5, yMax: 0.6 }, 0.06, middle, { x: 3, z: 4 }), { x: 0.6, z: 0.8 });
});
