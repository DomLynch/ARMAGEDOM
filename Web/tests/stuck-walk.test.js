import test from "node:test";
import assert from "node:assert/strict";
import { walkArea, arrivals, registry } from "../scripts/stuck-walk.mjs";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";

// Headless stuck-spot walk over the nine registered areas at the player radius (0.4 m): the walkable ground is
// flood-filled with the real geometry.move, so a "connected" cell is one the player can actually step to.
const results = registry.ids.map(walkArea);

// South has two disconnected islands of free ground (4 m2 and a single cell). Nothing enters them: no entry, link
// arrival or resident spawn lands there. Pinned so a layout edit that opens or moves one is a deliberate change.
const KNOWN_POCKETS = { south: [1, 405] };

for (const r of results) {
  test(`${r.areaId}: one walkable region, no dead spots, every exit zone reachable`, () => {
    assert.equal(r.entryFree, true, "area entry is on free ground");
    assert.deepEqual(r.dead, [], "no point where the player cannot move in any direction");
    assert.deepEqual(
      r.pockets.map((p) => p.size).sort((a, b) => a - b),
      KNOWN_POCKETS[r.areaId] ?? [],
    );
    for (const l of r.links) assert.ok(l.inMain > 0, `${r.areaId} -> ${l.to} exit zone is walkable from the entry`);
  });
  test(`${r.areaId}: resident spawns and patrol legs are in the walkable region`, () => {
    for (const s of AREA_MOB_SPAWNS[r.areaId] ?? [])
      for (const p of [s.pos, ...(s.patrol ?? [])]) assert.ok(r.inMain(p), `${s.key} at ${JSON.stringify(p)}`);
  });
}

test("all 24 links: arrival is clear, in the walkable region, and outside the destination's own exit zones", () => {
  const rows = arrivals(results);
  assert.equal(rows.length, 24);
  for (const row of rows) {
    assert.equal(row.clear, true, `${row.link} arrives on free ground in the main region`);
    assert.equal(row.bounce, null, `${row.link} does not bounce straight back out`);
  }
});

test("the nine areas are one connected graph through the links", () => {
  assert.equal(registry.ids.length, 9);
  for (const id of registry.ids) assert.equal(registry.reachable(id).length, 9);
});
