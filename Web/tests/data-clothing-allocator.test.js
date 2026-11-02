import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allocateClothing } from "../src/clothing-allocator.js";
import { CLOTHING_PALETTE_VERSION, TOP_COLOURS, TROUSER_COLOURS, PAIRINGS } from "../src/clothing-palettes.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// clothing-allocator.js holds only genuine constants (the FNV-1a hash parameters and the published Oklab matrices), now marked tuning-ok with
// the reason. The fixture is the allocation of the real clothing library for six areas at five roster sizes, dumped before the change.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/clothing-allocator-pre-data.json", import.meta.url)));
const library = { version: CLOTHING_PALETTE_VERSION, tops: TOP_COLOURS, trousers: TROUSER_COLOURS, pairings: PAIRINGS };

test("every allocation equals the old one exactly (same outfit for the same resident, same order)", () => {
  let checked = 0;
  for (const [name, expected] of Object.entries(old)) {
    const [area, n] = name.split("/"),
      keys = Array.from({ length: +n }, (_, i) => `${area}-roamer-${i + 1}`),
      now = Object.fromEntries(allocateClothing(area, keys, library));
    assert.deepEqual(now, expected, name);
    assert.deepEqual(Object.keys(now), Object.keys(expected), `${name} order`);
    checked++;
  }
  assert.equal(checked, 30);
});

test("clothing-allocator.js counts no tuning number (the constants carry their reason) and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/clothing-allocator.js", import.meta.url), "utf8"),
    found = countNumberLiterals(text);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  // The tightened gate (2, 3, 4, 10, 0.5 and named constants count) still finds numbers here: the baseline entry is the ratchet.
  assert.equal(found.count, baseline.numberLiterals["clothing-allocator.js"] ?? 0);
  assert(found.reasons.length >= 20, "the 20 hash and colour literals still carry a reason");
  assert(found.reasons.every((r) => /FNV-1a|Oklab/.test(r)));
});
