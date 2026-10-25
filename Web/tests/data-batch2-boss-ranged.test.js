import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BOSS_RANGED_RULES} from '../src/engine/boss-ranged.js';
import {GAME_DATA, buildGameData, validateWeapons} from '../src/engine/game-data.js';

// Data batch 2: BOSS_RANGED_RULES moved from code into Web/src/data/weapons.json `bossRanged`.
// tests/fixtures/boss-ranged-pre-data.json is the old in-code table dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/boss-ranged-pre-data.json', import.meta.url)));

test('BOSS_RANGED_RULES equals the old in-code table exactly and is frozen', () => {
  assert.deepEqual(BOSS_RANGED_RULES, old);
  assert.deepEqual(Object.keys(BOSS_RANGED_RULES), Object.keys(old));
  assert(Object.isFrozen(BOSS_RANGED_RULES));
  for (const row of Object.values(BOSS_RANGED_RULES)) assert(Object.isFrozen(row));
  assert.equal(GAME_DATA.weapons.bossRanged['boss-butcher'].maxLife, 1.2);
});

test('the loader validates the bossRanged section: unknown, missing or non-numeric fields are rejected', () => {
  const broken = mutate => {
    const d = structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/weapons.json', import.meta.url))));
    mutate(d);
    return () => validateWeapons(d);
  };
  assert.throws(broken(d => { d.bossRanged.extra = {}; }));
  assert.throws(broken(d => { delete d.bossRanged['boss-butcher']; }));
  assert.throws(broken(d => { d.bossRanged['boss-butcher'].range = 'far'; }));
  assert.throws(broken(d => { d.bossRanged['boss-butcher'].extra = 1; }));
  assert.throws(broken(d => { delete d.bossRanged['boss-south-nightborn'].damage; }));
  assert.throws(broken(d => { delete d.bossRanged['boss-butcher'].speed; }));
  assert.throws(broken(d => { d.bossRanged['boss-south-nightborn'].speed = 5; }));
  assert.doesNotThrow(broken(() => {}));
  assert.throws(() => buildGameData({weapons: [{schema_version: 2}, validateWeapons]}));
});
