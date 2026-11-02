import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VEST_RULES} from '../src/vest.js';
import {GAME_DATA, buildGameData, validateWeapons} from '../src/engine/game-data.js';

// Data batch 2: VEST_RULES moved from code into Web/src/data/weapons.json `vest`.
// tests/fixtures/vest-pre-data.json is the old in-code table dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/vest-pre-data.json', import.meta.url)));

test('VEST_RULES equals the old in-code table exactly and is frozen', () => {
  assert.deepEqual(VEST_RULES, old);
  assert.deepEqual(Object.keys(VEST_RULES), Object.keys(old));
  assert(Object.isFrozen(VEST_RULES));
  assert.equal(GAME_DATA.weapons.vest.itemId, 'westminster-worn-vest-v1');
});

test('the loader validates the vest section: unknown, missing or bad fields are rejected', () => {
  const broken = mutate => {
    const d = structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/weapons.json', import.meta.url))));
    mutate(d);
    return () => validateWeapons(d);
  };
  assert.throws(broken(d => { d.vest.extra = 1; }));
  assert.throws(broken(d => { delete d.vest.itemId; }));
  assert.throws(broken(d => { d.vest.itemId = 'Bad Id'; }));
  assert.throws(broken(d => { d.vest.requiredKills = 1.5; }));
  assert.throws(broken(d => { d.vest.pickupRadius = 'wide'; }));
  assert.throws(broken(d => { d.vest.reduction = 1; }));
  assert.doesNotThrow(broken(() => {}));
  assert.throws(() => buildGameData({weapons: [{schema_version: 2}, validateWeapons]}));
});
