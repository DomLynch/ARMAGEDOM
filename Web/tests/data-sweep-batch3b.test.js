import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures } from "../src/engine/game-data.js";
import { droneHoverHeight, DRONE_RULES } from "../src/drone-mechanics.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Phase 2b batch 3b: bridge-steering.js, drone-mechanics.js, auto-equip.js, travel.js, parked-area-preparation.js, roach-territory.js, marked.js,
// rifle-state.js and game-data.js lose their last tuning numbers. The steering goal shift and creep window join creatures.json `bridgeSteering`;
// the drone hover bob is `droneHover`, the roach home radius is `roachTerritory`; parked areas share travel's areaRuntime first-wave delay. The
// marked, rifle-state and game-data numbers are validation bounds, kept in code with a reason. The steering runs stay identical (data-sweep-c.test.js
// compares 72 walks with a fixture dumped from the module before the first move).
const FILES = [
  "bridge-steering.js",
  "drone-mechanics.js",
  "auto-equip.js",
  "travel.js",
  "parked-area-preparation.js",
  "roach-territory.js",
  "engine/marked.js",
  "engine/rifle-state.js",
  "engine/game-data.js",
];
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));

test("every value equals the literal it replaced", () => {
  const c = GAME_DATA.creatures;
  assert.equal(c.bridgeSteering.goalShiftMetres, 0.5);
  assert.equal(c.bridgeSteering.creepSeconds, 0.5);
  assert.deepEqual(c.droneHover, { rate: 3, swing: 0.025 });
  assert.equal(GAME_DATA.areaRuntime.travel.firstWaveDelay, 2);
  assert.deepEqual(c.roachTerritory, { homeArrivedMetres: 0.2 });
  for (const key of ["droneHover", "roachTerritory"]) assert(Object.isFrozen(c[key]), key);
});

test("the hover height is the old expression at every time", () => {
  for (const t of [0, 0.1, 1, 2.5, 17.3, 1000])
    assert.equal(droneHoverHeight(t), DRONE_RULES.hoverHeight + Math.sin(t * 3) * 0.025, `${t}`);
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.throws(broken((d) => delete d.bridgeSteering.creepSeconds));
  assert.throws(broken((d) => (d.bridgeSteering.goalShiftMetres = 0)));
  assert.throws(broken((d) => delete d.droneHover));
  assert.throws(broken((d) => (d.droneHover.rate = -1)));
  assert.throws(broken((d) => (d.roachTerritory.homeArrivedMetres = 0)));
  assert.doesNotThrow(broken(() => {}));
});

const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
for (const file of FILES)
  test(`${file} keeps no tuning number and the baseline no longer lists it`, () => {
    const text = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.equal(countNumberLiterals(text).count, 0);
    assert.equal(baseline.numberLiterals[file], undefined);
  });
