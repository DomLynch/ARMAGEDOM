import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { sweepBValues } from "./helpers/sweep-b-values.js";

// Sweep batch B: feral-body-shapes.js, face-allocator.js, roach-territory.js, creature-moves.js and pickup-glow.js lose their last tuning
// numbers. The torso taper band and the pickup contour (stroke, colour, render-order lift) are appearance.json `feralTorsoMask` and
// `pickupGlow`; the FNV-1a hash parameters carry their reason; the roach home radius, the move prefix and the hull key precision are named
// constants. The fixture is every value the five modules computed before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/sweep-b-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));
const FILES = [
  "feral-body-shapes.js",
  "face-allocator.js",
  "roach-territory.js",
  "creature-moves.js",
  "pickup-glow.js",
];

test("every value the five modules compute equals the old one exactly", () => {
  const now = sweepBValues();
  for (const part of Object.keys(old)) {
    assert.deepEqual(now[part], old[part], part);
    if (!Array.isArray(old[part]) && old[part] && typeof old[part] === "object")
      assert.deepEqual(Object.keys(now[part]), Object.keys(old[part]), `${part} key order`);
  }
  assert.equal(Object.keys(old.faces).length, 24);
  assert.equal(Object.keys(old.territory).length, 56);
  assert.equal(old.feral["dog-unknown"], "throws Error");
});

test("the numbers are frozen data read through game-data.js", () => {
  assert.deepEqual(GAME_DATA.appearance.feralTorsoMask, { from: 0.9, range: 0.1 });
  assert.deepEqual(GAME_DATA.appearance.pickupGlow, { stroke: 1.05, color: "#ffca85", orderOffset: 0.01 });
  assert(Object.isFrozen(GAME_DATA.appearance.pickupGlow));
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.feralTorsoMask;
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralTorsoMask.range = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralTorsoMask.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.pickupGlow;
    }),
  );
  assert.throws(
    broken((d) => {
      d.pickupGlow.color = "ffca85";
    }),
  );
  assert.throws(
    broken((d) => {
      d.pickupGlow.stroke = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.pickupGlow.orderOffset = "0.01";
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.pickupGlow.orderOffset;
    }),
  );
});

test("the five modules keep no tuning number and the baseline no longer lists them", () => {
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of FILES) {
    assert.equal(
      countNumberLiterals(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).count,
      baseline.numberLiterals[file] ?? 0, // the tightened gate (2, 3, 4, 10, 0.5, named constants count): the entry is the ratchet
      file,
    );
  }
});
