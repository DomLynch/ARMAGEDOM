// Presence's area rules over a small hand-made world (two areas) and over World's real generated data (PR #54): Web/scripts/area-presence-rows.mjs
// is run for real (areaPresenceData), its output loaded through loadAreaRows and checked end to end. No database, no network.
// The real-data test needs the Web tree and its node_modules (three); it is skipped only when `Web/node_modules` is absent, with the reason named.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { checkMove, checkTravel, inPolygon, loadAreaRows, pickArrival, resumePosition } from "./area-rules.js";
import { knockbacks, maxKnockbackCm, presenceLimits } from "./limits.js";

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
// The shape areaPresenceData() writes: { version, maxSpeedCmPerS, areas }, version = sha256(JSON.stringify(areas)).slice(0, 16).
const dataOf = (areas, over = {}) => ({ version: createHash("sha256").update(JSON.stringify(areas)).digest("hex").slice(0, 16), maxSpeedCmPerS: 520, areas, ...over });
const world = () => dataOf([area("south", "east"), area("east", "south")]);
const LIMITS = { maxSpeedCmPerS: 520, impulseCm: 15 };

test("loading: well-formed data loads, with a stable version and the speed", () => {
  const a = loadAreaRows(world()),
    b = loadAreaRows(world());
  assert.deepEqual(Object.keys(a.areas).sort(), ["east", "south"]);
  assert.equal(a.version, b.version);
  assert.equal(a.maxSpeedCmPerS, 520);
  assert.notEqual(a.version, loadAreaRows(dataOf([area("south", "east", { playerRadiusCm: 41 }), area("east", "south")])).version);
});

test("loading: anything malformed stops the load", () => {
  const two = (southOver) => dataOf([area("south", "east", southOver), area("east", "south")]);
  const bad = {
    "a bare array (not the data object)": [area("south", "east"), area("east", "south")],
    "null": null,
    "no areas": dataOf([]),
    "no speed": { ...world(), maxSpeedCmPerS: undefined },
    "float speed": { ...world(), maxSpeedCmPerS: 5.2 },
    "version of other rows": { ...world(), version: "0123456789abcdef" },
    "version missing": { ...world(), version: undefined },
    "areas edited after hashing": { ...world(), areas: world().areas.map((a) => ({ ...a, playerRadiusCm: 41 })) },
    "bad area id": dataOf([area("South", "east"), area("east", "south")]),
    "duplicate area": dataOf([area("south", "east"), area("south", "east")]),
    "float centimetres": two({ bounds: { minX: 0.5, maxX: 4000, minZ: 0, maxZ: 3000 } }),
    "out of the database range": two({ bounds: { minX: 0, maxX: 100001, minZ: 0, maxZ: 3000 } }),
    "two-point road": two({ road: square(0, 0, 1, 1).slice(0, 2) }),
    "exit to nowhere": dataOf([area("south", "west"), area("east", "south")]),
    "exit to itself": dataOf([area("south", "south"), area("east", "south")]),
    "one arrival": two({ arrivals: [{ id: "south:a1", x: 200, z: 200, from: null }] }),
    "arrival inside a blocker": two({ arrivals: [{ id: "south:a1", x: 1200, z: 1200, from: null }, { id: "south:a2", x: 200, z: 200, from: null }] }),
    "arrival with another area's prefix": two({ arrivals: [{ id: "east:a1", x: 200, z: 200, from: null }, { id: "south:a2", x: 300, z: 300, from: null }] }),
    "arrival from an unknown area": two({ arrivals: [{ id: "south:a1", x: 200, z: 200, from: "moon" }, { id: "south:a2", x: 300, z: 300, from: null }] }),
    "duplicate enemy": two({ enemies: [{ instance: "x", home: { x: 1, z: 1 } }, { instance: "x", home: { x: 2, z: 2 } }] }),
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
  const south = loadAreaRows(world()).areas.south;
  const at = (x, z, atMs) => ({ x, z, atMs });
  assert.equal(checkMove(south, at(200, 200, 0), at(300, 200, 1000), LIMITS).ok, true);
  assert.equal(checkMove(south, null, at(200, 200, 0), LIMITS).ok, true, "a first report has nothing to compare to");
  assert.deepEqual(checkMove(south, at(200, 200, 0), at(1200, 1200, 5000), LIMITS), { ok: false, reason: "blocked" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), at(5000, 200, 9000), LIMITS), { ok: false, reason: "bounds" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), at(2200, 200, 1000), LIMITS), { ok: false, reason: "speed" }, "20 m in one second");
  assert.equal(checkMove(south, at(200, 200, 0), at(700, 200, 1000), LIMITS).ok, true, "5 m/s is the run speed");
  assert.equal(checkMove(south, at(200, 200, 1000), at(260, 200, 1005), LIMITS).ok, true, "two reports 5 ms apart: jitter is floored");
  assert.deepEqual(checkMove(south, at(200, 200, 1000), at(210, 200, 900), LIMITS), { ok: false, reason: "time" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), { x: 200.5, z: 200, atMs: 10 }, LIMITS), { ok: false, reason: "position" });
  assert.deepEqual(checkMove(south, at(200, 200, 0), { x: "1", z: 2, atMs: 10 }, LIMITS), { ok: false, reason: "position" });
  assert.throws(() => checkMove(south, null, at(200, 200, 0), { impulseCm: 0 }), /maxSpeedCmPerS is required/);
  assert.throws(() => checkMove(south, null, at(200, 200, 0), { maxSpeedCmPerS: 520 }), /impulseCm is required/);
});

