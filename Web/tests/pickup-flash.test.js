import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/rifle-fixture.js';
import {createRifleView} from '../src/engine/rifle-view.js';
import {createPickupFlash} from '../src/engine/pickup-flash.js';
import {validatePickupFlash} from '../src/engine/pickup-flash-data.js';
import {GAME_DATA} from '../src/engine/game-data.js';

// Dom, 28 Oct 2026 (live 308): picking up a weapon, ammo or another pickup gives a small gold flash at the screen edge, and a weapon
// that auto-equips says "Switched to <weapon>.". Rule and numbers are visual.json `pickupFlash`; text is combatText gear.equipped.
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
const node = () => {
  const classes = new Set(), vars = new Map();
  return {classes, vars, offsetWidth: 0, style: {setProperty: (k, v) => vars.set(k, v)},
    classList: {add: c => classes.add(c), remove: c => classes.delete(c)}};
};

test('the flash is data: a closed, validated visual.json row, on by default', () => {
  const d = GAME_DATA.visual.pickupFlash;
  assert(d.seconds > 0 && d.peakOpacity > 0 && d.peakOpacity <= 0.5, 'subtle');
  assert(d.events.includes('auto-equip') && d.events.includes('supply-pickup'));
  assert.throws(() => validatePickupFlash({...d, extra: 1}));
  assert.throws(() => validatePickupFlash({...d, colour: 'yellow'}));
  assert.throws(() => validatePickupFlash({...d, events: []}));
});

test('pickup events start one flash, non-pickups start none, and a flash in progress is not restarted', () => {
  const n = node();
  const flash = createPickupFlash(n, GAME_DATA.visual.pickupFlash);
  assert.equal(n.vars.get('--pickup-flash-colour'), '#e1bb65');
  assert.equal(flash.observe([{type: 'hit'}, {type: 'attack'}, {type: 'dodge'}], 0), false);
  assert(!n.classes.has('on'));
  assert.equal(flash.observe([{type: 'pickup', itemId: 'p'}, {type: 'equip', itemId: 'p'}, {type: 'supply-pickup'}], 100), true, 'one flash for one pickup');
  assert(n.classes.has('on'));
  assert.equal(flash.observe([{type: 'supply-pickup'}], 200), false, 'still fading');
  assert.equal(flash.observe([{type: 'supply-pickup'}], 100 + GAME_DATA.visual.pickupFlash.seconds * 1000 + 1), true, 'a later pickup flashes again');
  assert.equal(flash.observe([], 5000), false);
});

test('collecting the Rifle (server-style world pickup, auto-equip) says Switched to and flashes exactly once', async () => {
  const f = fixture();
  f.restore();
  assert(f.kill(), 'the rifle holder dies and drops the rifle');
  const g = f.g;
  g.pistol = {...g.pistol, collected: true, equipped: true, magazine: 4, reserve: 9};
  g.player.weapon = 'pistol';
  g.player.pos = {...g.rifle.dropPosition};
  const element = id => ({id, style: {}, addEventListener() {}, removeEventListener() {}});
  const elements = new Map(['rifle-equipment', 'rifle-equip', 'rifle-pickup', 'rifle-state'].map(id => [id, element(id)]));
  const prior = globalThis.document;
  globalThis.document = {getElementById: id => elements.get(id)};
  try {
    const state = {game: g, world: f.world, loaded: true, paused: false, input: {clear() {}}, actors: {rifleReady: () => true, ensureRifle: async () => {}}};
    const view = createRifleView(state, f.p.dispatchRifle);
    const n = node();
    const flash = createPickupFlash(n, GAME_DATA.visual.pickupFlash);
    // Frames before the pickup: nothing happens.
    assert.equal(flash.observe(g.events.slice(), 0), false);
    view.interaction().run();
    await flush();
    assert.equal(g.message, 'Switched to Bridge Rifle.');
    let fired = 0;
    // The loop hands each step's events to the flash; the same events across two steps is still one pickup.
    fired += flash.observe(g.events.slice(), 1000) ? 1 : 0;
    fired += flash.observe(g.events.slice(), 1016) ? 1 : 0;
    assert.equal(fired, 1);
    view.dispose();
  } finally {
    globalThis.document = prior;
  }
});
