import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Phase 2b batch 1: engine/local-wound.js and engine/sever-blood-effect.js hold only structure (ring and band counts, xyz packing, a full turn,
// a draw order, a quarter turn), named constants with reasons, so nothing moves to data. Their outputs stay identical (local-wound-differential
// and sever-blood-effect suites); this file keeps the counter at zero for both.
const FILES = ["engine/local-wound.js", "engine/sever-blood-effect.js"];
const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));

for (const file of FILES)
  test(`${file} keeps no tuning number and the baseline no longer lists it`, () => {
    const text = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.equal(countNumberLiterals(text).count, 0);
    assert.equal(baseline.numberLiterals[file], undefined);
  });
