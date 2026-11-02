import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateUniqueReward } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch: FALLBACK_RADII (and the inline near radii) moved from engine/unique-reward-runtime.js into Web/src/data/uniqueReward.json
// (dropSearch). The pins below are the old in-code values from origin/main (2dec1b6): the boss-drop search must not change by a centimetre.
// tests/boss-drop-wall-side.test.js re-runs the real search against every boss corpse and keeps its own copy of the radii.
const OLD_NEAR = [0.25, 0.5, 0.75, 1];
const OLD_FALLBACK = [1.5, 2, 2.5, 3, 4, 5, 6];
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/uniqueReward.json", import.meta.url))));

test("the drop-search radii equal the old in-code values exactly and are frozen data", () => {
  assert.deepEqual(GAME_DATA.uniqueReward.dropSearch.nearRadii, OLD_NEAR);
  assert.deepEqual(GAME_DATA.uniqueReward.dropSearch.fallbackRadii, OLD_FALLBACK);
  assert(Object.isFrozen(GAME_DATA.uniqueReward.dropSearch.nearRadii));
  assert(Object.isFrozen(GAME_DATA.uniqueReward.dropSearch.fallbackRadii));
});

test("the loader refuses missing, extra, empty, unsorted, non-positive, huge or non-numeric radii", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateUniqueReward(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.dropSearch.nearRadii; }));
  assert.throws(broken((d) => { d.dropSearch.extra = [1]; }));
  assert.throws(broken((d) => { d.dropSearch.nearRadii = []; }));
  assert.throws(broken((d) => { d.dropSearch.nearRadii = [1, 0.5]; }));
  assert.throws(broken((d) => { d.dropSearch.nearRadii = [1, 1]; }));
  assert.throws(broken((d) => { d.dropSearch.fallbackRadii = [0, 2]; }));
  assert.throws(broken((d) => { d.dropSearch.fallbackRadii = [-1]; }));
  assert.throws(broken((d) => { d.dropSearch.fallbackRadii = [21]; }));
  assert.throws(broken((d) => { d.dropSearch.fallbackRadii = ["2"]; }));
  assert.throws(broken((d) => { d.dropSearch.fallbackRadii = Array.from({ length: 17 }, (_, i) => i + 1); }));
});

test("engine/unique-reward-runtime.js holds no constant table any more; the baseline says so", () => {
  assert.equal(countConstantTables(fs.readFileSync(new URL("../src/engine/unique-reward-runtime.js", import.meta.url), "utf8")), 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert(!("engine/unique-reward-runtime.js" in baseline.constantTables));
});
