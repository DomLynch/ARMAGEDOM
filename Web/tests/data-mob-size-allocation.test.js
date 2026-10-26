import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures } from "../src/engine/game-data.js";
import { allocateMobSizes } from "../src/mob-size-allocation.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Data move: the approved size factors and their allowed range moved from mob-size-allocation.js to creatures.json `mobSize`; the two FNV-1a hash
// parameters stay as published constants marked tuning-ok. The fixture is the old module's allocation for 8 areas at 9 roster sizes, three custom
// pools and the 12 rejected pools, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/mob-size-allocation-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));

test("every allocation equals the old one exactly (factor per resident, in order)", () => {
  let checked = 0;
  for (const [name, expected] of Object.entries(old)) {
    if (name === "rejected") continue;
    if (name.startsWith("pool/")) {
      const pool = name.slice(5).split(",").map(Number);
      assert.deepEqual(
        [
          ...allocateMobSizes(
            "custom",
            Array.from({ length: 13 }, (_, i) => `k${i}`),
            pool,
          ),
        ],
        expected,
        name,
      );
    } else {
      const [area, n] = name.split("/"),
        keys = Array.from({ length: +n }, (_, i) => `${area}-roamer-${+n - i}`);
      assert.deepEqual([...allocateMobSizes(area, keys)], expected, name);
    }
    checked++;
  }
  assert.equal(checked, 75);
});

test("the same pools are still refused", () => {
  const pools = [null, [], {}, [0.85, 0.85], [0], [-1], [0.84], [1.16], [Infinity], [NaN], ["1"], Array(1)];
  const now = pools.map((pool) => {
    try {
      allocateMobSizes("east", [], pool);
      return "accepted";
    } catch {
      return "rejected";
    }
  });
  assert.deepEqual(now, old.rejected);
});

test("the pool is frozen data read through game-data.js", () => {
  assert.deepEqual(GAME_DATA.creatures.mobSize, { factors: [0.85, 0.9, 1, 1.1, 1.15], min: 0.85, max: 1.15 });
  assert(Object.isFrozen(GAME_DATA.creatures.mobSize.factors));
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.mobSize;
    }),
  );
  assert.throws(
    broken((d) => {
      d.mobSize.factors = [];
    }),
  );
  assert.throws(
    broken((d) => {
      d.mobSize.factors = [1, 1];
    }),
    "duplicate factor",
  );
  assert.throws(
    broken((d) => {
      d.mobSize.factors = [1.1, 0.9];
    }),
    "factors must rise",
  );
  assert.throws(
    broken((d) => {
      d.mobSize.factors[0] = 0.5;
    }),
    "factor below min",
  );
  assert.throws(
    broken((d) => {
      d.mobSize.max = 0.9;
    }),
    "range must bracket 1",
  );
  assert.throws(
    broken((d) => {
      d.mobSize.min = "0.85";
    }),
  );
  assert.throws(
    broken((d) => {
      d.mobSize.extra = 1;
    }),
  );
});

test("mob-size-allocation.js counts no tuning number (the hash constants carry their reason) and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/mob-size-allocation.js", import.meta.url), "utf8"),
    found = countNumberLiterals(text);
  assert.equal(found.count, 0);
  assert.equal(found.reasons.length, 2);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.numberLiterals["mob-size-allocation.js"], undefined);
});
