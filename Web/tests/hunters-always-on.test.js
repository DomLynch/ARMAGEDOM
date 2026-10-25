import test from 'node:test';
import assert from 'node:assert/strict';
import {make, shipped} from './helpers/marked-fixture.js';
import {stepMarkedHunters, clearMarkedHunters} from '../src/engine/marked-hunters.js';
import {LondonWorld} from '../src/world.js';
import {effectiveBounty, validateMarkedData} from '../src/engine/marked.js';
import {safehouseTouches} from '../src/engine/safehouse.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';

// Dom, 25 Oct: the hunters come back, always on, GTA-style; no bounty needed; the contract stays off and the bounty line stays hidden.
// First arrival about 75 s into the area, then 105 s after the previous hunter dies or leaves. These rows run the SHIPPED data on the
// real run (mechanics rows with the old bounty-gated timings are in marked-hunters.test.js).
const c = shipped.markedData;
const spawn = p => ({id: 999, hp: 80, markedHunter: true, pos: {...p}, radius: 0.4, hostile: true});
function run() {
  const f = make({data: shipped});
  const g = f.g;
  g.enemies = [];
  g.world.travelAt = LondonWorld.prototype.travelAt.bind(g.world);
  g.marked = {version: 1, carried: 0, bank: 0, bounty: 0}; // no money and no bounty at all
  clearMarkedHunters(g);
  g.time = 0;
  return f;
}
const arrive = (g, from) => {
  // Step the clock in whole seconds until a hunter exists or the cap is hit; returns the time of arrival.
  for (let t = from; t < from + 400; t += 0.5) {
    g.time = t;
    stepMarkedHunters(g, spawn);
    if (g.enemies.some(e => e.markedHunter)) return t;
  }
  return null;
};

test('shipped data: hunters on, no bounty gate, bounty off, 75 s first arrival and 105 s re-arrival', () => {
  assert.equal(c.hunters, true);
  assert.equal(c.bounty, false);
  assert.equal(c.hunterBounty, 0);
  assert.equal(c.arrivalDelay, 75);
  assert.equal(c.respawnDelay, 105);
  assert.equal(shipped.expedition.contract.enabled, false);
});

test('a hunter comes with no money and no bounty: nothing before 75 s, the warning at 75 s, the hunter 2 s later', () => {
  const g = run().g;
  for (const t of [0, 10, 40, 74.5]) {
    g.time = t;
    stepMarkedHunters(g, spawn);
    assert.equal(g.markedHunt.warning, null, 'no warning at ' + t);
    assert.equal(g.enemies.length, 0);
  }
  g.time = 75;
  stepMarkedHunters(g, spawn);
  assert(g.markedHunt.warning, 'warning at 75 s');
  assert(g.events.some(e => e.type === 'marked-hunter-warning'));
  g.time = 77;
  stepMarkedHunters(g, spawn);
  assert.equal(g.enemies.filter(e => e.markedHunter).length, 1, 'the hunter arrives');
  assert.equal(effectiveBounty(g), 0, 'bounty stays off');
});

test('after the hunter dies the next one comes 105 s later (not before), one at a time', () => {
  const g = run().g;
  const first = arrive(g, 0);
  assert(first >= 75 && first <= 78);
  const hunter = g.enemies.find(e => e.markedHunter);
  g.time = first + 20;
  stepMarkedHunters(g, spawn);
  assert.equal(g.enemies.filter(e => e.markedHunter && e.hp > 0).length, 1, 'only one hunter at a time');
  hunter.hp = 0; // killed
  const died = first + 21;
  g.time = died;
  stepMarkedHunters(g, spawn);
  g.enemies = g.enemies.filter(e => e.hp > 0);
  for (const t of [died + 30, died + 100, died + 104.5]) {
    g.time = t;
    stepMarkedHunters(g, spawn);
    assert.equal(g.markedHunt.warning, null, 'no warning at death + ' + (t - died));
  }
  g.time = died + 105;
  stepMarkedHunters(g, spawn);
  assert(g.markedHunt.warning, 'warning 105 s after the death');
});

test('leaving the area with a hunter alive counts as the hunter leaving: the next one waits the re-arrival delay', () => {
  const g = run().g;
  const first = arrive(g, 0);
  assert(first !== null);
  const left = first + 10;
  g.time = left;
  clearMarkedHunters(g, {areaId: 'east'}); // area travel clears the current hunter
  assert.equal(g.enemies.filter(e => e.markedHunter).length, 0);
  assert(g.markedHunt.nextSpawnAt >= left + c.respawnDelay);
  const next = arrive(g, left + 1);
  assert(next === null || next >= left + c.respawnDelay, 'no hunter before the re-arrival delay');
});

test('safehouses still suppress warning and spawn', () => {
  const g = run().g;
  g.player.pos = g.world.geometry.ground(g.world.safehouseData.props[0].standing);
  assert(safehouseTouches(g, g.player.pos, g.player.radius));
  for (const t of [75, 80, 200, 400]) {
    g.time = t;
    stepMarkedHunters(g, spawn);
    assert.equal(g.markedHunt.warning, null);
    assert.equal(g.enemies.length, 0);
  }
});

test('an old save that carries a bounty loads; the bounty stays on disk and counts as 0', () => {
  const f = make({data: shipped});
  f.g.enemies = [];
  f.g.marked = {version: 1, carried: 300, bank: 40, bounty: 500};
  assert(f.p.persistRun(f.g));
  const again = make({records: new Map(f.records), data: shipped});
  assert(!again.g.runSaveInvalid);
  assert.deepEqual(again.g.marked, {version: 1, carried: 300, bank: 40, bounty: 500});
  assert.equal(effectiveBounty(again.g), 0);
});

test('the rules validator accepts hunterBounty 0 and the new respawnDelay, and rejects a zero or short value elsewhere', () => {
  assert(validateMarkedData(structuredClone(c), registry));
  assert.throws(() => validateMarkedData({...structuredClone(c), respawnDelay: 10}, registry));
  assert.throws(() => validateMarkedData({...structuredClone(c), arrivalDelay: 0}, registry));
  assert.throws(() => validateMarkedData({...structuredClone(c), hunterBounty: -1}, registry));
  const missing = structuredClone(c);
  delete missing.respawnDelay;
  assert.throws(() => validateMarkedData(missing, registry));
});
