import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAME_DATA} from '../src/engine/game-data.js';
import {validateBossTaunts} from '../src/engine/boss-taunts-data.js';
import {createBossTaunts, tauntsEnabled} from '../src/engine/boss-taunts.js';

const D = GAME_DATA.bossTaunts;
const area = JSON.parse(readFileSync(new URL('../public/world/area-content.json', import.meta.url)));
const names = Object.values(area.bosses.profiles).map(p => p.name);
const boss = (extra = {}) => ({id: 'b1', bossName: names[0], bossProfile: {}, hp: 100, maxHP: 100, pos: {x: 50, z: 0}, alerted: false, ...extra});
const world = (enemies, extra = {}) => ({time: 100, messageUntil: 0, message: '', player: {pos: {x: 0, z: 0}}, enemies, ...extra});
const make = () => createBossTaunts({random: () => 0});

test('all 7 humanoid bosses have lines for spawn, aggro, hurt and death, and every line fits the HUD line', () => {
  assert.equal(names.length, 7);
  assert.deepEqual(Object.keys(D.bosses).sort(), [...names].sort(), 'rows match the boss names in the game data');
  for (const name of names)
    for (const kind of Object.keys(D.kindPriority)) {
      assert.ok(D.bosses[name][kind].length >= 2, `${name}.${kind}`);
      for (const line of D.bosses[name][kind]) assert.ok(line.length <= D.maxChars, `${name}.${kind}: ${line}`);
    }
  validateBossTaunts(structuredClone(D));
  const bad = patch => assert.throws(() => validateBossTaunts(patch(structuredClone(D))), TypeError);
  bad(d => { d.bosses[names[0]].hurt = []; return d; });
  bad(d => { d.bosses[names[0]].spawn = ['x'.repeat(d.maxChars + 1)]; return d; });
});

test('spawn needs the player in range, aggro and hurt follow the boss, each fires once', () => {
  const t = make(), g = world([boss()]);
  t.observe(g);
  assert.equal(g.message, '', 'out of range, calm, healthy: nothing');
  g.enemies[0].pos.x = 5;
  t.observe(g);
  assert.equal(g.message, D.bosses[names[0]].spawn[0]);
  assert.equal(g.messageUntil, 100 + D.showSeconds);
  g.time = 200; g.enemies[0].alerted = true;
  t.observe(g);
  assert.equal(g.message, D.bosses[names[0]].aggro[0]);
  g.time = 300; g.enemies[0].hp = 100 * D.hurtShare;
  t.observe(g);
  assert.equal(g.message, D.bosses[names[0]].hurt[0]);
  g.time = 400; g.message = '';
  t.observe(g);
  assert.equal(g.message, '', 'every kind fired once');
});

test('a live message is never covered, the line waits then shows, or is dropped after waitSeconds', () => {
  const t = make(), g = world([boss({pos: {x: 1, z: 0}})], {message: 'Switched to Pistol.', messageUntil: 103});
  t.observe(g);
  assert.equal(g.message, 'Switched to Pistol.');
  g.time = 103.5;
  t.observe(g);
  assert.equal(g.message, D.bosses[names[0]].spawn[0], 'shown once the message cleared');
  const late = make(), h = world([boss({pos: {x: 1, z: 0}})], {message: 'Switched to Pistol.', messageUntil: 500});
  late.observe(h);
  h.time = 100 + D.waitSeconds + 1; h.messageUntil = 0;
  late.observe(h);
  assert.equal(h.message, 'Switched to Pistol.', 'dropped, not shown late');
});

test('rate limit: one line per minGapSeconds; death outranks a waiting lower line', () => {
  const t = make(), b = boss({pos: {x: 1, z: 0}, alerted: true}), g = world([b]);
  t.observe(g);
  assert.equal(g.message, D.bosses[names[0]].aggro[0], 'aggro outranks spawn when both are waiting');
  g.time += D.showSeconds + 0.1;
  t.observe(g);
  assert.equal(g.message, D.bosses[names[0]].aggro[0], 'the spawn line is not shown inside the gap');
  const dead = {...b, hp: 0};
  const g2 = world([], {time: 100 + D.minGapSeconds + 10});
  t.observe(g2, [{type: 'boss-defeated', actor: dead}]);
  assert.equal(g2.message, D.bosses[names[0]].death[0]);
});

test('non-bosses and unknown bosses are silent; ?taunts=0 turns them off', () => {
  const t = make(), g = world([{...boss({pos: {x: 1, z: 0}}), bossProfile: undefined}, boss({id: 'x', bossName: 'Nobody', pos: {x: 1, z: 0}})]);
  t.observe(g);
  assert.equal(g.message, '');
  assert.equal(tauntsEnabled(D, ''), true);
  assert.equal(tauntsEnabled(D, '?taunts=0'), false);
});
