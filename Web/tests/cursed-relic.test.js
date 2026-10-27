import test from 'node:test';
import assert from 'node:assert/strict';
import {make, atArea, shipped, read} from './helpers/marked-fixture.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';
import {createGeometry} from '../src/world-geometry.js';
import {validateAreaGeometry} from '../src/engine/area-content.js';
import {validateCursedRelicData, stepCursedRelic, cursedDamage, cursedHudText, relicHunters, relicPosition, cursedState} from '../src/engine/cursed-relic.js';
import {cursedHit, rangedHit} from '../src/combat.js';
import {effectiveWeaponDamage} from '../src/engine/progression-runtime.js';
import {stepMarkedHunters, clearMarkedHunters} from '../src/engine/marked-hunters.js';
import {safehouseTouches} from '../src/engine/safehouse.js';

const data = shipped.cursedRelicData;
let ids = 1000;
const spawn = p => ({id: ids++, hp: 80, markedHunter: true, pos: {...p}, radius: .4, hostile: true});
function relic(areaId = 'east') {
  const f = make(), g = f.g;
  atArea(f, areaId);
  g.world.cursedRelicData = data;
  g.world.markedData = shipped.markedData;
  g.enemies = []; g.corpses = []; g.events = []; g.time = 100;
  g.player.hp = g.player.maxHP ?? 100;
  return f;
}
const grab = g => { g.player.pos = {...relicPosition(g)}; stepCursedRelic(g, spawn); };
// The fake hunters do not walk, so move each one off the entrance after it arrives (real ones chase the player).
const advance = (g, seconds) => {
  for (let i = 0; i < seconds * 2; i++) {
    g.time += .5;
    stepCursedRelic(g, spawn);
    g.enemies.forEach((e, n) => { if (e.relicHunter && e.pos.x < 5000) e.pos = {x: 5000 + n * 50, z: 5000}; });
  }
};

test('shipped relic data validates: 2x damage, one hunter every 10 s, cap 8, Westminster has no relic', () => {
  assert.equal(data.damageMultiplier, 2);
  assert.equal(data.hunterIntervalSeconds, 10);
  assert.equal(data.huntersPerInterval, 1);
  assert.equal(data.maxHunters, 8);
  assert.equal(data.placements.westminster, undefined);
  assert.throws(() => validateCursedRelicData({...structuredClone(data), extra: 1}, registry));
  assert.throws(() => validateCursedRelicData({...structuredClone(data), maxHunters: 0}, registry));
  assert.throws(() => validateCursedRelicData({...structuredClone(data), placements: {nowhere: {x: .5, y: .5}}}, registry));
});

test('every relic stands on usable ground in its real layout', () => {
  const content = shipped;
  for (const id of Object.keys(data.placements)) {
    const layout = read('../../public/world/' + id + '/layout.json');
    assert.doesNotThrow(() => validateAreaGeometry(registry, id, layout, content.residents, content.expedition, content.bossData, content.populationData, content.flameData, content.safehouseData, data), id);
  }
});

test('picking up the relic doubles damage on every weapon path, and only then', () => {
  const g = relic().g;
  assert.equal(cursedDamage(g, 10), 10);
  assert.equal(effectiveWeaponDamage(g, 'knife', 10), effectiveWeaponDamage({...g, cursed: {active: false}}, 'knife', 10));
  const before = effectiveWeaponDamage(g, 'knife', 10);
  grab(g);
  assert.equal(cursedState(g).active, true);
  assert.equal(cursedDamage(g, 10), 20);
  assert.equal(effectiveWeaponDamage(g, 'knife', 10), before * 2);
  assert(g.events.some(e => e.type === 'cursed-relic-taken'));
  assert.match(cursedHudText(g), /CURSED x2/);
});

test('one relic hunter arrives every 10 s after the warning, and the cap is 8 alive at once', () => {
  const g = relic().g;
  grab(g);
  advance(g, 9);
  assert.equal(relicHunters(g).length, 0, 'nothing before the first interval');
  advance(g, 4);
  assert.equal(relicHunters(g).length, 1);
  advance(g, 10);
  assert.equal(relicHunters(g).length, 2);
  advance(g, 200);
  assert.equal(relicHunters(g).length, 8, 'never more than the cap');
  g.enemies.find(e => e.relicHunter).hp = 0;
  advance(g, 15);
  assert.equal(relicHunters(g).length, 8, 'a killed hunter is replaced up to the cap');
});

