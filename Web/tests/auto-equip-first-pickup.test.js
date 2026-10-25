import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {createRifleView} from '../src/engine/rifle-view.js';
import {autoEquipAfterClaim} from '../src/engine/auto-equip.js';
import {GAME_DATA, validateWeapons} from '../src/engine/game-data.js';

// Dom, 25 Oct 2026: picking up a weapon you did not carry makes it the active weapon at once; the old one stays carried.
// Rule in Web/src/data/weapons.json `autoEquipOnFirstPickup`. These rows run the real Rifle view with the real dispatcher, persistence
// and reload (only the DOM elements and the asset loader are stand-ins).
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

function stage() {
  const f = fixture();
  f.restore();
  assert(f.kill(), 'the rifle holder dies and drops the rifle');
  const g = f.g;
  assert.equal(g.rifle.status, 'pending');
  // Carrying the Starting Pistol, equipped: the weapon the rifle must replace (the claim writes it into the record).
  g.pistol = {...g.pistol, collected: true, equipped: true, magazine: 4, reserve: 9};
  g.player.weapon = 'pistol';
  g.player.pos = {...g.rifle.dropPosition};
  const listeners = new Map();
  const element = id => ({id, style: {}, addEventListener: (type, fn) => listeners.set(id + ':' + type, fn), removeEventListener() {}});
  const elements = new Map(['rifle-equipment', 'rifle-equip', 'rifle-pickup', 'rifle-state'].map(id => [id, element(id)]));
  const prior = globalThis.document;
  globalThis.document = {getElementById: id => elements.get(id)};
  const state = {game: g, world: f.world, loaded: true, paused: false, input: {clear() {}}, actors: {rifleReady: () => true, ensureRifle: async () => {}}};
  const view = createRifleView(state, f.p.dispatchRifle);
  return {f, g, view, listeners, restore: () => { view.dispose(); globalThis.document = prior; }};
}

for (const [mode, claim] of [
  ['keyboard (nearest-interaction run)', ctx => ctx.view.interaction().run()],
  ['touch (pickup button tap)', ctx => ctx.listeners.get('rifle-pickup:click')()],
])
  test(`collecting the Rifle by ${mode} equips it, keeps the pistol carried and survives a reload`, async () => {
    const ctx = stage();
    try {
      const pistolBefore = structuredClone(ctx.g.pistol);
      claim(ctx);
      await flush();
      const {g} = ctx;
      assert.equal(g.rifle.status, 'owned');
      assert.equal(g.rifle.selected, true, 'the rifle is the active weapon');
      assert.equal(g.player.weapon, 'rifle');
      assert.equal(g.pistol.collected, true, 'the pistol is still carried');
      assert.equal(g.pistol.equipped, false);
      assert.equal(g.pistol.magazine, pistolBefore.magazine);
      assert.equal(g.pistol.reserve, pistolBefore.reserve);
      assert.deepEqual(g.events.filter(e => e.type === 'auto-equip').map(e => e.itemId), [g.world.rifleData.itemId]);
      // The selection is already in the durable record: a cold restore brings the same weapon back.
      const cold = fixture({records: ctx.f.records});
      cold.restore();
      assert.equal(cold.g.rifle.status, 'owned');
      assert.equal(cold.g.rifle.selected, true);
      assert.equal(cold.g.player.weapon, 'rifle');
      assert.equal(cold.g.pistol.collected, true);
      assert.equal(cold.g.pistol.equipped, false);
    } finally {
      ctx.restore();
    }
  });

test('a rifle already carried is not re-equipped: there is nothing to collect, and Equip stays the player\'s choice', async () => {
  const ctx = stage();
  try {
    ctx.view.interaction().run();
    await flush();
    // Back to melee through Gear, then walk over nothing: no pending drop, so no interaction and no switch.
    assert(ctx.f.p.dispatchRifle(ctx.g, {type: 'equip', itemId: ctx.g.world.rifleData.itemId, equipped: false}, true).ok);
    assert.equal(ctx.g.rifle.selected, false);
    assert.equal(ctx.view.interaction(), null);
    await flush();
    assert.equal(ctx.g.rifle.selected, false);
    assert.equal(ctx.g.events.filter(e => e.type === 'auto-equip').length, 1);
  } finally {
    ctx.restore();
  }
});

test('autoEquipAfterClaim emits nothing when the weapon did not become active', async () => {
  const g = {events: []};
  assert.equal(await autoEquipAfterClaim(g, {equip: async () => {}, active: () => false, itemId: 'x'}), false);
  assert.deepEqual(g.events, []);
  assert.equal(await autoEquipAfterClaim(g, {equip: async () => {}, active: () => true, itemId: 'x'}), true);
  assert.deepEqual(g.events, [{type: 'auto-equip', itemId: 'x'}]);
});

test('the rule is data: weapons.json autoEquipOnFirstPickup is a required boolean, on by default', () => {
  assert.equal(GAME_DATA.weapons.autoEquipOnFirstPickup, true);
  const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL('../src/data/weapons.json', import.meta.url))));
  const without = raw();
  delete without.autoEquipOnFirstPickup;
  assert.throws(() => validateWeapons(without));
  const text = raw();
  text.autoEquipOnFirstPickup = 'yes';
  assert.throws(() => validateWeapons(text));
  assert.doesNotThrow(() => validateWeapons(raw()));
});
