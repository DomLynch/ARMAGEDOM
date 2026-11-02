import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LEGACY_DROP_EVENTS, LEGACY_PICKUP_EVENTS, WORLD_DISPATCHERS } from "../src/engine/world-events.js";
import { GAME_DATA, buildGameData, validateWorldEvents } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: the journal's legacy-event mapping and dispatcher names moved from world-events.js into src/data/worldEvents.json.
// tests/fixtures/world-events-pre-data.json holds the old in-code values, copied before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/world-events-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/worldEvents.json", import.meta.url))));

test("the moved tables equal the old in-code values exactly, in order, and are frozen", () => {
  assert.deepEqual([...LEGACY_DROP_EVENTS], old.LEGACY_DROP_EVENTS);
  assert.deepEqual(LEGACY_PICKUP_EVENTS, old.LEGACY_PICKUP_EVENTS);
  assert.deepEqual(Object.keys(LEGACY_PICKUP_EVENTS), Object.keys(old.LEGACY_PICKUP_EVENTS));
  assert.deepEqual([...WORLD_DISPATCHERS], old.WORLD_DISPATCHERS);
  assert(Object.isFrozen(LEGACY_PICKUP_EVENTS) && Object.isFrozen(WORLD_DISPATCHERS));
  assert.equal(GAME_DATA.worldEvents.legacyPickupEvents, LEGACY_PICKUP_EVENTS);
});

test("the loader rejects unknown, missing, duplicate and malformed rows", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateWorldEvents(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { delete d.dispatchers; }));
  assert.throws(broken((d) => { d.dispatchers.push("dispatchPistol"); }));
  assert.throws(broken((d) => { d.legacyDropEvents = []; }));
  assert.throws(broken((d) => { d.legacyPickupEvents.pickup = "somethingElse"; }));
  assert.throws(broken((d) => { d.legacyPickupEvents = []; }));
  assert.throws(() => buildGameData({ worldEvents: [{ schema_version: 2 }, validateWorldEvents] }));
});

test("world-events.js keeps ten constant tables (the wire schema); the baseline says so", () => {
  const text = fs.readFileSync(new URL("../src/engine/world-events.js", import.meta.url), "utf8");
  assert.equal(countConstantTables(text), 10);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.constantTables["engine/world-events.js"], 10);
});
