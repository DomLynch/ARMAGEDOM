import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateMarkedData, validMarked, MAX_MONEY_CEILING} from '../src/engine/marked.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';

// Data batch 1b: the MARKED_DEFAULTS copy was deleted; the rules live only in area-content.json `marked`. The old values are pinned
// here so the move is proven value-for-value.
const content = JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json', import.meta.url)));
const old = {
  version: 1,
  cashPerKill: 100,
  bossCash: 200,
  maxMoney: 1000000000,
  hunterBounty: 300,
  maxHunters: 1,
  hostileBudget: 6,
  minSpawnDistance: 8,
  warningSeconds: 2,
  spawnCooldown: 30,
  arrivalDelay: 6,
  hunterHealth: 80,
  hunterSpeed: 3.2,
  shop: {pistol: {price: 100, amount: 6}, rifle: {price: 150, amount: 4}, dressing: {price: 100, amount: 25}},
};

test('area-content.json marked rules equal the deleted MARKED_DEFAULTS, and the validator still enforces exactly those names', () => {
  const {projection, projections, hunters, bounty, ...rules} = content.marked;
  assert.deepEqual(rules, old);
  assert.equal(validateMarkedData(content.marked, registry).cashPerKill, 100);
  for (const name of Object.keys(old)) {
    const missing = structuredClone(content.marked);
    delete missing[name];
    assert.throws(() => validateMarkedData(missing, registry), name);
  }
  assert.throws(() => validateMarkedData({...structuredClone(content.marked), extra: 1}, registry));
});

test('the money ceiling is the old 1e9 default and still bounds both the rules and a saved envelope', () => {
  assert.equal(MAX_MONEY_CEILING, old.maxMoney);
  assert.throws(() => validateMarkedData({...structuredClone(content.marked), maxMoney: MAX_MONEY_CEILING + 1}, registry));
  assert(validMarked({version: 1, carried: MAX_MONEY_CEILING, bank: 0, bounty: 0}));
  assert(!validMarked({version: 1, carried: MAX_MONEY_CEILING + 1, bank: 0, bounty: 0}));
});
