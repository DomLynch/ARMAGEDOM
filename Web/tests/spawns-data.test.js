import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AREA_MOB_SPAWNS, hollowLocomotionFor } from "../src/area-mob-spawns.js";
import { AREA_DRONE_SPAWNS } from "../src/area-drone-spawns.js";
import { GAME_DATA, buildGameData, validateSpawns } from "../src/engine/game-data.js";

// The rows moved from code to data/spawns.json unchanged. This digest was taken from the old constants (AREA_MOB_SPAWNS,
// AREA_DRONE_SPAWNS and the crookedResidents set) before they were deleted; a different digest is a different world, so it is a
// decision (and the writer's server/data/spawns.json must be regenerated), never a side effect of editing the data.
const DIGEST = "2af6b7a100db22b679970d387fd774e5024ceca27bb4d9ac1c4f18f7784bdb88";
const digest = (mob, drones, crooked) =>
  createHash("sha256")
    .update(JSON.stringify({ mob, drones, crooked }))
    .digest("hex");

test("the spawn rows are byte-for-byte what the code constants were", () => {
  assert.equal(digest(AREA_MOB_SPAWNS, AREA_DRONE_SPAWNS, GAME_DATA.spawns.crookedResidents), DIGEST);
  assert.deepEqual(Object.keys(AREA_MOB_SPAWNS), ["westminster", "east", "south"]);
  assert.deepEqual(
    Object.values(AREA_MOB_SPAWNS).map((rows) => rows.length),
    [6, 9, 9],
  );
  assert.deepEqual(
    Object.values(AREA_DRONE_SPAWNS).map((rows) => rows.length),
    [1, 1, 1],
  );
});

test("the rows are deeply frozen and shared with the loader", () => {
  assert.equal(AREA_MOB_SPAWNS, GAME_DATA.spawns.mob);
  assert.equal(AREA_DRONE_SPAWNS, GAME_DATA.spawns.drones);
  assert.ok(Object.isFrozen(AREA_MOB_SPAWNS.east[1].encounter) && Object.isFrozen(AREA_MOB_SPAWNS.south[0].patrol[1]));
  assert.throws(() => {
    "use strict";
    AREA_MOB_SPAWNS.east[0].pos.x = 0;
  }, TypeError);
});

test("the crooked gait follows the data", () => {
  const rig = { kind: 0, rig: "hollow-scavenger" };
  for (const key of GAME_DATA.spawns.crookedResidents)
    assert.equal(hollowLocomotionFor({ ...rig, placementKey: key }), "crooked-hollow", key);
  assert.equal(hollowLocomotionFor({ ...rig, placementKey: "east-roamer-1" }), null);
  assert.equal(hollowLocomotionFor({ kind: 0, rig: "original-rat", placementKey: "east-roamer-3" }), null);
});

test("the validator refuses bad rows", () => {
  const good = structuredClone(GAME_DATA.spawns);
  const bad = (change) => {
    const copy = structuredClone(good);
    change(copy);
    assert.throws(() => validateSpawns(copy), /Invalid/);
  };
  assert.doesNotThrow(() => validateSpawns(structuredClone(good)));
  bad((d) => (d.mob.east[0].key = d.mob.east[1].key));
  bad((d) => (d.mob.east[0].pos.x = "3"));
  bad((d) => (d.mob.east[0].patrol = [d.mob.east[0].pos]));
  bad((d) => (d.mob.east[0].extra = 1));
  bad((d) => d.crookedResidents.push("no-such-row"));
  bad((d) => d.crookedResidents.push(d.crookedResidents[0]));
  bad((d) => (d.drones.east[0].key = d.mob.east[0].key));
});

test("a data file with the wrong schema_version is refused", () => {
  assert.throws(() => buildGameData({ spawns: [{ ...structuredClone(GAME_DATA.spawns), schema_version: 2 }, validateSpawns] }));
});
