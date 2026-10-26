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
  ]) {
    const d = raw();
    edit(d);
    assert.throws(() => validateCombatRules(d), why);
  }
});
