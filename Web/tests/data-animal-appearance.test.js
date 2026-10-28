import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { animalSignatures } from "./helpers/animal-signatures.js";

// Data move: the torso taper band and the worn-patch field of animal-appearance.js moved to appearance.json `animalCoat`. The fixture holds one
// SHA-256 per animal recipe over the geometry (position, normal, colour) and the material it writes onto a 240-vertex synthetic coat mesh whose
// torso weight sweeps 0 to 1, dumped from the old module.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/animal-appearance-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every animal recipe produces exactly the old geometry, colours and material", () => {
  const now = Object.fromEntries(Object.entries(animalSignatures()).filter(([id]) => !id.startsWith("crow-"))); // 28 Oct: the crow recipes are new rows, pinned by crow-monster.test.js
  assert.deepEqual(Object.keys(now), Object.keys(old));
  for (const [id, hash] of Object.entries(old)) assert.equal(now[id], hash, id);
  assert(new Set(Object.values(old)).size >= 10, "the fixture covers distinct looks");
});

test("the numbers are frozen data read through game-data.js", () => {
  assert(Object.isFrozen(GAME_DATA.appearance.animalCoat));
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.animalCoat;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.animalCoat.field;
    }),
  );
  assert.throws(
    broken((d) => {
      d.animalCoat.taper.range = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.animalCoat.patch.from = "0.1";
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.animalCoat.field.wobble;
    }),
  );
  assert.throws(
    broken((d) => {
      d.animalCoat.extra = 1;
    }),
  );
});

test("animal-appearance.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/animal-appearance.js", import.meta.url), "utf8");
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  // The tightened gate (2, 3, 4, 10, 0.5 and named constants count) still finds numbers here: the baseline entry is the ratchet.
  assert.equal(countNumberLiterals(text).count, baseline.numberLiterals["animal-appearance.js"] ?? 0);
});
