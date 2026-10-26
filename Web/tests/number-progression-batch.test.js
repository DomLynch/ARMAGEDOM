import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateProgressionBase, validateUniqueReward } from "../src/engine/game-data.js";
import { ATTRIBUTE_BASELINE, DEFAULT_ATTRIBUTES } from "../src/engine/progression-rules.js";
import { effectiveWeaponDamage } from "../src/engine/progression-runtime.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Backend phase 2b, batch B (value-identical): progression-rules 4, progression-core 4, progression-state 2, progression-runtime 1,
// unique-reward-runtime 3, unique-reward-core 1, safehouse 2, save-eras 2, all to 0. The default hit points and the registry cap moved to
// data/progressionBase.json, the drop ring's step count to data/uniqueReward.json. The one pickup reach (1.3) is data/uniqueReward.json
// `pickupRadius`, read by the save layer's claim gate and by the view; the old visual.weaponViews copy is gone. The knife's base damage
// and the player radius are read from the existing combatRules.player row. Save versions and the attribute baseline stay in code, marked.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const engine = (name) => text(`../src/engine/${name}.js`);
const raw = (name) => structuredClone(JSON.parse(text(`../src/data/${name}.json`)));

test("the data holds exactly the numbers the code used to hold", () => {
  assert.deepEqual(GAME_DATA.progressionBase, { schema_version: 1, defaultMaxHP: 150, placementRegistryMax: 128 });
  assert.equal(GAME_DATA.uniqueReward.pickupRadius, 1.3, "the one pickup reach, shared by the view and the core");
  assert(!("pickupReach" in GAME_DATA.visual.weaponViews.uniqueReward), "no second copy in the view row");
  assert.equal(GAME_DATA.uniqueReward.dropSearch.ringSteps, 16);
  assert.deepEqual([...GAME_DATA.uniqueReward.dropSearch.nearRadii], [0.25, 0.5, 0.75, 1]);
  assert.equal(GAME_DATA.combatRules.player.damage, 20, "the knife's base damage the progression scaling divides by");
  assert.equal(GAME_DATA.combatRules.player.radius, 0.4, "the radius the safehouse and the drop search clear a spot with");
});

test("the attribute baseline is the server's record-cap floor", () => {
  assert.equal(ATTRIBUTE_BASELINE, 10);
  assert(Object.values(DEFAULT_ATTRIBUTES).every((v) => v === 10));
  const migration = text("../../supabase/migrations/20261024000007_arma_save_envelope.sql");
  assert(migration.includes("('progression.attributes.*', 'num', 10, 20, true)"));
});

test("the drop ring visits the same angles as before", () => {
  const steps = GAME_DATA.uniqueReward.dropSearch.ringSteps;
  for (let i = 0; i < steps; i++) assert.equal((i * Math.PI) / (steps >> 1), (i * Math.PI) / 8, `step ${i}`);
});

test("the knife damage scaling still divides by 20, other weapons are untouched", () => {
  assert.equal(effectiveWeaponDamage({ player: { damage: 30 } }, "knife", 10), 15);
  assert.equal(effectiveWeaponDamage({ player: { damage: 30 } }, "westminster-start-pistol-v1", 10), 10);
});

test("the modules read the numbers from data", () => {
  const reads = {
    "progression-state": ["GAME_DATA.progressionBase.defaultMaxHP", "GAME_DATA.progressionBase.placementRegistryMax"],
    "progression-runtime": ["GAME_DATA.combatRules.player.damage"],
    "unique-reward-runtime": ["ringSteps", "GAME_DATA.combatRules.player.radius"],
    "unique-reward-core": ["GAME_DATA.uniqueReward.pickupRadius"],
    safehouse: ["g.player.radius ?? GAME_DATA.combatRules.player.radius"],
  };
  for (const [file, uses] of Object.entries(reads)) for (const use of uses) assert(engine(file).includes(use), `${file}: ${use}`);
  assert(text("../src/unique-reward-view.js").includes("GAME_DATA.uniqueReward.pickupRadius + 1e-8"), "the view reads the same row");
});

test("the loader refuses missing, extra and out-of-range numbers", () => {
  const broken = (validate, name, mutate) => () => {
    const d = raw(name);
    mutate(d);
    validate(d);
  };
  assert.doesNotThrow(broken(validateProgressionBase, "progressionBase", () => {}));
  assert.doesNotThrow(broken(validateUniqueReward, "uniqueReward", () => {}));
  assert.throws(broken(validateProgressionBase, "progressionBase", (d) => { delete d.defaultMaxHP; }));
  assert.throws(broken(validateProgressionBase, "progressionBase", (d) => { d.extra = 1; }));
  assert.throws(broken(validateProgressionBase, "progressionBase", (d) => { d.placementRegistryMax = 0; }));
  assert.throws(broken(validateProgressionBase, "progressionBase", (d) => { d.defaultMaxHP = 150.5; }));
  assert.throws(broken(validateUniqueReward, "uniqueReward", (d) => { delete d.pickupRadius; }));
  assert.throws(broken(validateUniqueReward, "uniqueReward", (d) => { d.pickupRadius = 0; }));
  assert.throws(broken(validateUniqueReward, "uniqueReward", (d) => { d.pickupRadius = 9; }), "up to 5 m");
  assert.throws(broken(validateUniqueReward, "uniqueReward", (d) => { d.dropSearch.ringSteps = 2; }));
  assert.throws(broken(validateUniqueReward, "uniqueReward", (d) => { d.dropSearch.ringSteps = 12.5; }));
  assert.throws(broken(validateUniqueReward, "uniqueReward", (d) => { d.dropSearch.ringSteps = 15; }), "half a turn must be whole steps");
});

test("the gate counts 0 in the eight files and their baseline entries are gone", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json")).numberLiterals;
  for (const file of [
    "progression-rules",
    "progression-core",
    "progression-state",
    "progression-runtime",
    "unique-reward-runtime",
    "unique-reward-core",
    "safehouse",
    "save-eras",
  ]) {
    assert.equal(countNumberLiterals(engine(file)).count, 0, file);
    assert(!(`engine/${file}.js` in baseline), file);
  }
});
