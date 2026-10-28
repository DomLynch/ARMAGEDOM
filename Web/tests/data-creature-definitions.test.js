import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatureDefinitions } from "../src/engine/game-data.js";
import { creatureDefinitions, recipeFoundations, nativeRoleDefinitions } from "../src/engine/creature-definitions.js";
import { creatureCatalogue } from "../src/engine/creature-catalogue.js";

// Data move: the creature definitions, recipe map and native roles moved from engine/creature-definitions.js (45 rig-name literals)
// into data/creatureDefinitions.json. tests/fixtures/creature-definitions-pre-data.json is the old module's exports, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/creature-definitions-pre-data.json", import.meta.url)));
// 28 Oct: the crow foundation and its two recipes are appended rows (art/monster-crow).
old.definitions.push({
  id: "original-crow",
  rig: "original-crow",
  contactRig: null,
  assetRef: "model.original-crow",
  clips: { idle: "rat_idle", walk: "rat_walk", run: "rat_run", hit: "rat_hit", death: "rat_death", attack: "rat_bite", attackLow: "rat_bite_low" },
  scale: { model: 4, character: 1.265, visual: 1.3225, mobSizeMode: "fixed-one", bodyScale: 1, appliedBy: "actor-root-wrapper" },
  stats: { health: 24, radius: 1.3, moveSpeed: 2.3, recoveryDelay: 0, weapon: "teeth" },
  behaviour: { controllerRef: "rat-native-bite", parameterPreset: "baseline", intentPolicyRef: "existing-resident-intent-policy" },
  clipSourceRefs: [],
  preparationRefs: [],
  equipmentRef: null,
  provenanceRef: "art/crow/PROVENANCE.md",
  runtimeIdentity: "original-crow",
});
old.recipeFoundations["crow-carrion"] = "original-crow";
old.recipeFoundations["crow-ragged"] = "original-crow";
// 28 Oct: the giant eel foundation and its recipe are appended rows (art/monster-eel).
old.definitions.push({
  id: "giant-eel",
  rig: "giant-eel",
  contactRig: null,
  assetRef: "model.giant-eel",
  clips: { idle: "Idle", walk: "Walk", run: "Run", attack: "Bite", slash: "Bite", hit: "Hurt", death: "Death", flee: "Flee" },
  scale: { model: 0.9, character: 1.265, visual: 1.3225, mobSizeMode: "fixed-one", bodyScale: 1, appliedBy: "actor-root-wrapper" },
  stats: { health: 90, radius: 0.35, moveSpeed: 2, recoveryDelay: 0, weapon: "teeth" },
  behaviour: { controllerRef: "eel-native-bite", parameterPreset: "baseline", intentPolicyRef: "existing-resident-intent-policy" },
  clipSourceRefs: [],
  preparationRefs: [],
  equipmentRef: null,
  provenanceRef: "art/eel/PROVENANCE.md",
  runtimeIdentity: "giant-eel",
});
old.recipeFoundations["eel-river-ambusher"] = "giant-eel";
// 28 Oct: the elephant foundation, its recipe and its native role are appended rows (art/monster-elephant).
old.definitions.push({
  id: "original-elephant",
  rig: "original-elephant",
  contactRig: null,
  assetRef: "model.original-elephant",
  clips: { idle: "Idle", walk: "Walk", run: "Run", attack: "Bite", slash: "Bite", hit: "Hurt", death: "Death", flee: "Flee" },
  scale: { model: 5, character: 1.265, visual: 1.3225, mobSizeMode: "fixed-one", bodyScale: 1, appliedBy: "actor-root-wrapper" },
  stats: { health: 150, radius: 1.3, moveSpeed: 2.2, recoveryDelay: 0, weapon: "teeth" },
  behaviour: { controllerRef: "elephant-native-bite", parameterPreset: "baseline", intentPolicyRef: "existing-resident-intent-policy" },
  clipSourceRefs: [],
  preparationRefs: [],
  equipmentRef: null,
  provenanceRef: "art/monster-elephant/PROVENANCE.md",
  runtimeIdentity: "original-elephant",
});
old.recipeFoundations["elephant-ashen-bull"] = "original-elephant";
old.nativeRoles.push({ area: "elephant-and-castle", placement: "elephant-and-castle-resident-2", recipe: "elephant-ashen-bull", foundation: "original-elephant", cycles: ["A", "B"], preset: "baseline" });
// 28 Oct: the spider foundation and its recipe are appended rows (art/monster-spider).
old.definitions.push({
  id: "original-spider",
  rig: "original-spider",
  contactRig: null,
  assetRef: "model.original-spider",
  clips: { idle: "roach_idle", walk: "roach_walk", run: "roach_run", hit: "roach_hit", death: "roach_death", attack: "roach_bite_scaled" },
  scale: { model: 3, character: 1.265, visual: 1.3225, mobSizeMode: "fixed-one", bodyScale: 1, appliedBy: "actor-root-wrapper" },
  stats: { health: 36, radius: 1.54, moveSpeed: 2, recoveryDelay: 0, weapon: "teeth" },
  behaviour: { controllerRef: "roach-native-bite", parameterPreset: "baseline", intentPolicyRef: "existing-resident-intent-policy" },
  clipSourceRefs: ["animation.roach-scaled-bite"],
  preparationRefs: [],
  equipmentRef: null,
  provenanceRef: "art/monster-spider",
  runtimeIdentity: "original-spider",
});
old.recipeFoundations["spider-crypt"] = "original-spider";
// 28 Oct: the centipede foundation and its recipe are appended rows (art/monster-centipede).
old.definitions.push({
  id: "giant-centipede",
  rig: "giant-centipede",
  contactRig: null,
  assetRef: "model.giant-centipede",
  clips: { idle: "roach_idle", walk: "roach_walk", run: "roach_run", hit: "roach_hit", death: "roach_death", attack: "roach_bite_scaled" },
  scale: { model: 3, character: 1.265, visual: 1.3225, mobSizeMode: "fixed-one", bodyScale: 1, appliedBy: "actor-root-wrapper" },
  stats: { health: 60, radius: 1.7, moveSpeed: 2.3, recoveryDelay: 0, weapon: "teeth" },
  behaviour: { controllerRef: "centipede-native-bite", parameterPreset: "baseline", intentPolicyRef: "existing-resident-intent-policy" },
  clipSourceRefs: ["animation.roach-scaled-bite"],
  preparationRefs: [],
  equipmentRef: null,
  provenanceRef: "art/centipede/PROVENANCE.md",
  runtimeIdentity: "giant-centipede",
});
old.recipeFoundations["centipede-lurker"] = "giant-centipede";
const raw = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatureDefinitions.json", import.meta.url))));

