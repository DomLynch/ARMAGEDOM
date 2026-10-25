import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures } from "../src/engine/game-data.js";
import { ANIMAL_CYCLES, animalPlacement, nextAnimalCycle } from "../src/animal-cycle.js";
import { GAUNT_HUMAN_CYCLES, gauntHumanRecipe } from "../src/gaunt-human-bindings.js";
import { HOLLOW_TUNING, createHollowEncounter } from "../src/hollow-encounter.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: ANIMAL_CYCLES, GAUNT_HUMAN_CYCLES and HOLLOW_TUNING moved from animal-cycle.js, gaunt-human-bindings.js and
// hollow-encounter.js into creatures.json (`animalCycles`, `gauntHumanCycles`, `hollowTuning`). The fixture is the old in-code
// tables, dumped from the old modules before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/animal-gaunt-hollow-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));

test("every table equals the old in-code table exactly (values and key order) and is frozen", () => {
  for (const [rows, expected, name] of [
    [ANIMAL_CYCLES, old.animalCycles, "animalCycles"],
    [GAUNT_HUMAN_CYCLES, old.gauntHumanCycles, "gauntHumanCycles"],
    [HOLLOW_TUNING, old.hollowTuning, "hollowTuning"],
  ]) {
    assert.deepEqual(rows, expected, name);
    assert.deepEqual(Object.keys(rows), Object.keys(expected), `${name} key order`);
    assert(Object.isFrozen(rows), `${name} frozen`);
    assert.equal(GAME_DATA.creatures[name], rows);
  }
  for (const cycle of ["A", "B"]) {
    assert.deepEqual(Object.keys(ANIMAL_CYCLES[cycle]), Object.keys(old.animalCycles[cycle]), `animal ${cycle} key order`);
    assert(Object.isFrozen(ANIMAL_CYCLES[cycle]) && Object.isFrozen(GAUNT_HUMAN_CYCLES[cycle]));
  }
});

test("animal placements, gaunt bindings and the hollow encounter behave as before", () => {
  for (const cycle of ["A", "B"])
    for (const [key, recipe] of Object.entries(old.animalCycles[cycle])) {
      const got = animalPlacement(cycle, key);
      assert.equal(got.recipe, recipe, `${cycle} ${key}`);
      const offset =
        key === "east-roamer-9" ? { x: -0.014, z: -0.278 } : cycle === "A" && key === "east-roamer-5" ? { x: 0, z: -0.046 } : { x: 0, z: 0 };
      assert.deepEqual(got.offset, offset, `${cycle} ${key} offset`);
    }
  assert.equal(animalPlacement("A", "missing"), null);
  assert.equal(nextAnimalCycle("A"), "B");
  for (const cycle of ["A", "B"])
    for (const [areaId, key] of Object.entries(old.gauntHumanCycles[cycle])) {
      const entity = { kind: 1, rig: "hollow-scavenger", placementKey: key };
      assert.equal(gauntHumanRecipe(cycle, areaId, entity), "human-gaunt-skulker", `${cycle} ${areaId}`);
      assert.equal(gauntHumanRecipe(cycle, areaId, { ...entity, placementKey: "other" }), null);
    }
  const character = { rig: "hollow-scavenger", weapon: "knife", contactRig: "goblin", bodyScale: 1 };
  const encounter = createHollowEncounter(character);
  for (const [key, value] of Object.entries(old.hollowTuning)) assert.equal(encounter[key], value, key);
  assert.equal(createHollowEncounter(character, { count: 5 }).count, 5);
  assert.throws(() => createHollowEncounter(character, { count: 6 }));
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(broken(() => {}));
  for (const key of ["animalCycles", "gauntHumanCycles", "hollowTuning"]) assert.throws(broken((d) => { delete d[key]; }), key);
  assert.throws(broken((d) => { delete d.animalCycles.B; }));
  assert.throws(broken((d) => { d.animalCycles.C = {}; }));
  assert.throws(broken((d) => { d.animalCycles.A = {}; }));
  assert.throws(broken((d) => { d.animalCycles.A["not a key"] = "rat-ash"; }));
  assert.throws(broken((d) => { d.animalCycles.A["westminster-roamer-2"] = 7; }));
  assert.throws(broken((d) => { delete d.animalCycles.B["south-roamer-8"]; }));
  assert.throws(broken((d) => { d.gauntHumanCycles.A.east = "East Roamer"; }));
  assert.throws(broken((d) => { d.gauntHumanCycles.B = {}; }));
  assert.throws(broken((d) => { delete d.hollowTuning.regen; }));
  assert.throws(broken((d) => { d.hollowTuning.extra = 1; }));
  assert.throws(broken((d) => { d.hollowTuning.count = 2; }));
  assert.throws(broken((d) => { d.hollowTuning.count = 3.5; }));
  assert.throws(broken((d) => { d.hollowTuning.health = 0; }));
  assert.throws(broken((d) => { d.hollowTuning.moveSpeed = 7; }));
  assert.throws(broken((d) => { d.hollowTuning.recovery = -1; }));
  assert.throws(broken((d) => { d.hollowTuning.aggression = "0.6"; }));
});

test("the three modules keep no constant tables; the baseline no longer lists them", () => {
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of ["animal-cycle.js", "gaunt-human-bindings.js", "hollow-encounter.js"]) {
    assert.equal(countConstantTables(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")), 0, file);
    assert.equal(baseline.constantTables[file], undefined, file);
  }
});