test('relic hunters never count toward the ordinary marked hunt', () => {
  const g = relic().g;
  grab(g);
  advance(g, 14);
  assert.equal(relicHunters(g).length, 1);
  clearMarkedHunters(g, {keepRelic: true});
  assert.equal(relicHunters(g).length, 1);
});

test('a safehouse ends the curse: damage back to 1x, relic hunters gone, relic stays gone', () => {
  const f = make(), g = f.g;
  g.world.cursedRelicData = data;
  g.world.markedData = shipped.markedData;
  g.enemies = [spawn({x: 1, z: 1}), spawn({x: 2, z: 2})];
  g.enemies.forEach(e => { e.relicHunter = true; });
  Object.assign(cursedState(g), {active: true, areaId: 'east', huntArea: g.world.areaId, nextAt: g.time + 5});
  assert.equal(cursedDamage(g, 10), 20);
  g.player.pos = g.world.geometry.ground(g.world.safehouseData.props[0].standing);
  assert(safehouseTouches(g, g.player.pos, g.player.radius));
  stepCursedRelic(g, spawn);
  assert.equal(cursedState(g).active, false);
  assert.equal(cursedDamage(g, 10), 10);
  assert.equal(relicHunters(g).length, 0);
  assert.equal(cursedState(g).taken.east, true, 'the relic does not come back this run');
  assert.match(g.message, /curse lifts/i);
});

test('death ends the curse and does not hand the relic back', () => {
  const g = relic().g;
  grab(g);
  advance(g, 25);
  assert(relicHunters(g).length >= 1);
  g.player.hp = 0;
  stepCursedRelic(g, spawn);
  assert.equal(cursedState(g).active, false);
  assert.equal(relicHunters(g).length, 0);
  assert.equal(cursedDamage(g, 10), 10);
  g.player.hp = 100;
  g.player.pos = {...relicPosition(g)};
  stepCursedRelic(g, spawn);
  assert.equal(cursedState(g).active, false, 'taken relics do not reappear this run');
});

test('the Westminster tutorial is untouched: no relic, no state, no damage change', () => {
  const f = make(), g = f.g;
  assert.equal(g.world.cursedRelicData?.placements.westminster, undefined);
  stepCursedRelic(g, spawn);
  assert.equal(cursedDamage(g, 10), 10);
  assert.equal(relicPosition(g), null);
});

function dealt(g, call) {
  const target = {id: 777, hp: 1000, maxHP: 1000, pos: {x: 5, z: 5}, radius: .4, hostile: true};
  g.enemies = [target];
  call({targetId: 777, direction: {x: 1, z: 0}});
  return 1000 - target.hp;
}
for (const weapon of ['shotgun', 'grenade', 'rocket', 'railgun', 'reaper']) {
  test(`the relic doubles ${weapon} damage exactly once`, () => {
    const g = relic().g;
    const plain = dealt(g, shot => cursedHit(g, shot, weapon, weapon, 10, 'bullet'));
    grab(g);
    assert.equal(dealt(g, shot => cursedHit(g, shot, weapon, weapon, 10, 'bullet')), plain * 2);
  });
}
test('pistol and bone saw are 2x with the relic, not 4x', () => {
  const g = relic().g;
  const pistol = dealt(g, shot => rangedHit(g, shot, 'pistol', 'westminster-start-pistol-v1', effectiveWeaponDamage(g, 'westminster-start-pistol-v1', 10)));
  const saw = dealt(g, shot => rangedHit(g, shot, 'knife', 'knife', effectiveWeaponDamage(g, 'knife', 10), 'saw'));
  grab(g);
  assert.equal(dealt(g, shot => rangedHit(g, shot, 'pistol', 'westminster-start-pistol-v1', effectiveWeaponDamage(g, 'westminster-start-pistol-v1', 10))), pistol * 2);
  assert.equal(dealt(g, shot => rangedHit(g, shot, 'knife', 'knife', effectiveWeaponDamage(g, 'knife', 10), 'saw')), saw * 2);
});

test('hunters off does not strip relic hunters', () => {
  const g = relic().g;
  grab(g);
  advance(g, 14);
  g.world.markedData = {...g.world.markedData, hunters: false};
  stepMarkedHunters(g, spawn);
  assert.equal(relicHunters(g).length, 1);
});
