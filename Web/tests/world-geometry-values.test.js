import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGeometry } from "../src/world-geometry.js";

// Differential test: the artwork-to-ground projection, the clearance margin and the stepped movement are exactly what the inline
// numbers computed. The expected snapshot was recorded from the code before the numbers moved to visual.json `worldGeometry`
// (UPDATE_WORLD_GEOMETRY_DIGEST=1 rewrites it; only for an intended change).
const digestPath = new URL("./fixtures/world-geometry-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e6) / 1e6;
const r = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)]));

function snapshot() {
  const geometry = createGeometry({
    height: 6.5,
    distance: 11,
    targetZ: -1.5,
    fieldOfView: 38,
    road: [
      { x: 0.1, y: 0.95 },
      { x: 0.9, y: 0.95 },
      { x: 0.8, y: 0.45 },
      { x: 0.2, y: 0.45 },
    ],
    blockers: [
      {
        points: [
          { x: 0.45, y: 0.7 },
          { x: 0.55, y: 0.7 },
          { x: 0.55, y: 0.78 },
          { x: 0.45, y: 0.78 },
        ],
      },
    ],
  });
  const out = { ground: [], point: [], clear: [], moves: [] };
  for (const [x, y] of [
    [0.5, 0.9],
    [0.25, 0.6],
    [0.8, 0.5],
    [0.12, 0.93],
  ]) {
    const g = geometry.ground({ x, y });
    out.ground.push(r(g));
    out.point.push(r(geometry.point(g)), r(geometry.point(g, 1.7)));
  }
  const mid = geometry.ground({ x: 0.5, y: 0.6 });
  for (let i = -6; i <= 6; i++)
    for (let j = -6; j <= 6; j++)
      out.clear.push(geometry.clear({ x: mid.x + i * 0.5, z: mid.z + j * 0.5 }, 0), geometry.clear({ x: mid.x + i * 0.5, z: mid.z + j * 0.5 }, 0.4));
  for (const [dx, dz, radius] of [[1.2, -0.7], [-3, 0.4], [0.01, 0.02], [4, 4, 0.2], [-2, -2, 1], [0.5, 0, 0]])
    out.moves.push(r(geometry.move(mid, { x: dx, z: dz }, radius)));
  out.invalid = r(geometry.move(mid, { x: Number.NaN, z: 1 }));
  return JSON.parse(JSON.stringify(out));
}

test("world geometry is value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_WORLD_GEOMETRY_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
  assert.equal(got.clear.length, 338);
  assert.ok(got.clear.some(Boolean) && got.clear.some((c) => !c));
});
