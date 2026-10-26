import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { knifePaths } from "../src/donor/knife-paths.js";
import { bladePose } from "../src/donor/knife.js";
import { knifePaths as old } from "./fixtures/knife-paths-pre-data.mjs";
import { GAME_DATA, validateKnifePaths } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/as-data-gate.mjs";

// Knife path data N to 0 (World): the 1980 baked numbers of donor/knife-paths.js moved into data/knifePaths.json.
// tests/fixtures/knife-paths-pre-data.mjs is the old file, byte for byte, from origin/main (df4d1ec).
const rawText = fs.readFileSync(new URL("../src/data/knifePaths.json", import.meta.url), "utf8");

test("the data file is pinned", () => {
  assert.equal(
    crypto.createHash("sha256").update(rawText).digest("hex"),
    "KNIFE_PATHS_HASH",
  );
});

test("every number is bit for bit what the old export held, in the same order", () => {
  assert.deepEqual(knifePaths, old);
  assert.deepEqual(Object.keys(knifePaths), ["hero", "goblin"]);
  let numbers = 0;
  for (const rig of Object.keys(old))
    for (const [name, frames] of Object.entries(old[rig])) {
      assert.deepEqual(Object.keys(knifePaths[rig]), Object.keys(old[rig]));
      assert.equal(knifePaths[rig][name].length, frames.length);
      frames.forEach((frame, i) =>
        frame.forEach((value, k) => {
          numbers++;
          assert(Object.is(knifePaths[rig][name][i][k], value), `${rig}.${name}[${i}][${k}]`);
        }),
      );
    }
  assert.equal(numbers, 1980);
});

test("the paths are the frozen data rows and bladePose reads them as before", () => {
  assert.equal(knifePaths, GAME_DATA.knifePaths.paths);
  assert(Object.isFrozen(knifePaths) && Object.isFrozen(knifePaths.hero.thrust) && Object.isFrozen(knifePaths.hero.thrust[0]));
  for (const rig of ["hero", "goblin"])
    for (const [name, frames] of Object.entries(old[rig]))
      for (const age of [0, 0.4, 1, 17.5, frames.length - 1, frames.length + 5, -2])
        // The fourth argument hands bladePose the old frames; without it, it reads the data rows.
        assert.deepEqual(bladePose(rig, name, age), bladePose(rig, name, age, old[rig]), `${rig} ${name} ${age}`);
});

test("the loader rejects broken knife path data", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(rawText);
    mutate(d);
    validateKnifePaths(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      d.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.paths.goblin;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.paths.hero.thrust;
    }),
  );
  assert.throws(
    broken((d) => {
      d.paths.hero.light_right.pop();
    }),
  );
  assert.throws(
    broken((d) => {
      d.paths.hero.light_left[3].push(0);
    }),
  );
  assert.throws(
    broken((d) => {
      d.paths.goblin.heavy_overhead[0][2] = null;
    }),
  );
  assert.throws(
    broken((d) => {
      d.paths.goblin.heavy_overhead[5][0] = "0.1";
    }),
  );
  assert.throws(
    broken((d) => {
      d.paths.hero.extra = [];
    }),
  );
});

test("knife-paths.js holds no number; the baseline has no entry for it", () => {
  const source = fs.readFileSync(new URL("../src/donor/knife-paths.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(source, "Web/src/donor/knife-paths.js").count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert(!("donor/knife-paths.js" in baseline.numberLiterals));
});