test("the three exports equal the old in-code values exactly, in order, and are frozen", () => {
  assert.deepEqual(creatureDefinitions, old.definitions);
  assert.deepEqual(recipeFoundations, old.recipeFoundations);
  assert.deepEqual(nativeRoleDefinitions, old.nativeRoles);
  assert.deepEqual(Object.keys(recipeFoundations), Object.keys(old.recipeFoundations));
  assert.deepEqual(
    creatureDefinitions.map((r) => Object.keys(r)),
    old.definitions.map((r) => Object.keys(r)),
  );
  for (const t of [creatureDefinitions, recipeFoundations, nativeRoleDefinitions, creatureDefinitions[1].clips])
    assert(Object.isFrozen(t));
  assert.equal(creatureDefinitions, GAME_DATA.creatureDefinitions.definitions);
});

test("the catalogue built from the data resolves every recipe to the foundation it did before", () => {
  for (const [recipe, foundation] of Object.entries(old.recipeFoundations))
    assert.equal(creatureCatalogue.forRecipe(recipe).id, foundation, recipe);
  for (const row of old.definitions) assert.equal(creatureCatalogue.get(row.id).runtimeIdentity, row.runtimeIdentity);
});

test("the validator rejects malformed definitions", () => {
  validateCreatureDefinitions(raw());
  for (const [edit, why] of [
    [(d) => (d.definitions = []), /definitions/],
    [(d) => d.definitions.push({ ...d.definitions[0] }), /distinct/],
    [(d) => (d.recipeFoundations["rat-ash"] = "nope"), /unknown foundation/],
    [(d) => (d.nativeRoles[0].cycles = ["C"]), /cycles/],
    [(d) => (d.nativeRoles[0].recipe = "dog-ash-coated"), /recipe does not belong/],
    [(d) => (d.nativeRoles[0].extra = 1), Error],
    [(d) => delete d.nativeRoles, Error],
  ]) {
    const d = raw();
    edit(d);
    assert.throws(() => validateCreatureDefinitions(d), why);
  }
});
