import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attacks} from '../src/combat.js';
import {PLAYER_HEALTH_RULES, stepPlayerHealth} from '../src/engine/player-health.js';
import {GAME_DATA, validateCreatures} from '../src/engine/game-data.js';

// Data batch 4, PR B: the legacy attacks table (combat.js) and PLAYER_HEALTH_RULES (engine/player-health.js) moved into
// Web/src/data/creatures.json. tests/fixtures/attacks-health-pre-data.json is the old in-code values, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/attacks-health-pre-data.json', import.meta.url)));

test('attacks and PLAYER_HEALTH_RULES equal the old in-code values exactly (floats included) and are now frozen', () => {
  assert.deepEqual(attacks, old.attacks);
  assert.deepEqual(Object.keys(attacks), Object.keys(old.attacks));
  assert.deepEqual(PLAYER_HEALTH_RULES, old.PLAYER_HEALTH_RULES);
  assert(Object.isFrozen(attacks) && Object.isFrozen(attacks.slash) && Object.isFrozen(PLAYER_HEALTH_RULES));
});

test('regeneration still gives maxHP / 60 per second of active play', () => {
  const player = {hp: 30, maxHP: 120};
  stepPlayerHealth(player, 1);
  assert.equal(player.hp, 32);
  stepPlayerHealth(player, 60);
  assert.equal(player.hp, 120);
});

test('the loader validates the new creatures sections: unknown, missing or bad fields are rejected', () => {
  const broken = mutate => {
    const d = structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/creatures.json', import.meta.url))));
    mutate(d);
    return () => validateCreatures(d);
  };
  assert.equal(GAME_DATA.creatures.playerAttacks.heavy.cooldown, 1.6);
  assert.throws(broken(d => { delete d.playerAttacks; }));
  assert.throws(broken(d => { d.playerAttacks.extra = {}; }));
  assert.throws(broken(d => { delete d.playerAttacks.stab.arc; }));
  assert.throws(broken(d => { d.playerAttacks.stab.arc = 'wide'; }));
  assert.throws(broken(d => { d.playerAttacks.stab.single = 1; }));
  assert.throws(broken(d => { d.playerAttacks.slash.extra = 1; }));
  assert.throws(broken(d => { delete d.playerHealth; }));
  assert.throws(broken(d => { d.playerHealth.regenerationSeconds = 0; }));
  assert.throws(broken(d => { d.playerHealth.regenerationSeconds = 'slow'; }));
  assert.doesNotThrow(broken(() => {}));
});
