import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {createFlameView} from '../src/engine/flame-view.js';

// Legacy area-8 flamethrower, collected from the ground: it becomes the active weapon; the Rifle that was in hand stays carried.
// Real dispatchers and persistence; the DOM elements and the asset loader are stand-ins.
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

test('collecting the legacy flamethrower from the ground equips it and keeps the Rifle carried', async () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json', import.meta.url))).flame;
  // The ground pickup is switched on in the world data the persistence layer is built from.
  const flameData = {...fixture({areaId: raw.areaId}).world.flameData, groundPickupEnabled: true, pickupRadius: 1.3};
  const f = fixture({areaId: raw.areaId, extraWorld: {flameData}});
  f.restore();
  const g = f.g;
  // Carry the Rifle, selected.
  g.rifle = {...g.rifle, status: 'owned', rewardReceipt: g.world.rifleData.source.receiptId, magazine: 8, reserve: 16, selected: true};
  g.player.weapon = 'rifle';
  g.flameFuel = {version: 1, collected: false, fuelUnits: 0};
  g.player.pos = {...raw.position};
  const previous = globalThis.document;
  const nodes = new Map();
  const el = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  globalThis.document = {getElementById: el, createElement: () => new Element()};
  const state = {game: g, world: g.world, loaded: true, paused: false, input: {clear() {}}, updateExpedition() {}, hud: {update() {}}, actors: {flameReady: () => true, ensureFlame: async () => {}, views: new Map()}};
  const view = createFlameView(state, f.p);
  try {
    assert(view.interact(), 'the pickup is offered and claimed');
    await flush();
    assert.equal(g.flameFuel.collected, true);
    assert.equal(g.flame.equipped, true, 'the flamethrower is the active weapon');
    assert.equal(g.rifle.status, 'owned', 'the Rifle is still carried');
    assert.deepEqual(g.events.filter(e => e.type === 'auto-equip').map(e => e.itemId), [raw.pickupId]);
  } finally {
    view.dispose();
    globalThis.document = previous;
  }
});
