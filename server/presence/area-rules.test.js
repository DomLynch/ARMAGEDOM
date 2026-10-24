// Presence's area rules over a small hand-made world (two areas) and, when ARMA_AREA_ROWS points at World's generated rows
// (node Web/scripts/area-presence-rows.mjs out.json, PR #54), over the real ones. No database, no network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkMove, checkTravel, inPolygon, loadAreaRows, pickArrival, resumePosition } from "./area-rules.js";

const square = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const area = (id, other, over = {}) => ({
  area: id,
  bounds: { minX: 0, maxX: 4000, minZ: 0, maxZ: 3000 },
  originCm: { x: 0, z: 0 },
  road: square(0, 0, 4000, 3000),
  blockers: [square(1000, 1000, 1500, 1500)],
  playerRadiusCm: 40,
  exits: [{ to: other, zone: square(3800, 1000, 4000, 2000) }],
  arrivals: [
    { id: `${id}:a1`, x: 200, z: 200, from: null },
    { id: `${id}:a2`, x: 3500, z: 1500, from: other },
    { id: `${id}:a3`, x: 200, z: 2800, from: null },
  ],
  enemies: [{ instance: `${id}:rat-1`, home: { x: 2000, z: 2000 } }],
  ...over,
});
const rows = () => [area("south", "east"), area("east", "south")];
const SPEED = { maxSpeedCmPerS: 520 };

test("loading: well-formed rows load, with a stable version of the layout", () => {
  const a = loadAreaRows(rows()),
    b = loadAreaRows(rows());
  assert.deepEqual(Object.keys(a.areas).sort(), ["east", "south"]);
  assert.equal(a.version, b.version);
  assert.notEqual(a.version, loadAreaRows([area("south", "east", { playerRadiusCm: 41 }), area("east", "south")]).version);
});

test("loading: anything malformed stops the load", () => {
  const bad = {
    "no rows": [],
    "bad area id": [area("South", "east"), area("east", "south")],
    "duplicate area": [area("south", "east"), area("south", "east")],
    "float centimetres": [area("south", "east", { bounds: { minX: 0.5, maxX: 4000, minZ: 0, maxZ: 3000 } }), area("east", "south")],
    "out of the database range": [area("south", "east", { bounds: { minX: 0, maxX: 100001, minZ: 0, maxZ: 3000 } }), area("east", "south")],
    "two-point road": [area("south", "east", { road: square(0, 0, 1, 1).slice(0, 2) }), area("east", "south")],
    "exit to nowhere": [area("south", "west"), area("east", "south")],
    "exit to itself": [area("south", "south"), area("east", "south")],
    "one arrival": [area("south", "east", { arrivals: [{ id: "south:a1", x: 200, z: 200, from: null }] }), area("east", "south")],
    "arrival inside a blocker": [area("south", "east", { arrivals: [{ id: "south:a1", x: 1200, z: 1200, from: null }, { id: "south:a2", x: 200, z: 200, from: null }] }), area("east", "south")],
    "arrival with another area's prefix": [area("south", "east", { arrivals: [{ id: "east:a1", x: 200, z: 200, from: null }, { id: "south:a2", x: 300, z: 300, from: null }] }), area("east", "south")],
    "arrival from an unknown area": [area("south", "east", { arrivals: [{ id: "south:a1", x: 200, z: 200, from: "moon" }, { id: "south:a2", x: 300, z: 300, from: null }] }), area("east", "south")],
    "duplicate enemy": [area("south", "east", { enemies: [{ instance: "x", home: { x: 1, z: 1 } }, { instance: "x", home: { x: 2, z: 2 } }] }), area("east", "south")],
  };
  for (const [why, input] of Object.entries(bad)) assert.throws(() => loadAreaRows(input), /area rows/, why);
});

test("polygons: inside, outside and the boundary", () => {
  const poly = square(0, 0, 100, 100);
  assert.equal(inPolygon({ x: 50, z: 50 }, poly), true);
  assert.equal(inPolygon({ x: 150, z: 50 }, poly), false);
  assert.equal(inPolygon({ x: 100, z: 50 }, poly), true, "the boundary counts as inside");
  const l = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 50, z: 100 }, { x: 50, z: 50 }, { x: 0, z: 50 }];
  assert.equal(inPolygon({ x: 25, z: 75 }, l), false, "the notch of a concave polygon is outside");
  assert.equal(inPolygon({ x: 75, z: 75 }, l), true);
});

