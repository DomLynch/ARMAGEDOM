import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RAT_BITE, ROACH_BITE, DOG_BITE} from '../src/combat.js';
import {WOLF_BITE} from '../src/wolf-native.js';
import {SALAMANDER_BITE, SALAMANDER_BREATH} from '../src/salamander-native.js';
import {CREATURE_MOVES, resolveCreatureMoves} from '../src/creature-moves.js';
import {GAME_DATA, buildGameData, validateCreatures} from '../src/engine/game-data.js';

// Data batch 4, PR A: the creature bite / low-strike tables moved from combat.js, wolf-native.js and salamander-native.js into
// Web/src/data/creatures.json. tests/fixtures/creature-moves-pre-data.json is the old in-code tables, dumped before the move.
// deepEqual compares floats exactly (windup 15 / 60 and the rest are bit-identical, not rounded).
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/creature-moves-pre-data.json', import.meta.url)));
const byName = {
  RAT_LOW: 'rat_low', RAT_BITE: 'rat_bite', RAT_BITE_LOW: 'rat_bite_low', ROACH_LOW: 'roach_low', ROACH_BITE: 'roach_bite',
  ROACH_BITE_SCALED: 'roach_bite_scaled', DOG_LOW: 'dog_low', DOG_MID: 'dog_mid', DOG_BITE: 'dog_bite',
  DOG_BITE_SCALED: 'dog_bite_scaled', WOLF_BITE: 'wolf_bite', SALAMANDER_BITE: 'salamander_bite', WOLF_ATTACK: 'wolf_attack',
  SALAMANDER_ATTACK: 'salamander_attack',
};

test('every creature move row equals the old in-code table exactly and is frozen', () => {
  for (const [oldName, name] of Object.entries(byName)) {
    assert.deepEqual(CREATURE_MOVES[name], old[oldName], oldName);
    assert(Object.isFrozen(CREATURE_MOVES[name]), oldName + ' frozen');
  }
  assert.equal(Object.keys(CREATURE_MOVES).length, Object.keys(byName).length, 'no row without an old table');
  assert.deepEqual(SALAMANDER_BREATH, old.SALAMANDER_BREATH);
  assert.equal(RAT_BITE, CREATURE_MOVES.rat_bite);
  assert.equal(ROACH_BITE, CREATURE_MOVES.roach_bite);
  assert.equal(DOG_BITE, CREATURE_MOVES.dog_bite);
  assert.equal(WOLF_BITE, CREATURE_MOVES.wolf_bite);
  assert.equal(SALAMANDER_BITE, CREATURE_MOVES.salamander_bite);
});

test('the resolver layers parents left to right and derives seconds from ticks', () => {
  const rows = resolveCreatureMoves(
    {a: {windupTicks: 15, activeTicks: 6, recoveryTicks: 15, damage: 1}, b: {extends: 'a', damage: 2}, c: {extends: ['a', 'b'], recoveryTicks: 30}, k: {extends: 'knife:x'}},
    {x: {damage: 9, windupTicks: 3}},
  );
  assert.equal(rows.b.windup, 15 / 60);
  assert.equal(rows.c.damage, 2);
  assert.equal(rows.c.recovery, 30 / 60);
  assert.equal(rows.k.windup, 3 / 60);
  assert(Object.isFrozen(rows) && Object.isFrozen(rows.b));
  assert.throws(() => resolveCreatureMoves({b: {extends: 'a'}, a: {}}, {}), /unknown or later/);
  assert.throws(() => resolveCreatureMoves({b: {extends: 'knife:nope'}}, {}), /unknown or later/);
});

test('the loader validates the creatures section: unknown, missing or bad fields are rejected', () => {
  const broken = mutate => {
    const d = structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/creatures.json', import.meta.url))));
    mutate(d);
    return () => validateCreatures(d);
  };
  assert.equal(GAME_DATA.creatures.moves.dog_bite.damage, 8);
  assert.throws(broken(d => { d.extra = 1; }));
  assert.throws(broken(d => { delete d.salamanderBreath; }));
  assert.throws(broken(d => { d.moves.dog_bite.damage = NaN; }));
  assert.throws(broken(d => { d.moves.dog_bite.damage = {}; }));
  assert.throws(broken(d => { d.moves.dog_bite.windupTicks = 0; }));
  assert.throws(broken(d => { d.moves.dog_bite.extends = 'nowhere'; }));
  assert.throws(broken(d => { d.moves.dog_bite.extends = []; }));
  assert.throws(broken(d => { d.moves.Bad_Name = {}; }));
  assert.throws(broken(d => { d.salamanderBreath.kind = 'water'; }));
  assert.throws(broken(d => { d.salamanderBreath.range = 'far'; }));
  assert.doesNotThrow(broken(() => {}));
  assert.throws(() => buildGameData({creatures: [{schema_version: 2}, validateCreatures]}));
});
