import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DRONE_RULES } from "../src/drone-mechanics.js";
import { GAME_DATA, buildGameData, validateCreatures } from "../src/engine/game-data.js";
import { weaponRules } from "../src/engine/world-events.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: DRONE_RULES moved from drone-mechanics.js into Web/src/data/creatures.json `drone`.
// tests/fixtures/drone-rules-pre-data.json is the old in-code table, copied before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/drone-rules-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));

test("DRONE_RULES equals the old in-code table exactly (values and key order) and is frozen", () => {
  assert.deepEqual(DRONE_RULES, old);
  assert.deepEqual(Object.keys(DRONE_RULES), Object.keys(old));
  assert(Object.isFrozen(DRONE_RULES));
  assert.equal(GAME_DATA.creatures.drone, DRONE_RULES);
});

test("the server-facing bolt rule still reads the drone's damage", () => {
  assert.deepEqual(weaponRules().find((r) => r.weaponId === "bolt"), {
    weaponId: "bolt",
    maxDamagePerHit: old.damage,
    maxHitsPerS: 1 / (old.warningSeconds + old.recoverySeconds),
    reachM: old.boltRange,
  });
});

test("the loader rejects an unknown, missing or non-numeric drone field", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.drone.extra = 1; }));
  assert.throws(broken((d) => { delete d.drone.hp; }));
  assert.throws(broken((d) => { d.drone.boltSpeed = "fast"; }));
  assert.throws(broken((d) => { d.drone.radius = -1; }));
  assert.throws(broken((d) => { delete d.drone; }));
  assert.throws(() => buildGameData({ creatures: [{ schema_version: 2 }, validateCreatures] }));
});

test("drone-mechanics.js keeps one constant table (DRONE_KEYS, derived from the spawn rows); the baseline says so", () => {
  const text = fs.readFileSync(new URL("../src/drone-mechanics.js", import.meta.url), "utf8");
  assert.equal(countConstantTables(text), 1);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.constantTables["drone-mechanics.js"], 1);
});