test("moves: walkable, not through a blocker, bounded speed, forward time", () => {
  const south = loadAreaRows(rows()).areas.south;
  const at = (x, z, atMs) => ({ x, z, atMs });
  assert.equal(checkMove(south, at(200, 200, 0), at(300, 200, 1000), SPEED).ok, true);
  assert.equal(checkMove(south, null, at(200, 200, 0), SPEED).ok, true, "a first report has nothing to compare to");
  assert.deepEqual(checkMove(south, at(200, 200, 0), at(1200, 1200, 5000), SPEED), { ok: false, reason: "blocked" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), at(5000, 200, 9000), SPEED), { ok: false, reason: "bounds" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), at(2200, 200, 1000), SPEED), { ok: false, reason: "speed" }, "20 m in one second");
  assert.equal(checkMove(south, at(200, 200, 0), at(700, 200, 1000), SPEED).ok, true, "5 m/s is the run speed");
  assert.equal(checkMove(south, at(200, 200, 1000), at(260, 200, 1005), SPEED).ok, true, "two reports 5 ms apart: jitter is floored");
  assert.deepEqual(checkMove(south, at(200, 200, 1000), at(210, 200, 900), SPEED), { ok: false, reason: "time" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), { x: 200.5, z: 200, atMs: 10 }, SPEED), { ok: false, reason: "position" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), { x: "1", z: 2, atMs: 10 }, SPEED), { ok: false, reason: "position" });
  assert.throws(() => checkMove(south, null, at(200, 200, 0), {}), /maxSpeedCmPerS is required/);
});

test("travel: only from inside an exit zone, only to the area it leads to", () => {
  const rules = loadAreaRows(rows());
  assert.equal(checkTravel(rules, "south", "east", { x: 3900, z: 1500 }), true);
  assert.equal(checkTravel(rules, "south", "east", { x: 3000, z: 1500 }), false, "not in the zone");
  assert.equal(checkTravel(rules, "south", "south", { x: 3900, z: 1500 }), false);
  assert.equal(checkTravel(rules, "south", "moon", { x: 3900, z: 1500 }), false);
  assert.equal(checkTravel(rules, "moon", "east", { x: 3900, z: 1500 }), false);
  assert.equal(checkTravel(rules, "south", "east", { x: "3900", z: 1500 }), false);
});

test("arrivals: the entry from the area you came from; the roomiest slot; deterministic", () => {
  const rules = loadAreaRows(rows());
  assert.equal(pickArrival(rules, "south", "east").id, "south:a2", "the arrival reserved for that direction");
  assert.equal(pickArrival(rules, "south", null).id, "south:a1", "a fresh start: every arrival, lowest id on a tie");
  assert.equal(pickArrival(rules, "south", "east", [{ x: 3500, z: 1500 }]).id, "south:a2", "a direction with one arrival has no choice");
  assert.equal(pickArrival(rules, "south", null, [{ x: 200, z: 200 }]).id, "south:a2", "away from the player standing on a1: the farthest slot");
  assert.equal(pickArrival(rules, "south", "nowhere").id, "south:a1", "no arrival for that direction: any");
  assert.throws(() => pickArrival(rules, "moon", null), /unknown area/);
});

test("resume: a walkable saved position is kept, anything else goes to the nearest arrival", () => {
  const rules = loadAreaRows(rows());
  assert.deepEqual(resumePosition(rules, "south", { x: 2500, z: 500 }), { x: 2500, z: 500, arrival: null });
  assert.deepEqual(resumePosition(rules, "south", { x: 1200, z: 1200 }), { x: 200, z: 200, arrival: "south:a1" }, "inside a blocker");
  assert.deepEqual(resumePosition(rules, "south", { x: 3900, z: 1400 }).arrival, null, "an exit zone is still walkable");
  assert.equal(resumePosition(rules, "south", { x: 9999, z: 2900 }).arrival, "south:a2", "out of bounds: nearest arrival");
  assert.equal(resumePosition(rules, "south", null).arrival, "south:a1");
  assert.equal(resumePosition(rules, "moon", { x: 1, z: 1 }), null);
});

test("World's generated rows (PR #54) load and every arrival and enemy home is walkable", { skip: !process.env.ARMA_AREA_ROWS }, () => {
  const rules = loadAreaRows(JSON.parse(fs.readFileSync(process.env.ARMA_AREA_ROWS, "utf8")));
  assert.ok(Object.keys(rules.areas).length >= 2);
  for (const [id, area] of Object.entries(rules.areas)) {
    for (const a of area.arrivals) assert.equal(resumePosition(rules, id, a).arrival, null, a.id);
    for (const exit of area.exits) {
      const arrival = pickArrival(rules, exit.to, id);
      assert.ok(arrival, `${id} -> ${exit.to}`);
    }
  }
});
