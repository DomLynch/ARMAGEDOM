import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SAVE_ERAS } from "../src/engine/save-eras.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/save-eras.js 13 to 0: every counted number was a save era version (a wire/format identifier, not tuning), so each line now carries
// `// tuning-ok: save era version`. Nothing moved: the registry below is the old content from origin/main (a83d1f01).
const OLD = [
  [1, "run"], [4, "progression"], [5, "expedition"], [6, "area-boss"], [7, "unique-reward"], [8, "flame"], [9, "rifle"],
  [10, "boss-equipment"], [11, "boss-equipment"], [12, "locker"], [13, "opening-story"], [14, "opening-story"], [15, "reaper"],
  [16, "railgun"], [17, "hub"], [18, "marked"],
];

test("the era registry is unchanged: same versions and layers in the same order, frozen rows", () => {
  assert.deepEqual(SAVE_ERAS.map((e) => [e.version, e.layer]), OLD);
  assert(Object.isFrozen(SAVE_ERAS));
  for (const e of SAVE_ERAS) assert(Object.isFrozen(e) && typeof e.key === "string" && e.key.length > 0);
  assert.equal(new Set(SAVE_ERAS.map((e) => e.key)).size, SAVE_ERAS.length, "each era keeps its own storage key");
});

test("the gate counts 0 here, every exemption is a marked save version, and the baseline entry is gone", () => {
  const r = countNumberLiterals(fs.readFileSync(new URL("../src/engine/save-eras.js", import.meta.url), "utf8"));
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(r.count, 0);
  assert(!("engine/save-eras.js" in baseline.numberLiterals));
  assert(r.reasons.filter((line) => /save era version$/.test(line)).length === 15, "all 15 save era versions are marked");
});
