// Rollback-save check: a save written by THIS tree must still load in the frozen previous release.
// Runs only when ROLLBACK_BASELINE_ROOTS (or ROLLBACK_BASELINE_ROOT) lists frozen release checkouts, separated by ':'.
// Every case is replayed once per baseline, so players carrying a saved run forward from any listed release are covered.
// Direction is the reverse of wolf221-saves: current tree writes, frozen baseline reads.
// Create a baseline with `git archive <release-sha> Web | tar -x -C <dir>`, link Web/node_modules (three@0.182.0),
// and keep it off the system disk: on the VPS under /mnt/HC_Volume_107195252/armagedom-backend/, never / or /tmp.
//   ROLLBACK_BASELINE_ROOTS=<dir222>:<dir224> node --test tests/rollback-saves.test.js
// Baselines checked so far: release 222 = 6cc1bcbd, release 224 = 56f6d177, release 225 = 3474e64.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {fixture} from './helpers/rifle-fixture.js';
import {wolfFixture} from './helpers/wolf-fixture.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';
import {issueSupply} from '../src/supplies.js';
const roots = (process.env.ROLLBACK_BASELINE_ROOTS ?? process.env.ROLLBACK_BASELINE_ROOT ?? '').split(':').filter(Boolean);
const skip = roots.length ? false : 'set ROLLBACK_BASELINE_ROOTS to the frozen previous-release checkout(s)';
const RUN_KEY = 'armagedom:marked-run:v18';
const EXTRA_WORLD_FIELDS = ['bossEquipmentData', 'safehouseData', 'reaperData', 'markedData'];

const readCurrent = p => JSON.parse(fs.readFileSync(new URL('../public/' + p, import.meta.url)));
const currentRegistry = fixture().world.registry;
const currentData = validateAreaMetadata(readCurrent('world/area-content.json'), currentRegistry);
const pick = data => Object.fromEntries(EXTRA_WORLD_FIELDS.map(field => [field, data[field]]));

async function loadBaseline(root) {
  const url = p => pathToFileURL(root + '/' + p);
  const read = p => JSON.parse(fs.readFileSync(url('Web/public/' + p)));
  const {fixture: baselineFixture} = await import(url('Web/tests/helpers/rifle-fixture.js'));
  const {createAreaRegistry} = await import(url('Web/src/area-registry.js'));
  const {validateAreaMetadata: validate} = await import(url('Web/src/engine/area-content.js'));
  const registry = createAreaRegistry({manifest: read('world/manifest.json')});
  const data = validate(read('world/area-content.json'), registry);
  return {label: root.split('/').filter(Boolean).pop(), fixture: baselineFixture, data, read};
}
const baselines = skip ? [] : await Promise.all(roots.map(loadBaseline));
// Tests in a file run one after another, so the case body can read the baseline it was registered for.
let baseline = null;
function rollbackTest(name, body) {
  if (skip) return test(name, {skip}, body);
  for (const entry of baselines) test(name + ' [' + entry.label + ']', () => { baseline = entry; return body(); });
}

// Load the records the current tree wrote into the frozen release; return its fixture after restore.
function readInBaseline(records, areaId, extraWorld) {
  const old = baseline.fixture({areaId, extraWorld, records: new Map(records)});
  old.restore();
  assert(!old.g.runSaveInvalid, 'baseline marked the save invalid');
  return old;
}

// What every case must hold: valid load, same HP / progression / equipment / fuel, and the baseline can
// save again without changing the v18 key set.
function assertSameRun(current, old, records, {savedFuel} = {}) {
  assert.equal(old.g.player.hp, current.player.hp);
  assert.deepEqual(old.g.progression, current.progression);
  if (current.bossEquipment !== undefined) assert.deepEqual(old.g.bossEquipment, current.bossEquipment);
  if (savedFuel) {
    // Flame saves are coalesced: disk holds the last real write, never less fuel than live.
    assert.deepEqual(old.g.flameFuel, savedFuel);
    assert(savedFuel.fuelUnits >= current.flameFuel.fuelUnits - 1e-9);
  } else if (current.flameFuel !== undefined) assert.deepEqual(old.g.flameFuel, current.flameFuel);
  assert(old.p.persistRun(old.g), 'baseline could not save the loaded run');
  // The baseline may leave an unchanged record untouched; any record it does write keeps version and keys.
  for (const [key, raw] of records) {
    const before = JSON.parse(raw), after = JSON.parse(old.records.get(key));
    assert.equal(after.version, before.version, key + ' version changed');
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), key + ' keys changed');
  }
  if (records.has(RUN_KEY)) assert.equal(JSON.parse(old.records.get(RUN_KEY)).version, 18);
}

function killBoss(f, field) {
  const g = f.g, source = currentData.bossEquipmentData[field].source;
  const e = g.enemies.find(e => e.placementKey === source.placementKey);
  assert(e, 'boss not present in ' + f.world.areaId);
  e.hp = 0;
  g.supplies = issueSupply(g.supplies, {areaId: f.world.areaId, placementKey: e.placementKey, position: e.pos, hp: 0, rules: g.lootRules, cycle: g.animalCycle}).state;
  stageProgressionDeath(g, e, 'knife', e.maxHP);
  g.corpses.push(e);
  return e;
}
// No legal ground within `radius` of the corpse: forces the fallback drop spot.
function wall(f, e, radius) {
  const clear = f.world.geometry.clear.bind(f.world.geometry);
  f.world.geometry.clear = (p, r) => Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > radius && clear(p, r);
}

