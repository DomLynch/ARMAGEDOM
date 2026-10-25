import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { validateGuidance, resolveGuidance } from "../src/engine/route-guidance.js";
import { probe, inLink } from "../scripts/exit-probe.mjs";

// Dom, 25 Oct (live 241): in East the exit to East Bridge "still seems blocked a little". The trigger was a 2 m x 1.5 m patch on the
// plaza's far edge with the arrival point from East Bridge 1 m below it, and the art shows open ground up-right beyond a diagonal edge.
// The trigger now covers the top band of the plaza, the arrival point is well clear of it, and the exit has a guidance arrow.
const read = (p) => JSON.parse(readFileSync(new URL("../public/" + p, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const layout = read("world/east/layout.json");
const geo = createGeometry(layout);
const out = registry.links("east").find((l) => l.to === "east-bridge");
const back = registry.links("east-bridge").find((l) => l.to === "east");
const rows = validateGuidance(layout, geo, registry.links("east"));

test("the East Bridge trigger covers a real stretch of the plaza", () => {
  const { trigger } = probe("east", "east-bridge", 1);
  // About 1,800 walkable 0.1 m cells (18 m2): the old patch had 256.
  assert.ok(trigger > 1200, `trigger has ${trigger} walkable cells`);
});

test("a straight walk at the exit never snags: every start with a clear line reaches it", () => {
  const r = probe("east", "east-bridge", 18);
  assert.ok(r.starts > 600);
  // A start whose straight line is clear for the player's footprint must arrive; the others are behind a prop (the crates south of
  // the trigger, the diagonal edge) and a player steers round, which the guidance arrow below covers.
  assert.deepEqual(
    r.stalled.filter((s) => s.direct).map((s) => s.from),
    [],
  );
  assert.ok(r.reached / r.starts > 0.8, `${r.reached} of ${r.starts} reach it`);
});

test("following the guidance arrow reaches the exit from the west, the south and the lamp-post side", () => {
  for (const [name, spot] of [
    ["west", { x: 0.74, y: 0.31 }],
    ["south", { x: 0.86, y: 0.33 }],
    ["lamp-post side", { x: 0.9, y: 0.31 }],
  ]) {
    let pos = geo.ground(spot),
      done = false;
    assert.ok(geo.clear(pos, 0.4), `${name} start is walkable`);
    for (let i = 0; i < 2000 && !done; i++) {
      const cue = resolveGuidance(rows, geo, pos);
      if (!cue) break;
      const d = Math.hypot(cue.target.x - pos.x, cue.target.z - pos.z) || 1;
      pos = geo.move(pos, { x: ((cue.target.x - pos.x) / d) * 0.07, z: ((cue.target.z - pos.z) / d) * 0.07 }, 0.4);
      done = inLink(out, geo.point(pos));
    }
    assert.ok(done, `${name}: the arrow leads into the trigger`);
  }
});

test("arriving from East Bridge puts the player clear of the exit, in the main plaza", () => {
  const at = geo.ground(back.entry);
  assert.ok(geo.clear(at, 0.4));
  assert.equal(inLink(out, geo.point(at)), false, "not inside the trigger");
  // At least 1.5 m from the nearest walkable trigger cell, so a few steps of input cannot bounce the player straight back.
  let nearest = Infinity;
  for (let x = at.x - 4; x <= at.x + 4; x += 0.1)
    for (let z = at.z - 4; z <= at.z + 4; z += 0.1) {
      const q = { x, z };
      if (geo.clear(q, 0.4) && inLink(out, geo.point(q)))
        nearest = Math.min(nearest, Math.hypot(q.x - at.x, q.z - at.z));
    }
  assert.ok(nearest >= 1.5, `arrival is ${nearest.toFixed(2)} m from the trigger`);
});

test("the exit has a guidance arrow that ends inside the trigger and shows across the plaza", () => {
  const row = rows.find((r) => r.to === "east-bridge");
  assert.ok(row, "guidance row for the East Bridge exit");
  assert.equal(inLink(out, geo.point(row.path.at(-1))), true);
  for (const spot of [
    { x: 0.74, y: 0.31 },
    { x: 0.78, y: 0.3 },
    { x: 0.9, y: 0.31 },
    { x: 0.86, y: 0.33 },
  ]) {
    const cue = resolveGuidance(rows, geo, geo.ground(spot));
    assert.equal(cue?.row.id, "east-bridge-entry", `cue at ${spot.x},${spot.y}`);
  }
});
