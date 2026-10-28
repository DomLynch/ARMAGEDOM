import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, buildGameData, validateCreatures } from "../src/engine/game-data.js";
import { creatureCatalogue, animalFoundationParameters } from "../src/engine/creature-catalogue.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: the catalogue's `support` and `reach` tables moved from engine/creature-catalogue.js into creatures.json `catalogue`.
// tests/fixtures/creature-catalogue-pre-data.json is the old in-code pair, copied before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/creature-catalogue-pre-data.json", import.meta.url)));
// 28 Oct: the crow rows are appended (art/monster-crow).
old.support["original-crow"] = ["rat-native-bite", "teeth", "original-crow", ["attack", "attackLow"]];
old.reach["original-crow"] = 1.4004105398402;
// 28 Oct: the giant eel rows are appended (art/monster-eel).
old.support["giant-eel"] = ["eel-native-bite", "teeth", "giant-eel", ["attack"]];
old.reach["giant-eel"] = 0.8;
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));

test("the data rows equal the old in-code tables exactly (values and key order) and are frozen", () => {
  const { support, reach } = GAME_DATA.creatures.catalogue;
  assert.deepEqual(Object.keys(support), Object.keys(old.support));
  for (const [id, [controller, weapon, rig, actions]] of Object.entries(old.support))
    assert.deepEqual(support[id], { controller, weapon, rig, actions });
  assert.deepEqual(reach, old.reach);
  assert.deepEqual(Object.keys(reach), Object.keys(old.reach));
  assert(Object.isFrozen(support) && Object.isFrozen(support["original-rat"].actions) && Object.isFrozen(reach));
});

test("native animal parameters still carry the old contact reach for every reviewed animal", () => {
  for (const [id, reach] of Object.entries(old.reach)) {
    const p = animalFoundationParameters(id, 1);
    assert.equal(p.contactGoalReach, reach);
    assert.equal(p.rig, id);
  }
  assert.throws(() => animalFoundationParameters("hollow-scavenger", 1), /Expected native animal foundation/);
  assert.equal(creatureCatalogue.get("low-hover-drone").behaviour.controllerRef, old.support["low-hover-drone"][0]);
});

test("the loader rejects a broken catalogue block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.catalogue.extra = 1; }));
  assert.throws(broken((d) => { delete d.catalogue; }));
  assert.throws(broken((d) => { delete d.catalogue.support["original-rat"].weapon; }));
  assert.throws(broken((d) => { d.catalogue.support["original-rat"].actions = "attack"; }));
  assert.throws(broken((d) => { d.catalogue.support["original-rat"].rig = 3; }));
  assert.throws(broken((d) => { d.catalogue.reach["original-rat"] = "far"; }));
  assert.throws(broken((d) => { d.catalogue.reach["original-ghost"] = 1; }));
  assert.throws(() => buildGameData({ creatures: [{ schema_version: 2 }, validateCreatures] }));
});

test("creature-catalogue.js keeps one constant table (the engine capability list); the baseline says so", () => {
  const text = fs.readFileSync(new URL("../src/engine/creature-catalogue.js", import.meta.url), "utf8");
  assert.equal(countConstantTables(text), 1);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.constantTables["engine/creature-catalogue.js"], 1);
});
