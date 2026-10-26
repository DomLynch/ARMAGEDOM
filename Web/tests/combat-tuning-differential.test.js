import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { traceLegacy, tracePilot } from "./helpers/combat-trace.js";
import { GAME_DATA, validateCombatRules } from "../src/engine/game-data.js";

// Dom's rule: no tuning values in code. The numbers combat.js carried inline are moving into data/combatRules.json, slice by slice.
// tests/fixtures/combat-trace-pre-data.json is a deterministic trace of the simulation recorded from the code BEFORE any of them
// moved (legacy waves, every enemy kind, parry/guard/dodge/loot/bolts, and a pilot-mode fight on the real east-bridge area). Every
// slice must reproduce it exactly, down to the last bit of every position and timer.
const same = (value) => JSON.parse(JSON.stringify(value));
const pre = JSON.parse(fs.readFileSync(new URL("./fixtures/combat-trace-pre-data.json", import.meta.url)));
const raw = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/combatRules.json", import.meta.url))));

test("the legacy goblin game plays out bit for bit as it did with its numbers in code", () => {
  const now = same(traceLegacy());
  for (const part of Object.keys(pre.legacy)) assert.deepEqual(now[part], pre.legacy[part], `legacy ${part}`);
});

test("a pilot-mode fight on the east-bridge area plays out bit for bit", () => {
  assert.deepEqual(same(tracePilot()), pre.pilot);
});

test("the recorded traces cover what the moved numbers drive", () => {
  const kinds = new Set(pre.legacy.long.flatMap((f) => f.enemies.map((e) => e.kind)));
  assert.deepEqual([...kinds].sort(), [0, 1, 2, 3]);
  assert(
    pre.legacy.long.some((f) => f.loot.length),
    "loot drops",
  );
  assert(
    pre.legacy.long.some((f) => f.bolts.length),
    "bolts fly",
  );
  assert.deepEqual([...new Set(pre.legacy.long.map((f) => f.wave))], [0, 1, 2, 3]);
  assert(
    pre.pilot.some((f) => f.enemies.some((e) => e.swing)),
    "pilot enemies swing",
  );
});

test("the legacy rows equal the numbers combat.js used to write inline", () => {
  const rows = GAME_DATA.combatRules.legacy.kinds;
  assert.deepEqual(
    rows.map((r) => [
      r.hp,
      r.radius,
      r.damage,
      r.swingRadius,
      r.swingArc,
      r.windupSeconds,
      r.recoverSeconds,
      r.readySeconds,
      r.moveSpeed,
    ]),
    [
      [55, 0.4, 9, 1.8, 90, 0.4, 0.45, 1.2, 2.8],
      [95, 0.4, 23, 2.8, 110, 1.05, 0.95, 1.9, 1.65],
      [50, 0.4, 12, 1.8, 90, 0.65, 0.45, 1.9, 2.8],
      [400, 0.65, 25, 3.5, 90, 1.05, 0.95, 1.9, 2.1],
    ],
  );
  assert(Object.isFrozen(rows) && Object.isFrozen(rows[0]));
});

test("the other sections equal the numbers combat.js used to write inline", () => {
  const d = GAME_DATA.combatRules;
  assert.deepEqual(d.player, { radius: 0.4, damage: 20, spawn: { x: 0, z: -6 } });
  assert.deepEqual(d.startingPistol, { x: -0.85, z: -6.15 });
  assert.equal(d.bodyRadius, 0.4);
  assert.equal(d.safehouseBodyPadding, 0.03);
  assert.deepEqual(d.aim, { targetConeDegrees: 45, mobSizeReachFactor: 0.31 });
  assert.deepEqual(d.movement, {
    sidestepFraction: 0.25,
    patrolArrive: 0.15,
    patrolMove: 0.05,
    returnArrive: 0.2,
    homeLeash: 12,
  });
  assert.deepEqual(d.awareness, { ratContactDistance: 6, sightDistance: 6 });
  assert.deepEqual(d.spawning, { distances: [4, 6, 8], laterals: [0, 1.4, -1.4, 2.8, -2.8], clearance: 0.35 });
  assert.deepEqual(d.enemyAI, {
    goblinSpeedFactor: 1.2,
    attackSpacing: 0.1,
    knifeAimDot: 0.96,
    animalBiteAimDot: 0.99,
    animalBiteReach: 0.95,
    animalContactReach: 0.35,
    ratMoveSpeed: 2.1,
    ratLowFootHeight: 0.06,
  });
  assert.equal(d.hitFlashSeconds, 0.12);
  assert.deepEqual(d.reactions, {
    blockImpactTicks: 12,
    defaultStaggerSeconds: 0.3,
    swingAssistTicks: 8,
    droneDeath: { clip: "drone_death", ticks: 48 },
    breathStartTicks: 56,
  });
  assert.deepEqual(d.legacy.player, {
    bufferSeconds: 0.12,
    guardRecoverSeconds: 0.45,
    dodge: { seconds: 0.22, invulnerableSeconds: 0.25, cooldownSeconds: 1.05, speed: 16 },
    walkSpeed: 4.2,
    guardMoveScale: 0.4,
    accelerate: 48,
    decelerate: 34,
    turnRate: 720,
    guard: {
      arc: 140,
      parryWindowSeconds: 0.16,
      regenPerSecond: 35,
      blockedDamageFactor: 0.25,
      brokenSeconds: 0.9,
      parryStunSeconds: 0.9,
    },
  });
  assert.equal(d.legacy.waveClearHeal, 25);
  assert.equal(d.legacy.hitKnockback, 0.18);
  for (const section of [d.player, d.aim, d.movement, d.awareness, d.spawning, d.enemyAI, d.reactions])
    assert(Object.isFrozen(section));
});

test("the validator rejects malformed combat rules", () => {
  validateCombatRules(raw());
  for (const [edit, why] of [
    [(d) => d.legacy.kinds.pop(), /four enemy kinds/],
    [(d) => (d.legacy.kinds[0].hp = 0), /hp/],
    [(d) => delete d.legacy.kinds[1].moveSpeed, Error],
    [(d) => (d.legacy.aimDot = 1), /below 1/],
    [(d) => (d.legacy.formation.columns = 0), /columns/],
    [(d) => (d.legacy.loot.tonic.step = -1), /finite number/],
    [(d) => (d.legacy.extra = 1), Error],
    [(d) => (d.hitFlashSeconds = 0), /hitFlashSeconds/],
    [(d) => (d.reactions.blockImpactTicks = 0), /blockImpactTicks/],
    [(d) => (d.reactions.droneDeath.clip = ""), /droneDeath/],
    [(d) => delete d.legacy.player.dodge.speed, Error],
    [(d) => (d.legacy.player.guard.arc = -1), /finite number/],
    [(d) => delete d.legacy.waveClearHeal, Error],
    [(d) => (d.aim.targetConeDegrees = 90), /below 90/],
    [(d) => (d.enemyAI.knifeAimDot = 1), /below 1/],
    [(d) => (d.spawning.laterals = []), /laterals/],
    [(d) => delete d.player.spawn.z, Error],
    [(d) => (d.startingPistol.x = NaN), /finite/],
    [(d) => (d.bodyRadius = 0), /bodyRadius/],
  ]) {
    const d = raw();
    edit(d);
    assert.throws(() => validateCombatRules(d), why);
  }
});
