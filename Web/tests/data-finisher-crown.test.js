import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// finisher-crown.js loses its last tuning numbers: the build slice and the cap loop weld precision join the vertex budget, cut colour and open
// distances in appearance.json `crownSplit`. The crown buffers, cut material, open pose and budget limits stay identical (data-sweep-c.test.js
// compares them with a fixture dumped from the module before the first move); this file pins the two new fields and the zero count.
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.appearance.crownSplit, {
    maxVertices: 100000,
    cutColor: "#49251f",
    openRadians: 0.19,
    openMetres: 0.008,
    sliceMs: 4,
    weldPrecision: 1e5,
  });
  assert(Object.isFrozen(GAME_DATA.appearance.crownSplit));
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = rawAppearance();
    mutate(d.crownSplit);
    validateAppearance(d);
  };
  assert.throws(broken((c) => delete c.sliceMs));
  assert.throws(broken((c) => delete c.weldPrecision));
  assert.throws(broken((c) => (c.sliceMs = 0)));
  assert.throws(broken((c) => (c.weldPrecision = 1)));
  assert.throws(broken((c) => (c.extra = 1)));
  assert.doesNotThrow(broken(() => {}));
});

test("finisher-crown.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/finisher-crown.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.equal(baseline.numberLiterals["finisher-crown.js"], undefined);
});
