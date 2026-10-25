import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MELEE_VARIANTS, CLEAVER_MOVES} from '../src/engine/melee-equipment-data.js';
import {GAME_DATA, buildGameData, validateWeapons} from '../src/engine/game-data.js';

// Data batch 2, PR 3: the bone saw and cleaver numbers moved from code into Web/src/data/weapons.json `melee`.
// tests/fixtures/melee-pre-data.json is the old in-code MELEE_VARIANTS (contact paths as a SHA-256) and CLEAVER_MOVES, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/melee-pre-data.json', import.meta.url)));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('MELEE_VARIANTS and CLEAVER_MOVES equal the old in-code tables exactly', () => {
  const {__CLEAVER_MOVES: oldCleaverMoves, ...oldVariants} = old;
  assert.deepEqual(Object.keys(MELEE_VARIANTS).sort(), Object.keys(oldVariants).sort());
  for (const [id, variant] of Object.entries(MELEE_VARIANTS)) {
    const {contactPaths, ...rest} = variant;
    const {contactPathsSha256, ...oldRest} = oldVariants[id];
    assert.deepEqual(rest, oldRest, id);
    assert.equal(contactPaths ? digest(contactPaths) : null, contactPathsSha256, id + ' contactPaths');
  }
  assert.deepEqual(CLEAVER_MOVES, oldCleaverMoves);
  assert(Object.isFrozen(MELEE_VARIANTS) && Object.isFrozen(CLEAVER_MOVES));
});

test('the loader validates the melee section: unknown, missing or non-numeric fields are rejected', () => {
  assert.equal(GAME_DATA.weapons.melee.cleaver.moves.heavy_overhead.damage, 20);
  const broken = mutate => {
    const d = structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/weapons.json', import.meta.url))));
    mutate(d);
    return () => validateWeapons(d);
  };
  assert.throws(broken(d => { d.melee.extra = 1; }));
  assert.throws(broken(d => { delete d.melee.cleaver; }));
  assert.throws(broken(d => { d.melee.cleaver.moves.thrust.damage = 'hard'; }));
  assert.throws(broken(d => { d.melee.cleaver.moves.thrust.extra = 1; }));
  assert.throws(broken(d => { d.melee.cleaver.moves.skill_pommel = {}; }));
  assert.throws(broken(d => { d.melee.cleaver.moves.thrust.activeTicks = 0; }));
  assert.throws(broken(d => { delete d.melee.cleaver.costs.dodge; }));
  assert.throws(broken(d => { d.melee.cleaver.contact = [0.1]; }));
  assert.throws(broken(d => { d.melee.cleaver.targeting.nearest = 'no'; }));
  assert.throws(broken(d => { d.melee.cleaver.lowMoves['original-rat'].includeRadius = 1; }));
  assert.throws(broken(d => { d.melee.boneSaw.moves.thrust.windupTicks = 3; }));
  assert.throws(broken(d => { d.melee.boneSaw.costs.special = 1; }));
  assert.doesNotThrow(broken(() => {}));
  assert.throws(() => buildGameData({weapons: [{schema_version: 2}, validateWeapons]}));
});
