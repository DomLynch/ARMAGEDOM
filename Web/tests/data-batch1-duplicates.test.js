import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DRONE_KEYS} from '../src/drone-mechanics.js';
import {AREA_DRONE_SPAWNS} from '../src/area-drone-spawns.js';
import {animalAppearanceFor} from '../src/area-mob-spawns.js';
import {ANIMAL_CYCLES} from '../src/animal-cycle.js';
import {validateReaperData} from '../src/engine/reaper.js';

// Data batch 1 (Dom, 24 Oct: everything possible lives in data). Each in-code copy was deleted and now derives from, or reads, its
// one source. The "old" values below are the deleted constants, pinned here so the move is proven value-for-value.
const content = JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json', import.meta.url)));

test('DRONE_KEYS, derived from AREA_DRONE_SPAWNS, equals the deleted literal table', () => {
  assert.deepEqual(DRONE_KEYS, {'westminster-drone-1': 'westminster', 'east-drone-1': 'east', 'south-drone-1': 'south'});
  assert.equal(Object.keys(DRONE_KEYS).length, Object.values(AREA_DRONE_SPAWNS).flat().length);
  assert(Object.isFrozen(DRONE_KEYS));
});

test('first-animal appearances equal the deleted table and come from ANIMAL_CYCLES.A', () => {
  const old = {'westminster-roamer-4': 'rat-ash', 'south-roamer-3': 'rat-mangy', 'westminster-roamer-6': 'dog-ash-coated', 'east-roamer-4': 'dog-pack-chaser'};
  const rigFor = id => ({rat: 'original-rat', dog: 'original-dog', roach: 'original-roach'})[id.split('-')[0]];
  for (const [key, id] of Object.entries(old)) {
    assert.equal(ANIMAL_CYCLES.A[key], id, key);
    assert.equal(animalAppearanceFor({kind: 1, placementKey: key, rig: rigFor(id)}), id, key);
  }
  // A key that is in cycle A but was never a first appearance still gets nothing before a cycle assigns a recipe.
  assert.equal(animalAppearanceFor({kind: 1, placementKey: 'east-roamer-5', rig: 'original-roach'}), null);
  assert.equal(animalAppearanceFor({kind: 1, placementKey: 'westminster-roamer-4', rig: 'original-rat', animalRecipe: 'rat-soot'}), 'rat-soot');
});

test('the Reaper rules are the old deleted constant, held once in area-content.json and enforced by the validator', () => {
  const old = {damage: 6, range: 6, cadence: 1.4, windup: 0.2, boltSpeed: 8, boltRange: 6, orbitRadius: 1.4, followSpeed: 8};
  assert.deepEqual(content.reaper.rules, old);
  assert.deepEqual(validateReaperData(content.reaper, content.expedition).rules, old);
  const extra = structuredClone(content.reaper);
  extra.rules.extra = 1;
  assert.throws(() => validateReaperData(extra, content.expedition));
});
