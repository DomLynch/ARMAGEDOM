import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGeometry } from "../src/world-geometry.js";

const layout = JSON.parse(readFileSync(new URL("../public/world/east/layout.json", import.meta.url)));
const geometry = createGeometry(layout);
const rails = layout.masks.filter((mask) => mask.name.startsWith("Near bridge balustrade"));

const inside = (polygon, x, y) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};

test("East near balustrade has three masks, each a convex quad", () => {
  assert.equal(rails.length, 3);
  for (const mask of rails) {
    assert.equal(mask.points.length, 4);
    const signs = mask.points.map((a, i) => {
      const b = mask.points[(i + 1) % 4],
        c = mask.points[(i + 2) % 4];
      return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    });
    assert.ok(signs.every((s) => s === signs[0] && s !== 0), `${mask.name} must be convex for the fan triangulation`);
  }
});

test("every walkable actor that overlaps a rail mask on screen is behind its plane, so nothing in front is cut", () => {
  for (const mask of rails) {
    const plane = geometry.point(geometry.ground(mask.foot)).depth;
    let overlapping = 0,
      nearest = Infinity;
    for (let x = -30; x <= 30; x += 0.25)
      for (let z = -30; z <= 30; z += 0.25) {
        const p = { x, z };
        if (!geometry.clear(p, 0.4)) continue;
        const foot = geometry.point(p),
          top = geometry.point(p, 2.8),
          halfWidth = Math.abs(geometry.point({ x: x + 0.7, z }).x - foot.x);
        let overlaps = false;
        for (let s = 0; s <= 12 && !overlaps; s++) {
          const y = foot.y + ((top.y - foot.y) * s) / 12;
          for (const dx of [-halfWidth, 0, halfWidth]) if (inside(mask.points, foot.x + dx, y)) overlaps = true;
        }
        if (overlaps) {
          overlapping++;
          nearest = Math.min(nearest, foot.depth);
        }
      }
    assert.ok(overlapping > 0, `${mask.name} should overlap the walkable deck on screen`);
    // The 2.5x wolf's rear sits about 2.1 m nearer the camera than its centre: keep that much clearance.
    assert.ok(nearest - plane >= 2.1, `${mask.name}: nearest overlapping actor ${nearest} vs plane ${plane}`);
  }
});
