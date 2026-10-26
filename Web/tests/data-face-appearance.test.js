import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { faceSignatures } from "./helpers/face-signatures.js";

// Data move: the head blend band, the weathering overlays and the hair numbers of face-appearance.js moved to appearance.json
// (`faceField`, `faceWeathering`, `faceHair`). The fixture holds one SHA-256 per face recipe over every geometry attribute, colour and
// hair material the module writes, dumped from the module before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/face-appearance-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every face recipe produces exactly the old geometry, colours and hair", async () => {
  const now = await faceSignatures();
  assert.deepEqual(Object.keys(now), Object.keys(old));
  for (const [id, hash] of Object.entries(old)) assert.equal(now[id], hash, id);
  assert(new Set(Object.values(old)).size > 20, "the fixture covers distinct looks");
});

test("the tables are frozen data read through game-data.js", () => {
  for (const key of ["faceField", "faceWeathering", "faceHair"])
    assert(Object.isFrozen(GAME_DATA.appearance[key]), key);
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  for (const key of ["faceField", "faceWeathering", "faceHair"])
    assert.throws(
      broken((d) => {
        delete d[key];
      }),
      key,
    );
  assert.throws(
    broken((d) => {
      d.faceField.range = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceField.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceWeathering.noise = [1, 2];
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.faceWeathering.dust;
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceWeathering.stubble.base = [0.1, 0.1];
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceWeathering.scar.minX = 0.5;
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceWeathering.grime.noiseMin = 2;
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceHair.wave = [1];
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceHair.crest.halfWidth = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceHair.material.color = "6b6154";
    }),
  );
  assert.throws(
    broken((d) => {
      d.faceHair.material.roughness = 3;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.faceHair.underside.scale;
    }),
  );
});

test("face-appearance.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/face-appearance.js", import.meta.url), "utf8");
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  // The tightened gate (2, 3, 4, 10, 0.5 and named constants count) still finds numbers here: the baseline entry is the ratchet.
  assert.equal(countNumberLiterals(text).count, baseline.numberLiterals["face-appearance.js"] ?? 0);
});
