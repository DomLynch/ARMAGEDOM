import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createGeometry } from "../src/world-geometry.js";
import { createExitRings } from "../src/engine/exit-rings.js";
import { EXIT_RINGS } from "../src/engine/exit-rings-data.js";
import { markedTargets } from "../src/engine/route-guidance.js";

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
// East Bridge keeps the ring and sign route-guidance already draws there, and so does every Central Safehouse side entrance.
const signed = (id) => markedTargets(layoutOf(id).guidance ?? []);

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
      assert.ok(exits.rings.every((r) => r.mesh.visible), `${id}: a ring is hidden`);
      assert.equal(exits.rings[0].mesh.material.opacity, EXIT_RINGS.lockedOpacity, `${id}: closed exit not dimmed`);
      assert.ok(exits.rings.slice(1).every((r) => r.mesh.material.opacity === EXIT_RINGS.opacity));
    }
    exits.dispose();
  }
  assert.equal(total, 20); // 24 exits minus the East Bridge sign and the three Central Safehouse side entrances (east, south, area7)
});

test("a tenth area, a moved exit and a data offset need no code: the ring follows the registry condition and visual.json", () => {
  const base = fakeWorld("south"),
    link = manifest.links.find((l) => l.from === "south" && l.to === "lambeth"),
    ringFor = (areaId, condition) => {
      const world = { ...base, areaId, group: new THREE.Group(), registry: { links: () => [{ ...link, from: areaId, to: "area-ten-neighbour", condition }] } };
      return createExitRings(world).rings;
    },
    first = ringFor("area-ten", link.condition),
    moved = ringFor("area-ten", { ...link.condition, xMin: 0.25, xMax: 0.3, yMin: 0.69, yMax: 0.7 });
  assert.equal(first.length, 1, "a new area id gets its ring");
  assert.equal(first[0].to, "area-ten-neighbour");
  assert.ok(Math.hypot(first[0].at.x - moved[0].at.x, first[0].at.z - moved[0].at.z) > 0.5, "moving the exit moves the ring");
  // The look and any per-exit offset live in data/visual.json only (the game's data is frozen, so a test cannot edit it).
  assert.deepEqual(Object.keys(EXIT_RINGS).sort(), ["anchor", "colour", "flatRotation", "height", "inner", "lockedColour", "lockedOpacity", "offsets", "opacity", "outer", "segments"]);
  const ring = createExitRings({ ...base, group: new THREE.Group(), registry: { links: () => [link] } }).rings[0];
  assert.equal(ring.mesh.material.color.getHexString(), EXIT_RINGS.colour);
  assert.equal(ring.mesh.material.opacity, EXIT_RINGS.opacity);
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
