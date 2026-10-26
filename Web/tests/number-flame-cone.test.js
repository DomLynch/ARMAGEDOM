import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateBossEquipment } from "../src/engine/game-data.js";
import { FLAME_PILOT_PROFILE } from "../src/engine/flame-fuel-state.js";
import { flameTouches } from "../src/engine/flame-contact.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/flame-fuel-state.js 1 to 0 (value-identical): the legacy pilot profile's 40 degree contact cone moved to weapons.json
// bossEquipment.emberContactConeDegrees. The cone is the hit path, so the contact test is compared across a grid of targets against the
// old literal profile (40). The 4096 ULP headroom is the one literal left in the file (marked in the flame visual PR).
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("the data holds 40 and the pilot profile reads it", () => {
  assert.equal(GAME_DATA.weapons.bossEquipment.emberContactConeDegrees, 40);
  assert.equal(FLAME_PILOT_PROFILE.contact.coneDegrees, 40);
});

test("flameTouches gives the same answer with the data cone as with the old literal across a grid of targets", () => {
  const source = { position: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
    oldProfile = { ...FLAME_PILOT_PROFILE.contact, coneDegrees: 40 };
  let touched = 0, missed = 0;
  for (let x = -3; x <= 3; x += 0.25)
    for (let z = -0.5; z <= 4; z += 0.25) {
      const target = { hp: 10, pos: { x, z }, radius: 0.4, height: 1.8 },
        args = { source, target, time: 0, lineClear: () => true, playerPosition: { x: 0, z: 0 } },
        now = flameTouches({ ...args, profile: FLAME_PILOT_PROFILE.contact });
      assert.equal(now, flameTouches({ ...args, profile: oldProfile }), `${x},${z}`);
      now ? touched++ : missed++;
    }
  assert(touched > 10 && missed > 10, "the grid crosses the cone edge");
});

test("the loader refuses a missing or out-of-range cone", () => {
  const broken = (mutate) => () => {
    const b = structuredClone(GAME_DATA.weapons.bossEquipment);
    mutate(b);
    validateBossEquipment(b, GAME_DATA.weapons.ranged);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((b) => { delete b.emberContactConeDegrees; }));
  assert.throws(broken((b) => { b.emberContactConeDegrees = 0; }));
  assert.throws(broken((b) => { b.emberContactConeDegrees = 180; }));
});

test("the gate counts 1 in flame-fuel-state.js (the 4096 ULP headroom) and the baseline agrees", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json"));
  assert.equal(countNumberLiterals(text("../src/engine/flame-fuel-state.js")).count, 1);
  assert.equal(baseline.numberLiterals["engine/flame-fuel-state.js"], 1);
});