rollbackTest('a) ordinary save loads in the previous release', () => {
  const f = fixture({areaId: 'westminster', extraWorld: pick(currentData)});
  f.restore();
  f.g.player.hp = Math.max(1, f.g.player.hp - 17);
  assert(f.p.persistRun(f.g));
  assertSameRun(f.g, readInBaseline(f.records, 'westminster', pick(baseline.data)), f.records);
});

for (const [name, radius] of [['placed at the corpse', 0], ['from the new fallback path', 1.2]]) {
  rollbackTest('c) pending boss drop ' + name + ' loads in the previous release and can be collected', () => {
    const f = fixture({areaId: 'westminster', extraWorld: pick(currentData)});
    f.restore();
    const e = killBoss(f, 'emberProjector');
    if (radius) wall(f, e, radius);
    assert(f.p.persistRun(f.g), 'current tree could not save the kill');
    const drop = f.g.bossEquipment.emberProjector;
    assert.equal(drop.status, 'pending');
    if (radius) assert(Math.hypot(drop.dropPosition.x - e.pos.x, drop.dropPosition.z - e.pos.z) > radius, 'fallback path not exercised');
    const old = readInBaseline(f.records, 'westminster', pick(baseline.data));
    assertSameRun(f.g, old, f.records);
    old.g.player.pos = {...drop.dropPosition};
    const claim = old.p.dispatchBossEquipment(old.g, {type: 'claimPickup', pickupId: currentData.bossEquipmentData.emberProjector.itemId}, true);
    assert(claim.ok, 'baseline could not collect the pending drop: ' + claim.code);
    assert.equal(old.g.bossEquipment.emberProjector.status, 'owned');
  });
}

rollbackTest('c) pending rifle drop from the new fallback path loads in the previous release and can be collected', () => {
  const f = fixture();
  f.restore();
  const e = f.g.enemies.find(e => e.placementKey === 'boss-warden-v1');
  wall(f, e, 1.2);
  assert(f.kill(), 'current tree could not save the rifle kill');
  assert.equal(f.g.rifle.status, 'pending');
  assert(Math.hypot(f.g.rifle.dropPosition.x - e.pos.x, f.g.rifle.dropPosition.z - e.pos.z) > 1.2, 'fallback path not exercised');
  const old = readInBaseline(f.records, 'east-bridge', {});
  assertSameRun(f.g, old, f.records);
  assert.deepEqual(old.g.rifle, f.g.rifle);
  assert(old.pickup().ok, 'baseline could not collect the pending rifle');
});

// East8 wolf: the previous release reads a 223-written alive wolf as alive and a dead one as dead.
for (const dead of [false, true]) {
  rollbackTest('d) East8 wolf ' + (dead ? 'dead stays dead' : 'alive stays alive') + ' in the previous release', () => {
    const records = new Map(), f = wolfFixture({records});
    f.restore();
    const e = f.g.enemies.find(e => e.placementKey === 'east-roamer-8');
    assert(e);
    if (dead) {
      e.hp = 0;
      f.g.supplies = issueSupply(f.g.supplies, {areaId: 'east', placementKey: e.placementKey, position: e.pos, hp: 0, rules: f.g.lootRules, cycle: f.g.animalCycle}).state;
      stageProgressionDeath(f.g, e, 'knife', 40);
      f.g.corpses.push(e);
    }
    assert(f.p.persistRun(f.g));
    const extraWorld = {...baseline.data, layout: baseline.read('world/east/layout.json')};
    const old = readInBaseline(records, 'east', extraWorld);
    const wolf = old.g.enemies.find(e => e.placementKey === 'east-roamer-8');
    if (dead) assert(!wolf, 'dead East8 was revived');
    else {
      assert(wolf, 'alive East8 disappeared');
      assert.equal(wolf.hp, 40);
    }
    assertSameRun(f.g, old, records);
  });
}

// Westminster Ember Projector: kill, collect, equip, then spend fuel through the real flame save path.
function armedFlame() {
  const f = fixture({areaId: 'westminster', extraWorld: pick(currentData)});
  f.restore();
  killBoss(f, 'emberProjector');
  assert(f.p.persistRun(f.g));
  const itemId = currentData.bossEquipmentData.emberProjector.itemId;
  f.g.player.pos = {...f.g.bossEquipment.emberProjector.dropPosition};
  assert(f.p.dispatchBossEquipment(f.g, {type: 'claimPickup', pickupId: itemId}, true).ok);
  assert(f.p.dispatchBossEquipment(f.g, {type: 'equip', itemId, equipped: true}, true).ok);
  return f;
}
function fire(f, ticks) {
  for (let i = 0; i < ticks; i++) {
    f.g.tick++;
    f.g.time += 1 / 60;
    assert(f.p.dispatchFlame(f.g, {type: 'save'}, {seconds: 1 / 60, active: true}, true).ok);
  }
}

for (const [name, ticks] of [['partly spent fuel (coalesced write)', 100], ['empty tank', 6200]]) {
  rollbackTest('b) mid-flame save with ' + name + ' loads in the previous release', () => {
    const f = armedFlame();
    fire(f, ticks);
    const savedFuel = JSON.parse(f.records.get(RUN_KEY)).flameFuel;
    if (ticks === 100) assert(f.g.flameFuel.fuelUnits > 0 && f.g.flameFuel.fuelUnits <= savedFuel.fuelUnits);
    else assert.equal(f.g.flameFuel.fuelUnits, 0);
    const old = readInBaseline(f.records, 'westminster', pick(baseline.data));
    assertSameRun(f.g, old, f.records, {savedFuel});
    assert.equal(old.g.flameFuel.collected, true);
    assert(old.g.flameFuel.fuelUnits - f.g.flameFuel.fuelUnits <= 10 + 1e-6, 'disk is more than one second stale');
  });
}
