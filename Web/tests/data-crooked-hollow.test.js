import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { crookedSignatures } from "./helpers/crooked-signatures.js";

// Data move: the fold, the gait curve and the pose offsets of crooked-hollow.js moved to appearance.json `crookedHollow`. The fixture holds the
// gait curve at 49 phases and one SHA-256 of every bone transform after each gait pose and after each of 90 moving update() steps (the walk
// cycle accumulator included), dumped from the module before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/crooked-hollow-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("the gait curve, every gait pose and the update path equal the old module's exactly", async () => {
  const now = await crookedSignatures();
  assert.deepEqual(now.gait, old.gait);
  assert.deepEqual(now.samples, old.samples);
  assert.deepEqual(now.updates, old.updates);
  assert.equal(now.finalCycle, old.finalCycle);
  assert(new Set(old.updates).size > 80, "the update steps are distinct poses");
});

test("the numbers are frozen data read through game-data.js", () => {
  assert(Object.isFrozen(GAME_DATA.appearance.crookedHollow));
  assert(Object.isFrozen(GAME_DATA.appearance.crookedHollow.lean));
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  const crooked = (d) => d.crookedHollow;
  assert.doesNotThrow(broken(() => {}));
  for (const key of [
    "lean",
    "gait",
    "reach",
    "pelvisDrop",
    "handDrop",
    "handForward",
    "elbowOut",
    "footHold",
    "cycleRate",
  ])
    assert.throws(
      broken((d) => {
        delete crooked(d)[key];
      }),
      key,
    );
  assert.throws(
    broken((d) => {
      crooked(d).lean = [];
    }),
  );
  assert.throws(
    broken((d) => {
      crooked(d).lean[0][0] = "tail_01";
    }),
    "lean names a bone outside bones",
  );
  assert.throws(
    broken((d) => {
      crooked(d).lean[0] = ["spine_01", 1, 2];
    }),
  );
  assert.throws(
    broken((d) => {
      crooked(d).lean[0][1] = 9;
    }),
  );
  assert.throws(
    broken((d) => {
      crooked(d).gait[0] = [0.1, 0];
    }),
    "gait must start at 0,0",
  );
  assert.throws(
    broken((d) => {
      crooked(d).gait[2][0] = 0.2;
    }),
    "gait phases must rise",
  );
  assert.throws(
    broken((d) => {
      crooked(d).gait[3][1] = 0.3;
    }),
    "gait values must not fall",
  );
  assert.throws(
    broken((d) => {
      crooked(d).reach.max = 1.2;
    }),
  );
  assert.throws(
    broken((d) => {
      crooked(d).footHold.m = 0.5;
    }),
  );
  assert.throws(
    broken((d) => {
      crooked(d).cycleRate = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      crooked(d).elbowOut = "0.35";
    }),
  );
});

test("crooked-hollow.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/crooked-hollow.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.numberLiterals["crooked-hollow.js"], undefined);
});
