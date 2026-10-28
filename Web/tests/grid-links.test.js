import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicAreaRegistry as registry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";

// Dom: travel between the nine areas follows the 3x3 map grid (area-content.json expedition.atlas). Each area links only to its grid
// neighbours, through an exit on the edge that faces the neighbour: twelve neighbour pairs, twenty-four directed links.
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const atlas = read("../public/world/area-content.json").expedition.atlas;
const manifest = read("../public/world/manifest.json");
const links = registry.ids.flatMap((id) => registry.links(id));
const step = (from, to) => ({ dx: atlas[to].column - atlas[from].column, dy: atlas[to].row - atlas[from].row });
// The picture edge an exit must touch for a neighbour in that direction (picture y runs down: row + 1 is the bottom edge).
const onEdge = (c, { dx, dy }) =>
  dx === 1 ? (c.xMin ?? 0) >= 0.5 : dx === -1 ? (c.xMax ?? 1) <= 0.5 : dy === 1 ? (c.yMin ?? 0) >= 0.5 : (c.yMax ?? 1) <= 0.5;
const inZone = (c, p) => Object.entries(c).every(([k, v]) => (k === "xMin" ? p.x > v : k === "xMax" ? p.x < v : k === "yMin" ? p.y > v : p.y < v));

test("links are exactly the grid neighbour pairs, twenty-four directed, each with its reverse", () => {
  assert.equal(links.length, 24);
  assert.equal(manifest.links.length, 24);
  const expected = [];
  for (const a of registry.ids)
    for (const b of registry.ids)
      if (Math.abs(atlas[a].column - atlas[b].column) + Math.abs(atlas[a].row - atlas[b].row) === 1) expected.push(`${a}>${b}`);
  assert.deepEqual(links.map((l) => `${l.from}>${l.to}`).sort(), expected.sort());
  for (const l of links) assert.ok(registry.links(l.to).some((back) => back.to === l.from), `${l.from}>${l.to} has no reverse`);
});

test("each exit rectangle lies on the picture edge that faces its neighbour on the grid", () => {
  for (const l of links) {
    const d = step(l.from, l.to);
    assert.ok(onEdge(l.condition, d), `${l.from}>${l.to} (${d.dx},${d.dy}) is not on the facing edge: ${JSON.stringify(l.condition)}`);
  }
});

test("every area is reachable from Westminster once the Matron is down", () => {
  assert.equal(registry.initialArea, "westminster");
  assert.deepEqual([...registry.reachable("westminster")].sort(), [...registry.ids].sort());
  // Leaving Westminster is what the tutorial gates; every other link keeps its existing requirements.
  for (const l of registry.links("westminster")) assert.equal(l.requiresDefeat, "boss-witch-v1", `westminster>${l.to}`);
  assert.deepEqual(
    links.filter((l) => l.from !== "westminster" && l.requiresDefeat).map((l) => `${l.from}>${l.to}`),
    [],
  );
});

test("no two exit zones in one area stand within 1.5 m of each other, so rings never stack", () => {
  const near = [];
  for (const id of registry.ids) {
    const area = registry.get(id),
      g = createGeometry(read("../public/" + registry.asset(area.layoutRef).path)),
      zones = registry.links(id).map((l) => {
        const pts = [];
        for (let x = 0; x <= 1; x += 0.004)
          for (let y = 0; y <= 1; y += 0.004) if (inZone(l.condition, { x, y }) && g.clear(g.ground({ x, y }), 0.4)) pts.push(g.ground({ x, y }));
        return { to: l.to, pts };
      });
    for (let i = 0; i < zones.length; i++)
      for (let j = i + 1; j < zones.length; j++) {
        let best = Infinity;
        for (const a of zones[i].pts) for (const b of zones[j].pts) best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
        if (best < 1.5) near.push(`${id}: ${zones[i].to} and ${zones[j].to} are ${best.toFixed(2)} m apart`);
      }
  }
  assert.deepEqual(near, []);
});
