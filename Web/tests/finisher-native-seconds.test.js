import test from "node:test";
import assert from "node:assert/strict";
import { FLAME_DEATH_DATA, flameDeathSeconds } from "../src/engine/finisher-data.js";

// The 2.4 s that was inline in engine/finisher-data.js before it moved to finisherData.json flameDeath.nativeSeconds.
test("the flame death default length keeps its pre-data number", () => {
  assert.equal(FLAME_DEATH_DATA.nativeSeconds, 2.4);
  const tail = FLAME_DEATH_DATA.collapseTailSeconds + FLAME_DEATH_DATA.holdSeconds + FLAME_DEATH_DATA.fadeSeconds;
  assert.equal(flameDeathSeconds(), Math.min(FLAME_DEATH_DATA.maxSeconds, 2.4 + tail));
  assert.equal(flameDeathSeconds(Number.NaN), flameDeathSeconds(2.4));
  assert.equal(flameDeathSeconds(1), Math.min(FLAME_DEATH_DATA.maxSeconds, 1 + tail));
});
