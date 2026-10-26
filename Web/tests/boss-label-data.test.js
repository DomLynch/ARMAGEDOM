import test from "node:test";
import assert from "node:assert/strict";
import { BOSS_LABEL, validateBossLabel } from "../src/engine/boss-label-data.js";
import { positionBossLabel } from "../src/engine/boss-label.js";

// The numbers that were inline in engine/boss-label.js before they moved to visual.json `bossLabel`.
test("the boss label keeps its pre-data margin and gap", () => {
  assert.deepEqual(BOSS_LABEL, { marginPx: 8, gapPx: 8 });
  const label = { width: 100, height: 20 },
    viewport = { width: 375, height: 812 };
  assert.deepEqual(positionBossLabel({ left: 150, right: 250, top: 200, bottom: 300 }, label, viewport), { left: 150, top: 172 });
});

test("a bad bossLabel row is refused", () => {
  for (const edit of [(l) => (l.marginPx = -1), (l) => (l.gapPx = Number.NaN), (l) => (l.gapPx = 101), (l) => (l.extra = 1)]) {
    const copy = structuredClone(BOSS_LABEL);
    edit(copy);
    assert.throws(() => validateBossLabel(copy));
  }
});
