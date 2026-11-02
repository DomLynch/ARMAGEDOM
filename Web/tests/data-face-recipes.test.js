import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FACE_APPEARANCE_VERSION,
  FACE_RECIPES,
  FACE_HEADS,
  FACE_HAIRS,
  FACE_SKINS,
  FACE_WEATHERING,
} from "../src/face-recipes.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// face-recipes.js no longer spells out the sizes of its ingredient lists: the recipe count is heads x hairs x skins and every modulus is the
// size of the list it indexes. The fixture is the old module's 50 recipes (ids, presets, order) and list sizes.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/face-recipes-pre-data.json", import.meta.url)));

test("the 50 recipes equal the old module's exactly, in order, and every combination appears once", () => {
  assert.equal(FACE_APPEARANCE_VERSION, old.version);
  assert.deepEqual(FACE_RECIPES, old.recipes);
  assert.deepEqual(
    FACE_RECIPES.map((r) => r.id),
    old.recipes.map((r) => r.id),
  );
  assert.equal(FACE_RECIPES.length, FACE_HEADS.length * FACE_HAIRS.length * FACE_SKINS.length);
  assert.equal(new Set(FACE_RECIPES.map((r) => `${r.headPreset}/${r.hairPreset}/${r.skinPreset}`)).size, 50);
  assert.deepEqual(
    [FACE_HEADS.length, FACE_HAIRS.length, FACE_SKINS.length, FACE_WEATHERING.length],
    [old.heads, old.hairs, old.skins, old.weathering],
  );
  assert(FACE_RECIPES.every(Object.isFrozen));
});

test("face-recipes.js counts no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/face-recipes.js", import.meta.url), "utf8");
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  // The tightened gate (2, 3, 4, 10, 0.5 and named constants count) still finds numbers here: the baseline entry is the ratchet.
  assert.equal(countNumberLiterals(text).count, baseline.numberLiterals["face-recipes.js"] ?? 0);
});
