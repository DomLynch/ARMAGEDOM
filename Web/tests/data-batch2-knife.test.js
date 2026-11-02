import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {KNIFE_RULES, KNIFE_MOVES, KNIFE_STAMINA_COSTS, KNIFE_COOLDOWNS} from '../src/donor/knife.js';
import {GAME_DATA, buildGameData, validateWeapons} from '../src/engine/game-data.js';

// Data batch 2, PR 2: the donor knife tables moved from code into Web/src/data/weapons.json `knife`. The move() arguments now have names.
// tests/fixtures/knife-pre-data.json is the old in-code KNIFE_* dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/knife-pre-data.json', import.meta.url)));

test('KNIFE_RULES, KNIFE_MOVES, KNIFE_STAMINA_COSTS and KNIFE_COOLDOWNS equal the old in-code tables exactly', () => {
  assert.deepEqual(KNIFE_RULES, old.rules);
  assert.deepEqual(KNIFE_MOVES, old.moves);
  assert.deepEqual(KNIFE_STAMINA_COSTS, old.staminaCosts);
  assert.deepEqual(KNIFE_COOLDOWNS, old.cooldowns);
  assert.deepEqual(Object.keys(KNIFE_MOVES), Object.keys(old.moves));
  for (const row of Object.values(KNIFE_MOVES)) assert(Object.isFrozen(row));
  assert(Object.isFrozen(KNIFE_RULES) && Object.isFrozen(KNIFE_STAMINA_COSTS) && Object.isFrozen(KNIFE_COOLDOWNS));
});

test('the derived fields keep their old exact values (seconds are ticks / 60, dodge cooldown is 36 / 60)', () => {
  const heavy = KNIFE_MOVES.heavy_overhead;
  assert.equal(heavy.windup, 22 / 60);
  assert.equal(heavy.stagger, 20 / 60);
  assert.equal(heavy.range, 1.55);
  assert.equal(KNIFE_COOLDOWNS.dodge, 36 / 60);
  assert.equal(KNIFE_MOVES.skill_pommel.cooldown, 15);
  assert.equal(KNIFE_MOVES.skill_pommel.path, null);
  assert.equal(KNIFE_MOVES.light_right.cooldown, 0);
});

test('the loader validates the knife section: unknown, missing or non-numeric fields are rejected', () => {
  assert.equal(GAME_DATA.weapons.knife.moves.thrust.reach, 1.45);
  const broken = mutate => {
    const d = structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/weapons.json', import.meta.url))));
    mutate(d);
    return () => validateWeapons(d);
  };
  assert.throws(broken(d => { d.knife.extra = 1; }));
  assert.throws(broken(d => { delete d.knife.moves.thrust; }));
  assert.throws(broken(d => { d.knife.moves.thrust.reach = 'far'; }));
  assert.throws(broken(d => { d.knife.moves.thrust.extra = 1; }));
  assert.throws(broken(d => { delete d.knife.staminaCosts.dodge; }));
  assert.throws(broken(d => { d.knife.rules.walkSpeed = NaN; }));
  assert.doesNotThrow(broken(() => {}));
  assert.throws(() => buildGameData({weapons: [{schema_version: 2}, validateWeapons]}));
});
