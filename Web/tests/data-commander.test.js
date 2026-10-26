import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { COMMANDER_RULES, commanderRules } from "../src/engine/commander/match.js";
import { GAME_DATA, validateCommander } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch 10 (World): COMMANDER_RULES moved to data/commander.json. The five drone-derived values stay computed from creatures.json
// `drone`. The literal below is what the constant held on origin/main (c7661f6).
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("the data file is pinned", () => {
  assert.equal(
    crypto.createHash("sha256").update(read("../src/data/commander.json")).digest("hex"),
    "36c647b6beeb1cf21fac99569ece215cef9da5aa7754fd986efbcffce41fbd18",
  );
});

test("the rules equal the constant they replaced", () => {
  assert.deepEqual(COMMANDER_RULES, {
    unitCap: 3,
    reserve: 30,
    deployCost: 10,
    machineHP: 60,
    machineSpeed: 2.3,
    machineRadius: 1.1,
    range: 6,
    damage: 6,
    windup: 0.6,
    recovery: 1.4,
    boltSpeed: 8,
    biologicalHP: 40,
    biologicalSpeed: 1.5,
    biologicalDamage: 6,
    meleeRange: 1.6,
    meleeWindup: 0.4,
    meleeRecovery: 0.9,
    captureRadius: 2.8,
    captureSeconds: 12,
    defendSeconds: 30,
    beaconHP: 100,
    matchSeconds: 180,
  });
  assert(Object.isFrozen(COMMANDER_RULES) && Object.isFrozen(GAME_DATA.commander.rules));
});

test("the derived values follow the drone rules", () => {
  const r = commanderRules(GAME_DATA.commander.rules, {
    radius: 2,
    damage: 3,
    warningSeconds: 4,
    recoverySeconds: 5,
    boltSpeed: 6,
  });
  assert.deepEqual([r.machineRadius, r.damage, r.windup, r.recovery, r.boltSpeed], [2, 3, 4, 5, 6]);
  assert.equal(r.unitCap, 3);
});

test("the loader rejects a broken commander file", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(read("../src/data/commander.json"));
    mutate(d);
    validateCommander(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      d.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.rules;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rules.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.rules.matchSeconds;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rules.unitCap = 2.5;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rules.unitCap = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rules.captureRadius = -1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rules.machineSpeed = "fast";
    }),
  );
});

test("match.js holds no constant table; the baseline has no entry for it", () => {
  assert.equal(countConstantTables(read("../src/engine/commander/match.js")), 0);
  const baseline = JSON.parse(read("../../scripts/as-data-baseline.json"));
  assert(!("engine/commander/match.js" in baseline.constantTables));
});
