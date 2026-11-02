import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createCombatImpact, createHitReaction } from "../src/combat-impact.js";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";

test("combat-impact.js numbers live in visual.json and equal the old inline ones (15 to 0)", () => {
  assert.deepEqual(GAME_DATA.visual.combatImpact, {
    settleBelow: 0.001,
    lowEnergy: 0.4,
    waveRate: 45,
    holdSeconds: { death: 0.08, pistol: 0.05, other: 0.04 },
    kick: { death: 8, hit: 4, shot: 3, max: 8 },
    decayRate: { shotPistol: 12, shotOther: 18, camera: 18, reaction: 12, reactionKilled: 10 },
    reactionHoldSeconds: { hit: 0.045, killed: 0.08 },
  });
});

// The camera kick, clamp, decay and shake phase, recomputed with the old inline literals.
test("camera kick, clamp, decay and shake phase match the old formulas step by step", () => {
  const fx = createCombatImpact();
  let x = 0, y = 0, age = 0;
  const dir = (a, b) => {
    const max = Math.max(Math.abs(a), Math.abs(b)),
      p = a / max,
      q = b / max,
      len = Math.hypot(p, q);
    return [p / len, q / len];
  };
  for (const [type, ex, ey] of [["hit", 1, 0.5], ["death", -1, 2], ["death", 1, 1], ["shot", 0, -1]]) {
    fx.event({ type, x: ex, y: ey, pistol: true });
    const [dx, dy] = dir(ex, ey),
      kick = type === "death" ? 8 : type === "hit" ? 4 : 3;
    x -= dx * kick;
    y -= dy * kick;
    const length = Math.hypot(x, y);
    if (length > 8) {
      x *= 8 / length;
      y *= 8 / length;
    }
    age = 0;
    for (const dt of [0.01, 0.016, 0.03]) {
      const state = fx.update(dt),
        decay = (v) => (Math.abs(v * Math.exp(-dt * 18)) < 0.001 ? 0 : v * Math.exp(-dt * 18));
      x = decay(x);
      y = decay(y);
      age = x || y ? (age + dt) % ((2 * Math.PI) / 45) : 0;
      const wave = Math.cos(age * 45);
      assert.ok(Math.abs(state.cameraX - x * wave) < 1e-12 && Math.abs(state.cameraY - y * wave) < 1e-12, `${type} dt ${dt}`);
    }
  }
});

test("low mode keeps 0.4 energy and the hit reaction holds and decays as before", () => {
  const low = createCombatImpact({ mode: "low" });
  low.event({ type: "shot" });
  assert.equal(low.update(0).shot, 0.4);
  for (const [killed, hold, rate] of [[false, 0.045, 12], [true, 0.08, 10]]) {
    const r = createHitReaction();
    r.hit({ x: 1, z: 0, killed });
    assert.equal(r.update(0).hold, hold);
    const state = r.update(0.2);
    assert.ok(Math.abs(state.energy - Math.exp(-(0.2 - hold) * rate)) < 1e-12, `killed ${killed}`);
  }
});

test("the combatImpact validator rejects bad rows", () => {
  const raw = () => JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url)));
  assert.doesNotThrow(() => validateVisual(raw()));
  for (const mutate of [
    (c) => (c.extra = 1),
    (c) => (c.lowEnergy = 0),
    (c) => (c.kick.max = 2),
    (c) => (c.waveRate = 0),
    (c) => delete c.decayRate,
    (c) => (c.holdSeconds.death = -1),
  ]) {
    const d = raw();
    mutate(d.combatImpact);
    assert.throws(() => validateVisual(d));
  }
});
