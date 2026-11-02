import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateBossFlame } from "../src/engine/game-data-weapons.js";

test("flame boss retreat samples the same sixteen directions as before it moved to data", () => {
  assert.equal(GAME_DATA.weapons.bossFlame.retreatDirections, 16);
});

test("bossFlame data rejects unknown keys and bad direction counts", () => {
  validateBossFlame({ retreatDirections: 16 });
  for (const bad of [{}, { retreatDirections: 0 }, { retreatDirections: 2.5 }, { retreatDirections: 65 }, { retreatDirections: 16, extra: 1 }])
    assert.throws(() => validateBossFlame(bad));
});