test("moves: a hurt player running flat out is not a teleport (the knockback push is allowed)", () => {
  const south = loadAreaRows(world()).areas.south;
  const at = (x, z, atMs) => ({ x, z, atMs });
  const { impulseCm } = presenceLimits({ maxSpeedCmPerS: 520 }, { nothing: { knockback: 0.8 } });
  // 100 ms at 5.2 m/s is 52 cm; the heaviest push adds 15 cm: 67 cm, over the 65 cm of speed*slack alone.
  assert.equal(checkMove(south, at(200, 200, 0), at(267, 200, 100), { maxSpeedCmPerS: 520, impulseCm: 0 }).ok, false, "without the impulse allowance it is refused");
  assert.equal(checkMove(south, at(200, 200, 0), at(267, 200, 100), { maxSpeedCmPerS: 520, impulseCm }).ok, true);
  // The allowance is the push, not extra slack: a real teleport is still refused.
  assert.equal(checkMove(south, at(200, 200, 0), at(200 + 65 + impulseCm + 1, 200, 100), { maxSpeedCmPerS: 520, impulseCm }).ok, false);
});

test("limits: the push is read from Combat's data, not written here", () => {
  assert.deepEqual(knockbacks({ a: { knockback: 2 }, b: [{ knockback: 3 }, { knockback: "x" }], knockback: 1 }).sort(), [1, 2, 3]);
  // The knife's heavy move has knockback 3: 3 (walkSpeed) * 3 / 60 m = 0.15 m = 15 cm.
  assert.equal(maxKnockbackCm({ boss: { attacks: [{ knockback: 0.8 }] } }), 15);
  // A new data row with a bigger push raises the allowance (4 * 3 / 60 = 0.2 m).
  assert.equal(maxKnockbackCm({ boss: { attacks: [{ knockback: 4 }] } }), 20);
  assert.throws(() => maxKnockbackCm({ boss: { knockback: -1 } }), /no usable knockback/);
});

test("travel: only from inside an exit zone, only to the area it leads to", () => {
  const rules = loadAreaRows(world());
  assert.equal(checkTravel(rules, "south", "east", { x: 3900, z: 1500 }), true);
  assert.equal(checkTravel(rules, "south", "east", { x: 3000, z: 1500 }), false, "not in the zone");
  assert.equal(checkTravel(rules, "south", "south", { x: 3900, z: 1500 }), false);
  assert.equal(checkTravel(rules, "south", "moon", { x: 3900, z: 1500 }), false);
  assert.equal(checkTravel(rules, "moon", "east", { x: 3900, z: 1500 }), false);
  assert.equal(checkTravel(rules, "south", "east", { x: "3900", z: 1500 }), false);
});

