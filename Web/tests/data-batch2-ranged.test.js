import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RANGED_WEAPON_CATALOG, validateRangedWeaponCatalog, RIFLE_PROFILE, SHOTGUN_PROFILE, ROCKET_PROFILE, GRENADE_PROFILE, MARSHAL_PISTOL_PROFILE} from '../src/engine/weapon-catalog.js';
import {GAME_DATA, buildGameData} from '../src/engine/game-data.js';
import {weaponRules, WEAPON_IDS} from '../src/engine/world-events.js';
import {PISTOL_RULES} from '../src/pistol.js';

// Data batch 2, PR 1: RANGED_WEAPON_CATALOG moved from code into Web/src/data/weapons.json (read through game-data.js).
// tests/fixtures/ranged-catalog-pre-data.json is the old in-code constant dumped before it was deleted.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/ranged-catalog-pre-data.json', import.meta.url)));

test('the catalogue read from weapons.json deep-equals the deleted in-code constant, in the same row order', () => {
  assert.deepEqual(RANGED_WEAPON_CATALOG, old);
  assert.deepEqual(Object.keys(RANGED_WEAPON_CATALOG), Object.keys(old));
  assert.equal(RANGED_WEAPON_CATALOG['borough-butchers-rocket-launcher-v1'].name, 'Butcher’s Rocket Launcher');
  assert(Object.isFrozen(RANGED_WEAPON_CATALOG) && Object.isFrozen(RANGED_WEAPON_CATALOG['standard-grenade-v1'].rules));
});

test('the named profiles and the pistol rules still resolve to the same rows', () => {
  assert.deepEqual(RIFLE_PROFILE, old['bridge-warden-rifle-v1']);
  assert.deepEqual(SHOTGUN_PROFILE, old['south-stalker-shotgun-v1']);
  assert.deepEqual(ROCKET_PROFILE, old['borough-butchers-rocket-launcher-v1']);
  assert.deepEqual(GRENADE_PROFILE, old['standard-grenade-v1']);
  assert.deepEqual(MARSHAL_PISTOL_PROFILE, old['borough-marshals-pistol-v1']);
  assert.deepEqual(PISTOL_RULES, old['westminster-start-pistol-v1'].rules);
});

test('the server-facing rules (weaponRules / WEAPON_IDS) equal what main produced before the move', () => {
  const before = JSON.parse(fs.readFileSync(new URL('./fixtures/weapon-rules-pre-data.json', import.meta.url)));
  assert.deepEqual([...WEAPON_IDS], before.ids);
  assert.deepEqual(JSON.parse(JSON.stringify(weaponRules())), before.rules);
});

test('the loader carries a schema_version and shape-checks weapons.json; the catalogue validator still rejects bad rows', () => {
  assert.equal(GAME_DATA.weapons.schema_version, 1);
  assert.throws(() => buildGameData({weapons: [{schema_version: 1, ranged: []}, (d) => { if (Array.isArray(d.ranged)) throw TypeError('bad'); }]}));
  const bad = structuredClone(old);
  bad['standard-grenade-v1'].rules.damage = 0;
  assert.throws(() => validateRangedWeaponCatalog(bad));
  const extra = structuredClone(old);
  extra['standard-grenade-v1'].extra = 1;
  assert.throws(() => validateRangedWeaponCatalog(extra));
});
