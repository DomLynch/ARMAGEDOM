import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { supplyProbe } from "./helpers/supplies-probe.mjs";
import { AREA1_SUPPLIES } from "../src/supplies.js";
import { VEST_BAG_POSITION } from "../src/engine/run-state.js";
import { GAME_DATA, validateSupplies } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch 3.3: AREA1_SUPPLIES and VEST_BAG_POSITION moved into Web/src/data/supplies.json. tests/fixtures/supplies-pre-data.json is
// what tests/helpers/supplies-probe.mjs printed on origin/main (761e950) before the move: the table, what each roamer issues and awards,
// the legacy loot rules built from it, and an encode -> restore -> encode round trip of a run save under the current save era.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/supplies-pre-data.json", import.meta.url)));
const rawText = fs.readFileSync(new URL("../src/data/supplies.json", import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(rawText));

test("the data file is pinned", () => {
  assert.equal(crypto.createHash("sha256").update(rawText).digest("hex"), "69156017db3ebe45588d34fbae08aad8e293bf897c3f58f5e47d100408639002");
});

test("behaviour is identical to before the move: table, issued drops, awards, loot rules, vest bag, save round trip", () => {
  const now = supplyProbe();
  assert.deepEqual(now, old);
  assert.deepEqual(Object.keys(now.table), Object.keys(old.table));
  assert.equal(now.roundTrip.same, true, "the run save survives restore and re-encode byte for byte");
  assert.deepEqual(now.roundTrip.raw.supplies.issued, ["westminster-roamer-1", "westminster-roamer-3", "westminster-roamer-5"]);
});

test("the tables are the frozen data rows", () => {
  assert.equal(AREA1_SUPPLIES, GAME_DATA.supplies.area1);
  assert.equal(VEST_BAG_POSITION, GAME_DATA.supplies.vestBagPosition);
  assert(Object.isFrozen(AREA1_SUPPLIES) && Object.isFrozen(AREA1_SUPPLIES["westminster-roamer-1"]) && Object.isFrozen(VEST_BAG_POSITION));
});

test("the loader rejects a broken supplies file", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateSupplies(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { delete d.area1["westminster-roamer-6"]; }));
  assert.throws(broken((d) => { d.area1["westminster-roamer-7"] = null; }));
  assert.throws(broken((d) => { d.area1 = { "westminster-roamer-2": null, "westminster-roamer-1": null, ...d.area1 }; }));
  assert.throws(broken((d) => { d.area1["westminster-roamer-1"].kind = "grenade"; }));
  assert.throws(broken((d) => { d.area1["westminster-roamer-1"].amount = 0; }));
  assert.throws(broken((d) => { d.area1["westminster-roamer-1"].amount = 1.5; }));
  assert.throws(broken((d) => { d.area1["westminster-roamer-1"].extra = 1; }));
  assert.throws(broken((d) => { d.vestBagPosition.y = 1; }));
  assert.throws(broken((d) => { d.vestBagPosition.x = "left"; }));
  assert.throws(broken((d) => { delete d.vestBagPosition; }));
});

test("run-state.js and supplies.js hold no constant table (SUPPLY_RULES and GEAR_ITEMS moved to data); the baseline says so", () => {
  assert.equal(countConstantTables(fs.readFileSync(new URL("../src/engine/run-state.js", import.meta.url), "utf8")), 0);
  assert.equal(countConstantTables(fs.readFileSync(new URL("../src/supplies.js", import.meta.url), "utf8")), 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert(!("engine/run-state.js" in baseline.constantTables));
  assert(!("supplies.js" in baseline.constantTables));
});
