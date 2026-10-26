import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// face-appearance.js loses its last tuning numbers: the build slice, the yield step counts and the weld precision are appearance.json
// `faceBuild`. Every face recipe's geometry, colours and hair stay byte-identical (data-face-appearance.test.js hashes them against a
// fixture dumped before any move); this file pins the new block to the literals it replaced and the module to zero literals.
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.appearance.faceBuild, {
    sliceMs: 4,
    yieldEvery: 128, // was the mask 127
    yieldEveryTriangles: 256, // was the mask 255
    weldPrecision: 1e6,
  });
  assert(Object.isFrozen(GAME_DATA.appearance.faceBuild));
  assert.equal(GAME_DATA.appearance.faceBuild.yieldEvery - 1, 127);
  assert.equal(GAME_DATA.appearance.faceBuild.yieldEveryTriangles - 1, 255);
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = rawAppearance();
    mutate(d.faceBuild);
    validateAppearance(d);
  };
  assert.throws(broken((b) => delete b.sliceMs));
  assert.throws(broken((b) => (b.extra = 1)));
  assert.throws(broken((b) => (b.yieldEvery = 100)));
  assert.throws(broken((b) => (b.yieldEveryTriangles = 0)));
  assert.throws(broken((b) => (b.sliceMs = 0)));
  assert.throws(broken((b) => (b.weldPrecision = 1)));
  assert.doesNotThrow(broken(() => {}));
});

test("face-appearance.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/face-appearance.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.equal(baseline.numberLiterals["face-appearance.js"], undefined);
});
