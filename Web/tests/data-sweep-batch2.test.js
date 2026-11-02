import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { FACE_RECIPES, FACE_HEADS, FACE_HAIRS, FACE_SKINS, FACE_WEATHERING } from "../src/face-recipes.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Phase 2b batch 2: face-recipes.js, animal-appearance.js, pickup-glow.js, roach-appearance.js and wolf-native.js lose their last tuning numbers.
// The recipe strides are appearance.json `faceRecipeCycle` and the wolf's body weight share is `wolfNative`; the rest was structure (xyz packing,
// four skin influences, three corners per triangle), now named constants with reasons. The animal, roach, pickup and wolf outputs stay identical
// (their own suites); the recipes are checked here against the old formula, copied from the module before the move.
const FILES = ["face-recipes.js", "animal-appearance.js", "pickup-glow.js", "roach-appearance.js", "wolf-native.js"];
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every face recipe equals the old formula's", () => {
  const H = FACE_HAIRS.length,
    S = FACE_SKINS.length,
    W = FACE_WEATHERING.length;
  const old = Array.from({ length: FACE_HEADS.length * H * S }, (_, i) => {
    const side = i % 2,
      head = FACE_HEADS[side],
      k = Math.floor(i / 2),
      hair = FACE_HAIRS[((k % H) * 2 + side * 3) % H],
      skin = FACE_SKINS[(Math.floor(k / H) * 2 + (k % H) + side * 3) % S];
    return {
      id: `face-${head.id}-${hair}-${skin.id}`,
      headPreset: head.id,
      hairPreset: hair,
      skinPreset: skin.id,
      weatheringPreset: FACE_WEATHERING[(Math.floor(k / H) + (k % H) + side * 2) % W],
    };
  });
  assert.equal(FACE_RECIPES.length, 50);
  assert.deepEqual(
    FACE_RECIPES.filter((r) => r.id !== "face-original"),
    old,
  );
  assert.equal(new Set(old.map((r) => r.id)).size, 50);
});

test("the new blocks equal the literals they replaced", () => {
  assert.deepEqual(GAME_DATA.appearance.faceRecipeCycle, {
    hairStride: 2,
    skinStride: 2,
    sideShift: 3,
    weatherSideShift: 2,
  });
  assert.deepEqual(GAME_DATA.appearance.wolfNative, { bodyWeightMin: 0.5 });
  assert(Object.isFrozen(GAME_DATA.appearance.faceRecipeCycle) && Object.isFrozen(GAME_DATA.appearance.wolfNative));
});

test("the loader rejects broken blocks", () => {
  const broken = (key, mutate) => () => {
    const d = rawAppearance();
    mutate(d[key]);
    validateAppearance(d);
  };
  assert.throws(broken("faceRecipeCycle", (c) => delete c.sideShift));
  assert.throws(broken("faceRecipeCycle", (c) => (c.hairStride = 1.5)));
  assert.throws(broken("faceRecipeCycle", (c) => (c.extra = 1)));
  assert.throws(broken("wolfNative", (c) => (c.bodyWeightMin = 0)));
  assert.throws(broken("wolfNative", (c) => (c.bodyWeightMin = 2)));
  assert.doesNotThrow(broken("faceRecipeCycle", () => {}));
});

const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
for (const file of FILES)
  test(`${file} keeps no tuning number and the baseline no longer lists it`, () => {
    const text = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.equal(countNumberLiterals(text).count, 0);
    assert.equal(baseline.numberLiterals[file], undefined);
  });
