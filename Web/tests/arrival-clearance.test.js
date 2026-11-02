import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry, insidePolygon } from "../src/world-geometry.js";
import { WORLD_GEOMETRY } from "../src/engine/world-geometry-data.js";

// Every place a traveller can arrive (an area's own entry and each link's entry) must leave room to move: the player stands on the road,
// outside every blocker, with at least MIN_CLEAR metres to the nearest wall or blocker edge (a 3 m wide lane). Dom's phone run (28 Oct) had
// players arriving pinned to a wall edge and struggling to walk off.
const MIN_CLEAR = 1.5;
const read = (p) => JSON.parse(readFileSync(new URL(`../public/${p}`, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const segmentDistance = (p, a, b) => {
  const x = b.x - a.x,
    z = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z)));
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z);
};
const clearance = (geometry, entry) => {
  const p = geometry.ground(entry);
  if (!insidePolygon(p, geometry.road) || geometry.blockers.some((poly) => insidePolygon(p, poly))) return -1;
  let nearest = Infinity;
  for (const [a, b] of geometry.edges) nearest = Math.min(nearest, segmentDistance(p, a, b));
  return nearest - WORLD_GEOMETRY.wallMargin;
};

for (const id of registry.ids) {
  const area = registry.get(id);
  const geometry = createGeometry(read(registry.asset(area.layoutRef).path));
  const arrivals = [
    ["entry", area.entry],
    ...[...registry.ids].flatMap((from) => registry.links(from)).filter((link) => link.to === id).map((link) => [`from ${link.from}`, link.entry]),
  ];
  for (const [label, entry] of arrivals)
    test(`${id} arrival ${label} has ${MIN_CLEAR} m of clear ground`, () => {
      assert.ok(clearance(geometry, entry) >= MIN_CLEAR, `${id} ${label} ${JSON.stringify(entry)} is ${clearance(geometry, entry).toFixed(2)} m from a wall`);
    });
}
