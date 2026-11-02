import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import { createGeometry } from "../src/world-geometry.js";

// The tutorial salamander (westminster-roamer-2) used to patrol a 0.7 m leg, shorter than its own 0.85 m body radius, so it flipped goal
// every few frames and jittered on the spot. Its leg is now long enough to read as walking, and this pins that the whole leg is clear ground
// for the salamander's body, stays inside the area-pursuit leash from its home, and keeps clear of the neighbouring roamers' legs.
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url)));
const layout = read("world/westminster/layout.json");
const geometry = createGeometry(layout);
const SALAMANDER_RADIUS = 0.849;
const LEASH = read("../src/data/creatures.json").behaviours.intents["area-pursuit"].homeLeash;
const rows = AREA_MOB_SPAWNS.westminster;
const row = rows.find((r) => r.key === "westminster-roamer-2");
const along = (a, b, f) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.1));
  for (let n = 0; n <= steps; n++) f({ x: a.x + ((b.x - a.x) * n) / steps, z: a.z + ((b.z - a.z) * n) / steps });
};

test("the salamander patrols a real leg, not a sub-body-width shuffle", () => {
  const [a, b] = row.patrol;
  assert.deepEqual(a, row.pos);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 4);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) <= LEASH - 1);
});

test("every point of the salamander's leg is clear for its body, so it cannot wedge", () => {
  const [a, b] = row.patrol;
  along(a, b, (p) => assert.ok(geometry.clear(p, SALAMANDER_RADIUS), JSON.stringify(p)));
});

test("the salamander's leg keeps a body-width of room from every other Westminster roamer's leg", () => {
  const [a, b] = row.patrol;
  for (const other of rows.filter((r) => r !== row))
    along(a, b, (p) =>
      along(other.patrol[0], other.patrol[1], (q) =>
        assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > SALAMANDER_RADIUS + 0.4, other.key),
      ),
    );
});
