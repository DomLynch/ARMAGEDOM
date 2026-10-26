import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatureDefinitions } from "../src/engine/game-data.js";
import { creatureDefinitions, recipeFoundations, nativeRoleDefinitions } from "../src/engine/creature-definitions.js";
import { creatureCatalogue } from "../src/engine/creature-catalogue.js";

// Data move: the creature definitions, recipe map and native roles moved from engine/creature-definitions.js (45 rig-name literals)
// into data/creatureDefinitions.json. tests/fixtures/creature-definitions-pre-data.json is the old module's exports, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/creature-definitions-pre-data.json", import.meta.url)));
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
