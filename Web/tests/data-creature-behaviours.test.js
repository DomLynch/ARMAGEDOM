import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures } from "../src/engine/game-data.js";
import { CREATURE_BEHAVIOURS, RECIPE_BEHAVIOURS, resolveCreatureBehaviour } from "../src/creature-behaviour-presets.js";
import { RESIDENT_INTENTS, RECIPE_INTENTS, resolveResidentIntent } from "../src/creature-behaviour-intents.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: the four behaviour tables moved from creature-behaviour-presets.js / -intents.js into creatures.json `behaviours`.
// tests/fixtures/creature-behaviour-pre-data.json is the old in-code tables, dumped from the old modules before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/creature-behaviour-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));
const capabilities = ["home", "lineOfSight", "completedAttack", "collisionMove", "wakeTime", "nativeLocomotion", "eligibleCompanions"];

// 28 Oct: the crow's recipe rows are appended (art/monster-crow).
old.recipeBehaviours["crow-carrion"] = "brisk";
old.recipeIntents["crow-carrion"] = "short-burst";
old.recipeIntents["crow-ragged"] = "baseline";
// 28 Oct: the giant eel's recipe rows are appended (art/monster-eel).
old.recipeBehaviours["eel-river-ambusher"] = "baseline";
old.recipeIntents["eel-river-ambusher"] = "ambush";
// 28 Oct: the elephant recipe rows are appended (art/monster-elephant).
old.recipeBehaviours["elephant-ashen-bull"] = "baseline";
old.recipeIntents["elephant-ashen-bull"] = "baseline";
// 28 Oct: the spider's recipe rows are appended (art/monster-spider).
old.recipeBehaviours["spider-crypt"] = "baseline";
old.recipeIntents["spider-crypt"] = "ambush";
// 28 Oct: the centipede's recipe rows are appended (art/monster-centipede).
old.recipeBehaviours["centipede-lurker"] = "brisk";
old.recipeIntents["centipede-lurker"] = "ambush";
test("every table equals the old in-code table exactly (values and key order) and is frozen", () => {
  for (const [table, rows, expected] of [
    ["presets", CREATURE_BEHAVIOURS, old.presets],
    ["recipeBehaviours", RECIPE_BEHAVIOURS, old.recipeBehaviours],
    ["intents", RESIDENT_INTENTS, old.intents],
    ["recipeIntents", RECIPE_INTENTS, old.recipeIntents],
  ]) {
    assert.deepEqual(rows, expected, table);
    assert.deepEqual(Object.keys(rows), Object.keys(expected), `${table} key order`);
    assert(Object.isFrozen(rows), `${table} frozen`);
    assert.equal(GAME_DATA.creatures.behaviours[table], rows);
  }
  assert(Object.isFrozen(CREATURE_BEHAVIOURS["gaunt-thrust"].attackPattern));
});

test("every recipe resolves to the same tuning and intent as the old rows", () => {
  const foundation = { moveSpeed: 2, recoveryDelay: 0.4, weapon: "knife", supportedActions: ["slash", "stab", "heavy"] };
  for (const [recipe, name] of Object.entries(old.recipeBehaviours)) {
    const p = old.presets[name];
    const got = resolveCreatureBehaviour(name, foundation);
    assert.equal(got.moveSpeed, foundation.moveSpeed * p.speedFactor, recipe);
    assert.equal(got.recoveryDelay, foundation.recoveryDelay + p.recoveryAdd, recipe);
    assert.deepEqual(got.attackPattern, p.attackPattern, recipe);
  }
  for (const [recipe, name] of Object.entries(old.recipeIntents))
    assert.deepEqual(resolveResidentIntent(recipe, { behaviourCapabilities: capabilities }), old.intents[name], recipe);
});

test("the loader rejects a broken behaviours block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.behaviours; }));
  assert.throws(broken((d) => { d.behaviours.extra = {}; }));
  assert.throws(broken((d) => { d.behaviours.presets.cautious.extra = 1; }));
  assert.throws(broken((d) => { delete d.behaviours.presets.cautious.recoveryAdd; }));
  assert.throws(broken((d) => { d.behaviours.presets.cautious.speedFactor = 0; }));
  assert.throws(broken((d) => { d.behaviours.presets["gaunt-thrust"].attackPattern = []; }));
  assert.throws(broken((d) => { delete d.behaviours.intents.ambush.wakeDistance; }));
  assert.throws(broken((d) => { d.behaviours.intents.ambush.holdUntilWake = 1; }));
  assert.throws(broken((d) => { d.behaviours.intents["area-pursuit"].pursuitScope = "world"; }));
  assert.throws(broken((d) => { d.behaviours.recipeBehaviours["rat-sewer"] = "missing"; }));
  assert.throws(broken((d) => { d.behaviours.recipeIntents["rat-sewer"] = "missing"; }));
});

test("the two modules keep no constant tables; the baseline no longer lists them", () => {
  for (const file of ["creature-behaviour-presets.js", "creature-behaviour-intents.js"]) {
    assert.equal(countConstantTables(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")), 0, file);
  }
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.constantTables["creature-behaviour-presets.js"], undefined);
  assert.equal(baseline.constantTables["creature-behaviour-intents.js"], undefined);
});
