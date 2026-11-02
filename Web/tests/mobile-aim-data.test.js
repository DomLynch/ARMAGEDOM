import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { MOBILE_AIM, followMobileAngle, mobileStickVector } from "../src/mobile-combat-aim.js";

// The numbers that were inline in mobile-combat-aim.js before they moved to weapons.json `mobileAim`.
test("the mobile aim keeps its pre-data numbers", () => {
  const m = GAME_DATA.weapons.mobileAim;
  assert.equal(m.maxStepSeconds, 0.1);
  assert.equal(m.movingThreshold, 0.01);
  assert.equal(m.minTargetDistance, 0.01);
  assert.equal(MOBILE_AIM.deadzone, 0.13);
  assert.equal(MOBILE_AIM.steeringRate, 10);
  assert.equal(MOBILE_AIM.headingRate, 24);
});

// The stick curve as it was written with the literals 0.13 and 0.87, against the data-driven one, bit for bit.
test("the stick curve is identical to the pre-data formula", () => {
  const old = (x, y, radius) => {
    const length = Math.hypot(x, y);
    if (length <= radius * 0.13) return { x: 0, y: 0 };
    const strength = Math.min(1, (length / radius - 0.13) / 0.87);
    return { x: (x / length) * strength, y: (y / length) * strength };
  };
  for (const radius of [36, 46, 60])
    for (let i = -20; i <= 20; i++)
      for (let j = -20; j <= 20; j++) assert.deepEqual(mobileStickVector(i * 3.7, j * 3.1, radius), old(i * 3.7, j * 3.1, radius));
});

test("the default follow rate is the heading rate", () => {
  assert.equal(followMobileAngle(0, 1, 0.016), followMobileAngle(0, 1, 0.016, 24));
});
