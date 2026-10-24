import test from 'node:test';
import assert from 'node:assert/strict';
import {make, shipped, earn} from './helpers/marked-fixture.js';
import {ownsReaper} from '../src/engine/reaper.js';
import {contractEnabled, validateExpeditionData} from '../src/engine/expedition-core.js';
import {validateMarkedData} from '../src/engine/marked.js';
import {stepMarkedHunters} from '../src/engine/marked-hunters.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';

// Dom, 24 Oct: no optional contract, no bounty hunters, no bounty. Cash and bank stay.
const base = 'westminster-start-pistol-v1';
const receipt = 'west-east-stolen-supply-v1:watchmans-pistol-v1';
const reward = 'watchmans-pistol-v1';
const contract = shipped.expedition.contract;
const midContract = {
  accepted: {status: 'accepted', rewardReceipt: null, selectedPistolVariant: base},
  recovered: {status: 'recovered', rewardReceipt: null, selectedPistolVariant: base},
  claimed: {status: 'claimed', rewardReceipt: receipt, selectedPistolVariant: reward},
};
const withContract = (f, state) => {
  f.g.expedition = {version: 1, visitedIds: ['westminster', 'east'], ...state};
  assert(f.p.persistRun(f.g));
};
const reopen = (f, data) => {
  const again = make({records: new Map(f.records), data});
  assert(!again.g.runSaveInvalid);
  return again;
};

test('shipped data switches the contract, hunters and bounty off but keeps cash rules and the reward catalogue', () => {
  assert.equal(contract.enabled, false);
  assert.equal(contractEnabled(shipped.expedition), false);
  assert.equal(shipped.markedData.hunters, false);
  assert.equal(shipped.markedData.bounty, false);
  assert.equal(shipped.markedData.cashPerKill, 100);
  assert.equal(shipped.markedData.bossCash, 200);
  assert.equal(contract.rewardVariantId, reward);
  assert(shipped.reaperData);
});

test('the switches are optional booleans; absent means the old behaviour', () => {
  const content = structuredClone({expedition: shipped.expedition, marked: shipped.markedData});
  delete content.expedition.contract.enabled;
  assert.equal(contractEnabled(content.expedition), true);
  assert.throws(() => {
    const bad = structuredClone(shipped.expedition);
    bad.contract.enabled = 'no';
    validateExpeditionData(bad, registry);
  });
  assert.throws(() => validateMarkedData({...structuredClone(shipped.markedData), hunters: 0}, registry));
  assert(validateExpeditionData(structuredClone(shipped.expedition), registry));
});

test('contract off: accept, recover and claim are refused at the stash and the case in every saved stage', () => {
  for (const [stage, state] of [['available', {status: 'available', rewardReceipt: null, selectedPistolVariant: base}], ...Object.entries(midContract)]) {
    const f = make({data: shipped});
    withContract(f, state);
    const before = JSON.stringify(f.g.expedition);
    for (const [action, anchor] of [['accept', contract.giver], ['recover', contract.case], ['claim', contract.giver]]) {
      f.world.areaId = anchor.areaId;
      f.g.player.pos = {...anchor.position};
      const result = f.p.dispatchExpedition(f.g, {type: 'expedition', action}, true);
      assert(!result.ok, `${stage}/${action}`);
    }
    assert.equal(JSON.stringify(f.g.expedition), before, stage);
  }
});

test('a save made mid-contract still loads and plays; the stage is ignored and an owned reward stays owned', () => {
  for (const [stage, state] of Object.entries(midContract)) {
    const f = make({data: shipped});
    withContract(f, state);
    const again = reopen(f, shipped);
    assert.equal(again.g.expedition.status, stage);
    assert.equal(ownsReaper(again.g), stage === 'claimed');
    assert.equal(again.g.player.hp > 0, true);
    assert(again.p.persistRun(again.g), stage);
  }
});

test('bounty off: kills still add carried cash, bank still works, the bounty counter never moves', () => {
  const f = make({data: shipped});
  const e = earn(f);
  assert(e);
  assert.equal(f.g.marked.carried, 100);
  assert.equal(f.g.marked.bounty, 0);
  const again = reopen(f, shipped);
  assert.deepEqual(again.g.marked, {version: 1, carried: 100, bank: 0, bounty: 0});
});

test('hunters off: a save carrying a bounty loads, spawns no warning or hunter, and clears a leftover hunter', () => {
  const f = make({data: shipped});
  f.g.enemies = [];
  f.g.marked = {version: 1, carried: 300, bank: 40, bounty: 500};
  assert(f.p.persistRun(f.g));
  const again = reopen(f, shipped);
  assert.deepEqual(again.g.marked, {version: 1, carried: 300, bank: 40, bounty: 500});
  const g = again.g;
  g.enemies = [];
  const spawn = () => assert.fail('no hunter may be built');
  for (const time of [6, 8, 20, 40, 80]) {
    g.time = time;
    stepMarkedHunters(g, spawn);
    assert.equal(g.markedHunt?.warning ?? null, null);
    assert.equal(g.enemies.length, 0);
  }
  assert(!g.events.some((e) => e.type.startsWith('marked-hunter')));
  g.enemies = [{id: 9, hp: 80, markedHunter: true, pos: {x: 1, z: 1}, radius: 0.4}];
  stepMarkedHunters(g, spawn);
  assert.equal(g.enemies.length, 0);
});