test("arrivals: the entry from the area you came from; the roomiest slot; deterministic", () => {
  const rules = loadAreaRows(world());
  assert.equal(pickArrival(rules, "south", "east").id, "south:a2", "the arrival reserved for that direction");
  assert.equal(pickArrival(rules, "south", null).id, "south:a1", "a fresh start: every arrival, lowest id on a tie");
  assert.equal(pickArrival(rules, "south", "east", [{ x: 3500, z: 1500 }]).id, "south:a2", "a direction with one arrival has no choice");
  assert.equal(pickArrival(rules, "south", null, [{ x: 200, z: 200 }]).id, "south:a2", "away from the player standing on a1: the farthest slot");
  assert.equal(pickArrival(rules, "south", "nowhere").id, "south:a1", "no arrival for that direction: any");
  assert.throws(() => pickArrival(rules, "moon", null), /unknown area/);
});

test("resume: a walkable saved position is kept, anything else goes to the nearest arrival", () => {
  const rules = loadAreaRows(world());
  assert.deepEqual(resumePosition(rules, "south", { x: 2500, z: 500 }), { x: 2500, z: 500, arrival: null });
  assert.deepEqual(resumePosition(rules, "south", { x: 1200, z: 1200 }), { x: 200, z: 200, arrival: "south:a1" }, "inside a blocker");
  assert.deepEqual(resumePosition(rules, "south", { x: 3900, z: 1400 }).arrival, null, "an exit zone is still walkable");
  assert.equal(resumePosition(rules, "south", { x: 9999, z: 2900 }).arrival, "south:a2", "out of bounds: nearest arrival");
  assert.equal(resumePosition(rules, "south", null).arrival, "south:a1");
  assert.equal(resumePosition(rules, "moon", { x: 1, z: 1 }), null);
});

// End to end on World's real output. The generator is imported and run here (about 8 s), so the two PRs cannot drift apart unseen:
// if areaPresenceData() changes shape, this fails. Needs Web/node_modules; skipped with the reason when it is absent.
const webReady = fs.existsSync(new URL("../../Web/node_modules/three", import.meta.url)) && fs.existsSync(new URL("../../Web/scripts/area-presence-rows.mjs", import.meta.url));
test("World's real data (area-presence-rows.mjs) loads through loadAreaRows and drives every check", { skip: webReady ? false : "needs Web/node_modules and Web/scripts/area-presence-rows.mjs (PR #54)" }, async () => {
  const { areaPresenceData } = await import("../../Web/scripts/area-presence-rows.mjs");
  // Through JSON, as the script writes it, so what is loaded is exactly what a file would hold.
  const data = JSON.parse(JSON.stringify(areaPresenceData()));
  const rules = loadAreaRows(data);
  assert.equal(rules.version, data.version);
  assert.ok(Object.keys(rules.areas).length >= 2);
  const content = JSON.parse(fs.readFileSync(new URL("../../Web/public/world/area-content.json", import.meta.url), "utf8"));
  const limits = presenceLimits(rules, content);
  assert.ok(limits.maxSpeedCmPerS > 0 && limits.impulseCm >= 15, "speed from World's data, push from Combat's");
  for (const [id, a] of Object.entries(rules.areas)) {
    for (const arrival of a.arrivals) {
      assert.equal(resumePosition(rules, id, arrival).arrival, null, `${arrival.id} is walkable`);
      assert.equal(checkMove(a, null, { ...arrival, atMs: 0 }, limits).ok, true, `${arrival.id} passes checkMove`);
    }
    for (const enemy of a.enemies) assert.equal(checkMove(a, null, { ...enemy.home, atMs: 0 }, limits).ok, true, `${enemy.instance} home`);
    for (const exit of a.exits) {
      const into = pickArrival(rules, exit.to, id);
      assert.ok(into, `${id} -> ${exit.to} has an arrival`);
      const inZone = exit.zone.map((p) => ({ x: Math.round(p.x * 0.5 + exit.zone[0].x * 0.5), z: Math.round(p.z * 0.5 + exit.zone[0].z * 0.5) }));
      assert.ok(
        inZone.some((p) => checkTravel(rules, id, exit.to, p)),
        `${id} -> ${exit.to}: a point inside the exit zone allows travel`,
      );
    }
  }
});
