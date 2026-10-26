import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { roachSignatures } from "./helpers/roach-signatures.js";
import { assertClose } from "./helpers/assert-close.js";

// Data move: the shell taper band and the wear noise of roach-appearance.js moved to appearance.json `roachCoat`. The fixture holds, per roach
// recipe, the geometry arrays (position, normal, colour) and the material it writes onto a 240-vertex synthetic roach mesh whose shell weight
// sweeps 0 to 1, dumped from the module (identical to the pre-move hashes, which passed on the same input).
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/roach-appearance-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every roach recipe produces exactly the old geometry, colours and material", () => {
  const now = roachSignatures();
  assert.deepEqual(Object.keys(now), Object.keys(old));
  // The wear field uses sin and cos, which can differ in the last digit between machines: compare the float32 arrays to 1e-6.
  for (const [id, expected] of Object.entries(old))
    assertClose(now[id], expected, id, { relative: 1e-6, absolute: 1e-6 });
  assert.equal(
    new Set(Object.values(old).map((v) => JSON.stringify(v))).size,
    6,
    "the fixture covers six distinct looks",
  );
});

test("the numbers are frozen data read through game-data.js", () => {
  assert(Object.isFrozen(GAME_DATA.appearance.roachCoat));
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.roachCoat;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.roachCoat.field;
    }),
  );
  assert.throws(
    broken((d) => {
      d.roachCoat.taper.range = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.roachCoat.wear.from = "0.25";
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.roachCoat.field.z2;
    }),
  );
  assert.throws(
    broken((d) => {
      d.roachCoat.extra = 1;
    }),
  );
});

test("roach-appearance.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/roach-appearance.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.numberLiterals["roach-appearance.js"], undefined);
});
