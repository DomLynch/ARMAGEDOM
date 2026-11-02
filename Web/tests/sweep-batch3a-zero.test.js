import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Phase 2b batch 3a: these ten modules hold only structure (skin influences, scratch counts, quad geometry, a square, a half, a bipolar remap,
// the law of cosines' doubled side), so nothing moves to data: each is a named constant or helper with a reason. Their outputs stay identical
// (the crooked-hollow, drone laser, clothing, catalogue, finisher arm, feral and gaunt suites); this file keeps the counter at zero for all ten.
const FILES = [
  "crooked-hollow.js",
  "drone-laser.js",
  "clothing-allocator.js",
  "engine/creature-catalogue.js",
  "clothing-palettes.js",
  "donor-audio.js",
  "engine/finisher-arm.js",
  "feral-body-shapes.js",
  "gaunt-shape.js",
];
const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));

for (const file of FILES)
  test(`${file} keeps no tuning number and the baseline no longer lists it`, () => {
    const text = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.equal(countNumberLiterals(text).count, 0);
    assert.equal(baseline.numberLiterals[file], undefined);
  });

test("the helpers return the old arithmetic exactly", () => {
  const old = { distance: (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 };
  const squared = (x) => x ** 2;
  for (const [a, b] of [
    [
      [0, 0, 0],
      [1, 2, 3],
    ],
    [
      [0.3, -0.7, 2.2],
      [-1.1, 0.4, 0.9],
    ],
  ])
    assert.equal(squared(a[0] - b[0]) + squared(a[1] - b[1]) + squared(a[2] - b[2]), old.distance(a, b));
});
