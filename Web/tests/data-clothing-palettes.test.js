import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import {
  CLOTHING_PALETTE_VERSION,
  TOP_COLOURS,
  TROUSER_COLOURS,
  PAIRINGS,
  outfitFor,
} from "../src/clothing-palettes.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Data move: the tonal separation threshold of clothing-palettes.js moved to visual.json `clothing.minTonalGap`; the sRGB transfer function, the
// Rec. 709 luma weights and the byte shifts are published constants, now marked tuning-ok. The fixture is every colour, pairing and outfit the
// module produced before the move (50 tops, 50 trousers, 840 approved outfits), dumped from the old module.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/clothing-palettes-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url))));

test("every colour, pairing and outfit equals the old module's exactly", () => {
  assert.equal(CLOTHING_PALETTE_VERSION, old.version);
  assert.deepEqual(TOP_COLOURS, old.tops);
  assert.deepEqual(TROUSER_COLOURS, old.trousers);
  assert.deepEqual(PAIRINGS, old.pairings);
  assert.deepEqual(Object.keys(PAIRINGS), Object.keys(old.pairings));
  let outfits = 0;
  for (const [key, expected] of Object.entries(old.outfits)) {
    const [top, pants] = key.split("/");
    assert.deepEqual(outfitFor(top, pants), expected, key);
    outfits++;
  }
  assert.equal(outfits, 840);
  assert.equal(GAME_DATA.visual.clothing.minTonalGap, 0.035);
});

test("the loader rejects a broken threshold", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateVisual(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.clothing.minTonalGap;
    }),
  );
  assert.throws(
    broken((d) => {
      d.clothing.minTonalGap = -0.01;
    }),
  );
  assert.throws(
    broken((d) => {
      d.clothing.minTonalGap = 0.6;
    }),
  );
  assert.throws(
    broken((d) => {
      d.clothing.minTonalGap = "0.035";
    }),
  );
});

test("clothing-palettes.js counts no tuning number (the constants carry their reason) and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/clothing-palettes.js", import.meta.url), "utf8"),
    found = countNumberLiterals(text);
  assert.equal(found.count, 0);
  assert.equal(found.reasons.length, 11, "all 11 constants carry a reason");
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.numberLiterals["clothing-palettes.js"], undefined);
});
