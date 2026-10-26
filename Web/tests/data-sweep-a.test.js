import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { sweepAValues } from "./helpers/sweep-a-values.js";

// Sweep batch A: mob-size.js, wolf-native.js, salamander-native.js, animal-cycle.js and creature-behaviour-presets.js lose their last tuning
// numbers. The reaction ticks, the wolf mouth offset and the salamander mouth vertex are creatures.json rigCapabilities rows, the wolf reach
// is the existing catalogue reach, the size factors are `mobSize.factors`, the animal offsets are appearance.json `animalOffsets`, and the
// behaviour bounds sit in a check function. The fixture is every value the five modules computed before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/sweep-a-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));
const FILES = [
  "mob-size.js",
  "wolf-native.js",
  "salamander-native.js",
  "animal-cycle.js",
  "creature-behaviour-presets.js",
];

test("every value the five modules compute equals the old one exactly", () => {
  const now = sweepAValues();
  for (const part of Object.keys(old)) {
    assert.deepEqual(now[part], old[part], part);
    if (!Array.isArray(old[part]) && old[part] && typeof old[part] === "object")
      assert.deepEqual(Object.keys(now[part]), Object.keys(old[part]), `${part} key order`);
  }
  assert.equal(Object.keys(old.behaviours).length, 36);
  assert(
    Object.values(old.behaviours).filter((v) => String(v).startsWith("throws")).length >= 10,
    "the refusals are covered",
  );
});

test("the numbers are data", () => {
  assert.equal(GAME_DATA.creatures.rigCapabilities["original-wolf"].mouthOffset, 0.24995);
  assert.equal(GAME_DATA.creatures.rigCapabilities["giant-salamander"].mouthVertex, 5727);
  assert.equal(GAME_DATA.creatures.catalogue.reach["original-wolf"], 2.375);
  assert(Object.isFrozen(GAME_DATA.appearance.animalOffsets));
});

test("the loader rejects broken offsets", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.animalOffsets;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.animalOffsets.B;
    }),
  );
  assert.throws(
    broken((d) => {
      d.animalOffsets.C = {};
    }),
  );
  assert.throws(
    broken((d) => {
      d.animalOffsets.A["Not A Key"] = { x: 0, z: 0 };
    }),
  );
  assert.throws(
    broken((d) => {
      d.animalOffsets.A["east-roamer-9"].x = 5;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.animalOffsets.A["east-roamer-9"].z;
    }),
  );
});

test("the five modules keep no tuning number and the baseline no longer lists them", () => {
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of FILES) {
    assert.equal(
      countNumberLiterals(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).count,
      0,
      file,
    );
    assert.equal(baseline.numberLiterals[file], undefined, file);
  }
});
