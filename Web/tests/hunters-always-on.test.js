import test from 'node:test';
import assert from 'node:assert/strict';
import {make, shipped} from './helpers/marked-fixture.js';
import {stepMarkedHunters, clearMarkedHunters} from '../src/engine/marked-hunters.js';
import {LondonWorld} from '../src/world.js';
import {stepGame} from '../src/combat.js';
import {effectiveBounty, validateMarkedData} from '../src/engine/marked.js';
import {safehouseTouches} from '../src/engine/safehouse.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';

// Dom, 25 Oct: the hunters come back, always on, GTA-style; no bounty needed; the contract stays off and the bounty line stays hidden.
// First arrival about 60 s into the run (the clock is per run: travel does not restart it), then 90 s after the previous hunter dies or leaves. These rows run the SHIPPED data on the
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

test('shipped data: hunters on, no bounty gate, bounty off, 60 s first arrival and 90 s re-arrival', () => {
  assert.equal(c.hunters, true);
  assert.equal(c.bounty, false);
  assert.equal(c.hunterBounty, 0);
  assert.equal(c.arrivalDelay, 60);
  assert.equal(c.respawnDelay, 90);
  assert.equal(c.hostileBudget, undefined, 'the area resident count no longer gates hunters');
  assert.equal(shipped.expedition.contract.enabled, false);
});

test('a hunter comes with no money and no bounty: nothing before 60 s, the warning at 60 s, the hunter 2 s later', () => {
  const g = run().g;
  for (const t of [0, 10, 40, 59.5]) {
    g.time = t;
    stepMarkedHunters(g, spawn);
    assert.equal(g.markedHunt.warning, null, 'no warning at ' + t);
    assert.equal(g.enemies.length, 0);
  }
  g.time = 60;
  stepMarkedHunters(g, spawn);
  assert(g.markedHunt.warning, 'warning at 60 s');
  assert(g.events.some(e => e.type === 'marked-hunter-warning'));
  g.time = 62;
  stepMarkedHunters(g, spawn);
  assert.equal(g.enemies.filter(e => e.markedHunter).length, 1, 'the hunter arrives');
  assert.equal(effectiveBounty(g), 0, 'bounty stays off');
});

test('through the real game step the shipped data builds a real Hollow hunter that pursues the whole area, with no money and no bounty', () => {
  const g = run().g;
  g.time = 60;
  stepMarkedHunters(g, spawn);
  assert(g.markedHunt.warning, 'warning at 60 s');
  g.time = 62;
  stepGame(g, {}, 1 / 60);
  const hunter = g.enemies.find(e => e.markedHunter);
  assert(hunter, 'the game factory builds the hunter');
  assert.equal(hunter.rig, 'hollow-scavenger');
  assert.equal(hunter.hp, c.hunterHealth);
  assert.equal(hunter.residentIntent.pursuitScope, 'area');
  assert(hunter.alerted);
  assert.equal(g.marked.bounty, 0);
});

test('after the hunter dies the next one comes 90 s later (not before), one at a time', () => {
  const g = run().g;
  const first = arrive(g, 0);
  assert(first >= 60 && first <= 63);
  const hunter = g.enemies.find(e => e.markedHunter);
  g.time = first + 20;
  stepMarkedHunters(g, spawn);
  assert.equal(g.enemies.filter(e => e.markedHunter && e.hp > 0).length, 1, 'only one hunter at a time');
  hunter.hp = 0; // killed
  const died = first + 21;
  g.time = died;
  stepMarkedHunters(g, spawn);
  g.enemies = g.enemies.filter(e => e.hp > 0);
  for (const t of [died + 30, died + 80, died + 89.5]) {
    g.time = t;
    stepMarkedHunters(g, spawn);
    assert.equal(g.markedHunt.warning, null, 'no warning at death + ' + (t - died));
  }
  g.time = died + 90;
  stepMarkedHunters(g, spawn);
  assert(g.markedHunt.warning, 'warning 90 s after the death');
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

const resident = n => ({id: 500 + n, hp: 55, kind: 0, pos: {x: 30 + n, z: 30}, radius: 0.4, hostile: true});

test('six hostile residents do not block the hunter (Westminster starts with six)', () => {
  const g = run().g;
  g.enemies = [0, 1, 2, 3, 4, 5].map(resident);
  const at = arrive(g, 0);
  assert(at >= 60 && at <= 63, 'the hunter still arrives with the first-arrival wait: ' + at);
  assert.equal(g.enemies.filter(e => e.markedHunter).length, 1);
  assert.equal(g.enemies.length, 7);
});

test('the clock is per run: crossing areas does not restart the first-arrival wait', () => {
  const g = run().g;
  for (const [t, areaId] of [[10, 'east-bridge'], [25, 'central-hub'], [40, 'westminster'], [55, 'east-bridge']]) {
    g.time = t;
    clearMarkedHunters(g, {areaId}); // what stepMarkedHunters does when the world's area differs
    assert.equal(g.markedHunt.arrivedAt, 0, 'arrival clock kept after travelling at ' + t);
  }
  g.time = 59.5;
  stepMarkedHunters(g, spawn);
  assert.equal(g.markedHunt.warning, null);
  g.time = 60;
  stepMarkedHunters(g, spawn);
  assert(g.markedHunt.warning, 'warning at 60 s of the run although the area changed at 55 s');
});

test('five-minute run across three areas: first hunter ~60 s in, the next ~90 s after the last one dies or leaves', () => {
  const g = run().g,
    arrivals = [],
    journey = [[50, 'east-bridge'], [130, 'central-hub'], [215, 'westminster']],
    log = [];
  let hunter = null;
  for (let t = 0; t <= 300; t += 0.5) {
    g.time = t;
    const move = journey.find(([at]) => at === t);
    if (move) {
      clearMarkedHunters(g, {areaId: move[1]});
      log.push(['travel', move[1], t]);
    }
    stepMarkedHunters(g, spawn);
    const now = g.enemies.find(e => e.markedHunter && e.hp > 0) ?? null;
    if (now && now !== hunter) arrivals.push(t);
    hunter = now;
    if (hunter && t - arrivals[arrivals.length - 1] >= 20) hunter.hp = 0; // the player kills it 20 s after it arrives
    g.enemies = g.enemies.filter(e => e.hp > 0);
  }
  assert.equal(arrivals.length, 3, 'hunter arrival times: ' + arrivals);
  assert(arrivals[0] >= 60 && arrivals[0] <= 63, 'first hunter about 60 s in, whatever the travel: ' + arrivals);
  // The first one dies at ~82 s (20 s after arriving); the area change at 130 s comes with no hunter alive, the second hunter arrives
  // about respawnDelay after the death, the third about respawnDelay after the second died.
  assert(arrivals[1] - (arrivals[0] + 20) >= c.respawnDelay && arrivals[1] - (arrivals[0] + 20) <= c.respawnDelay + 3, String(arrivals));
  assert(arrivals[2] - (arrivals[1] + 20) >= c.respawnDelay, String(arrivals));
  console.log('hunter arrivals (s):', arrivals.join(', '), '| travel:', journey.map(j => j.join('@')).join(' '));
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
