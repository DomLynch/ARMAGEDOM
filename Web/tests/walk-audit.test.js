import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { auditArea, loadAreas, gridLabel, GRID } from "../scripts/walk-audit.mjs";
import { WORLD_GEOMETRY } from "../src/engine/world-geometry-data.js";

const { registry, ids } = loadAreas();
const layoutOf = (id) => JSON.parse(fs.readFileSync(new URL(`../public/world/${id}/layout.json`, import.meta.url), "utf8"));

test("from the area entry the character can walk to every exit zone and every arrival point, in all areas", () => {
  const radius = WORLD_GEOMETRY.defaultRadius;
  let exits = 0;
  for (const id of ids) {
    const r = auditArea(registry, id);
    assert.deepEqual(r.exits.filter((e) => !e.reachable).map((e) => `${id} -> ${e.to}`), [], `${id}: an exit zone cannot be reached`);
    assert.deepEqual(r.arrivals.filter((a) => !a.reachable).map((a) => `${a.from} -> ${id}`), [], `${id}: an arrival point is cut off`);
    for (const a of r.arrivals) assert.ok(a.clearHere, `${a.id} arrives on ground the character does not fit`);
    exits += r.exits.length;
    // No choke under the character's width: the tightest point on the best route to each exit is wider than the character.
    for (const e of r.exits) assert.ok(e.widestRoute > 2 * radius, `${id} -> ${e.to}: ${e.widestRoute.toFixed(2)} m at the tightest point`);
    for (const c of r.chokes) assert.ok(c.width > 2 * radius, `${id} ${c.cell}: ${c.width.toFixed(2)} m wide`);
  }
  assert.equal(ids.length, 9);
  assert.equal(exits, 28);
});

test("the audit notices a wall across the road and a character that is too wide for a corridor", () => {
  const layout = layoutOf("westminster");
  layout.blockers.push({
    name: "Test wall",
    points: [
      { x: 0, y: 0.7 },
      { x: 1, y: 0.7 },
      { x: 1, y: 0.75 },
      { x: 0, y: 0.75 },
    ],
  });
  const walled = auditArea(registry, "westminster", { layout });
  assert.equal(walled.exits.find((e) => e.to === "east").reachable, false, "the wall cuts the entry off from the east exit");
  assert.equal(walled.exits.find((e) => e.to === "south").reachable, true);
  const plain = auditArea(registry, "westminster"),
    south = plain.exits.find((e) => e.to === "south");
  const wide = auditArea(registry, "westminster", { radius: south.widestRoute / 2 + 0.1 });
  assert.equal(wide.exits.find((e) => e.to === "south").reachable, false, "a character wider than the tightest point cannot pass");
});

test("grid labels follow the A1-F4 map grid", () => {
  assert.equal(GRID.columns, 6);
  assert.equal(GRID.rows, 4);
  assert.equal(gridLabel({ x: 0, y: 0 }), "A1");
  assert.equal(gridLabel({ x: 0.999, y: 0.999 }), "F4");
  assert.equal(gridLabel({ x: 0.5, y: 0.5 }), "D3");
  assert.equal(gridLabel({ x: 0.1, y: 0.51 }), "A3");
});
