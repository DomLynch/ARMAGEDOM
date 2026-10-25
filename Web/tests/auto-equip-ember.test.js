import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/rifle-fixture.js';
import {issueSupply} from '../src/supplies.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';
import {BOSS_EQUIPMENT_PROFILES as profiles} from '../src/engine/boss-equipment-data.js';
import {createBossEquipmentView} from '../src/engine/boss-equipment-view.js';
import {setFlameEquipped} from '../src/engine/flame-runtime.js';
import {createFlameView} from '../src/engine/flame-view.js';

// Auditor finding on #140: the Gear Equip handlers are toggles. With the legacy area-8 flamethrower equipped, collecting the Ember
// Projector must RAISE the Ember Projector (auto-equip is raise-only), never lower the flamethrower and leave the player unarmed.
// Real dispatchers, persistence and reload; only the DOM elements and the asset loader are stand-ins.
const flush = () => new Promise(resolve => setTimeout(resolve, 20));

class Element extends EventTarget {
  constructor() { super(); this.style = {}; this.dataset = {}; this.children = []; this.textContent = ''; this.hidden = false; this.attributes = new Map(); }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  removeAttribute(k) { this.attributes.delete(k); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  toggleAttribute() {}
  remove() {}
}

function stage({legacyFlame}) {
  const field = 'emberProjector';
  const f = fixture({areaId: profiles[field].source.areaId, extraWorld: {bossEquipmentData: profiles}});
  f.restore();
  const g0 = f.g;
  if (g0.rifle?.selected) assert(f.p.dispatchRifle(g0, {type: 'equip', itemId: 'bridge-warden-rifle-v1', equipped: false}, true).ok);
  const e = g0.enemies.find(x => x.placementKey === profiles[field].source.placementKey);
  e.hp = 0;
  g0.supplies = issueSupply(g0.supplies, {areaId: f.world.areaId, placementKey: e.placementKey, position: e.pos, hp: 0, rules: g0.lootRules, cycle: g0.animalCycle}).state;
  stageProgressionDeath(g0, e, 'knife', e.maxHP);
  g0.corpses.push(e);
  assert(f.p.persistRun(g0));
  const g = f.g;
  g.enemies = g.enemies.filter(x => x !== e);
  assert.equal(g.bossEquipment[field].status, 'pending');
  if (legacyFlame) {
    g.flameFuel = {version: 1, collected: true, fuelUnits: 600};
    assert(setFlameEquipped(g, true), 'the legacy flamethrower is up');
  }
  g.player.pos = {...g.bossEquipment[field].dropPosition};
  const previous = globalThis.document;
  const nodes = new Map();
  const el = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  globalThis.document = {getElementById: el, createElement: () => new Element()};
  // Not ready while the cards are built (no 3D drop model is created in a unit run), ready afterwards (the pickup is offered).
  let ready = false;
  const state = {
    game: g, world: f.world, loaded: true, paused: false, input: {clear() {}},
    actors: {equipmentReady: () => ready, ensureEquipment: async () => {}, flameReady: () => true, ensureFlame: async () => {}, views: new Map()},
  };
  // Wired exactly as run-views.js does it: the Ember card hands over to the legacy flamethrower's own Equip while that is up.
  const flameView = createFlameView(state, f.p);
  const view = createBossEquipmentView(state, f.p.dispatchBossEquipment, () => flameView.equip());
  view.update();
  ready = true;
  return {f, g, view, restore: () => { view.dispose(); flameView.dispose(); globalThis.document = previous; }};
}

test('Ember Projector collected while the legacy flamethrower is equipped raises the Ember Projector and lowers nothing silently', async () => {
  const ctx = stage({legacyFlame: true});
  try {
    const {g} = ctx;
    const [candidate] = ctx.view.interaction();
    assert.equal(candidate.label, 'Collect Ember Projector');
    assert.equal(g.flame.equipped, true, 'the legacy flamethrower is up when the Ember Projector is collected');
    assert(candidate.run());
    await flush();
    assert.equal(g.bossEquipment.emberProjector.status, 'owned');
    assert.equal(g.bossEquipment.emberProjector.selected, true, 'the Ember Projector is the active weapon');
    assert.equal(g.flame.equipped, true, 'a flamethrower is still in hand (the Ember Projector); the player is not left unarmed');
    assert.deepEqual(g.events.filter(e => e.type === 'auto-equip').map(e => e.itemId), [profiles.emberProjector.itemId]);
    // The selection is in the durable record.
    const cold = fixture({areaId: profiles.emberProjector.source.areaId, extraWorld: {bossEquipmentData: profiles}, records: ctx.f.records});
    cold.restore();
    assert.equal(cold.g.bossEquipment.emberProjector.status, 'owned');
    assert.equal(cold.g.bossEquipment.emberProjector.selected, true);
  } finally {
    ctx.restore();
  }
});

test('Ember Projector collected with nothing else up is raised too (keyboard run)', async () => {
  const ctx = stage({legacyFlame: false});
  try {
    const {g} = ctx;
    assert(ctx.view.interaction()[0].run());
    await flush();
    assert.equal(g.bossEquipment.emberProjector.selected, true);
    assert.equal(g.events.filter(e => e.type === 'auto-equip').length, 1);
  } finally {
    ctx.restore();
  }
});

test('the manual Equip handler is still a toggle: pressing it on the selected Ember Projector lowers it (raise-only is automatic switching only)', async () => {
  const ctx = stage({legacyFlame: false});
  try {
    const {g} = ctx;
    ctx.view.interaction()[0].run();
    await flush();
    assert.equal(g.bossEquipment.emberProjector.selected, true);
    await ctx.view.equip('emberProjector');
    assert.equal(g.bossEquipment.emberProjector.selected, false);
  } finally {
    ctx.restore();
  }
});
