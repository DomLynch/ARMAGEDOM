import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validatePhysicsDeath } from "../src/engine/game-data-hunters.js";
import { physicsDeathEnabled } from "../src/engine/physics-death.js";

const clone = () => JSON.parse(JSON.stringify(GAME_DATA.physicsDeath));

test("boss ragdoll is on by default and ?physics=0 is the off switch", () => {
  assert.equal(GAME_DATA.physicsDeath.defaultOn, true);
  assert.equal(physicsDeathEnabled(""), true);
  assert.equal(physicsDeathEnabled("?qa=1"), true);
  assert.equal(physicsDeathEnabled("?physics=1"), true);
  assert.equal(physicsDeathEnabled("?physics=0"), false);
  assert.equal(physicsDeathEnabled("?qa=1&physics=0"), false);
});

test("the pool is 2 and the active bodies equal the simultaneous-ragdoll cap", () => {
  assert.equal(GAME_DATA.physicsDeath.poolSize, 2);
  assert.equal(GAME_DATA.physicsDeath.maxActive, GAME_DATA.physicsBudget.rows.max_simultaneous_ragdolls);
});

test("validator needs a boolean defaultOn and an offValue different from flagValue", () => {
  assert.doesNotThrow(() => validatePhysicsDeath(clone()));
  const a = clone();
  a.defaultOn = "yes";
  assert.throws(() => validatePhysicsDeath(a));
  const b = clone();
  b.offValue = b.flagValue;
  assert.throws(() => validatePhysicsDeath(b));
});
