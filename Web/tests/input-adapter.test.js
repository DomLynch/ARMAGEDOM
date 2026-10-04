import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInput } from '../src/input.js';

// Node supplies real EventTarget dispatch; only the DOM surface is substituted.
class Element extends EventTarget {
  constructor() {
    super();
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
    this.style = new Map();
    this.style.setProperty = this.style.set.bind(this.style);
    this.dataset = {};
  }
  setPointerCapture() {}
}
function send(target, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: 0, clientY: 0, pointerId: 1, ...values });
  target.dispatchEvent(event);
}
function setup(t, pistol = false) {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const window = new EventTarget(),
    document = new EventTarget();
  const elements = Object.fromEntries(
    ['move', 'slash', 'heavy', 'guard', 'dodge', 'menu', 'entry', 'ending'].map(
      (id) => [id, new Element()],
    ),
  );
  document.body = new Element();
  document.hidden = false;
  elements.entry.hidden = true;
  elements.ending.hidden = true;
  elements.menu.open = false;
  for (const id of ['slash', 'heavy', 'guard', 'dodge'])
    elements[id].dataset.action = id;
  document.getElementById = (id) => elements[id];
  document.querySelector = (selector) => elements[selector.slice(1)];
  document.querySelectorAll = (selector) =>
    selector === '[data-action]'
      ? ['slash', 'heavy', 'guard', 'dodge'].map((id) => elements[id])
      : Object.values(elements).filter((el) =>
          el.classList.contains('pressed'),
        );
  globalThis.window = window;
  globalThis.document = document;
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  const env = {
    window,
    document,
    elements,
    canvas: new Element(),
    paused: false,
    retries: 0,
    menus: 0,
  };
  env.input = attachInput({
    canvas: env.canvas,
    isPistol: () => pistol,
    isPaused: () => env.paused,
    onRetry: () => env.retries++,
    onMenu: () => env.menus++,
  });
  return env;
}

for (const ending of ['pointercancel', 'lostpointercapture']) {
  test(`${ending} discards only the cancelled action's unconsumed press`, (t) => {
    const { elements: e, input } = setup(t);
    send(e.heavy, 'pointerdown', { pointerId: 1 });
    send(e.slash, 'pointerdown', { pointerId: 2 });
    send(e.heavy, ending, { pointerId: 1 });
    assert.deepEqual(input.take().actions, ['slash']);
    assert.equal(e.heavy.classList.contains('pressed'), false);
    assert.equal(e.slash.classList.contains('pressed'), true);
  });
}
test('quick released tap survives normal automatic lost capture exactly once', (t) => {
  const { elements: e, input } = setup(t);
  send(e.heavy, 'pointerdown');
  send(e.heavy, 'pointerup', { clientX: -100 });
  send(e.heavy, 'lostpointercapture');
  assert.deepEqual(input.take().actions, ['heavy']);
  assert.deepEqual(input.take().actions, []);
});
for (const action of ['guard', 'dodge']) {
  test(`cancelled ${action} cannot emit a fresh press on the next frame`, (t) => {
    const { elements: e, input } = setup(t);
    send(e[action], 'pointerdown');
    send(e[action], 'pointercancel');
    const value = input.take();
    assert.equal(value.guard, false);
    assert.equal(value.guardPressed, false);
    assert.equal(value.dodge, false);
  });
}
test('cancel does not clear independent movement or a second guard hold', (t) => {
  const { elements: e, input } = setup(t);
  send(e.move, 'pointerdown', { pointerId: 1 });
  send(e.move, 'pointermove', { pointerId: 1, clientX: 30 });
  send(e.guard, 'pointerdown', { pointerId: 2 });
  input.take();
  send(e.guard, 'pointerdown', { pointerId: 3 });
  send(e.guard, 'pointercancel', { pointerId: 3 });
  const value = input.take();
  assert.ok(value.move.x > 0);
  assert.equal(value.guard, true);
  assert.equal(value.guardPressed, false);
});
test('released drag cannot steer a later tap', (t) => {
  const { elements: e, input } = setup(t);
  send(e.slash, 'pointerdown');
  send(e.slash, 'pointermove', { clientX: 30 });
  assert.deepEqual(input.take().aim, { x: 1, y: 0 });
  send(e.slash, 'pointerup');
  send(e.heavy, 'pointerdown', { pointerId: 2 });
  assert.equal(input.take().aim, null);
});
test('releasing latest aim pointer restores another live aimed guard', (t) => {
  const { elements: e, input } = setup(t);
  send(e.guard, 'pointerdown', { pointerId: 1 });
  send(e.guard, 'pointermove', { pointerId: 1, clientY: 30 });
  send(e.slash, 'pointerdown', { pointerId: 2 });
  send(e.slash, 'pointermove', { pointerId: 2, clientX: 30 });
  assert.deepEqual(input.take().aim, { x: 1, y: 0 });
  send(e.slash, 'pointercancel', { pointerId: 2 });
  assert.deepEqual(input.take().aim, { x: 0, y: 1 });
});
test('canvas cancellation cannot queue a mouse attack', (t) => {
  const { canvas, input } = setup(t);
  send(canvas, 'pointerdown', { pointerType: 'mouse', button: 2 });
  send(canvas, 'pointercancel');
  assert.deepEqual(input.take().actions, []);
});
test('R is blocked during pause, menu, loading and hidden document', (t) => {
  const env = setup(t);
  env.paused = true;
  send(env.window, 'keydown', { code: 'KeyR' });
  env.paused = false;
  env.elements.menu.open = true;
  send(env.window, 'keydown', { code: 'KeyR' });
  env.elements.menu.open = false;
  env.elements.entry.hidden = false;
  send(env.window, 'keydown', { code: 'KeyR' });
  env.elements.entry.hidden = true;
  env.document.hidden = true;
  send(env.window, 'keydown', { code: 'KeyR' });
  assert.equal(env.retries, 0);
});
test('R retries active play and death once per fresh press', (t) => {
  const env = setup(t);
  send(env.window, 'keydown', { code: 'KeyR' });
  send(env.window, 'keydown', { code: 'KeyR', repeat: true });
  env.paused = true; // main includes finished in its pause predicate.
  env.elements.ending.hidden = false;
  send(env.window, 'keydown', { code: 'KeyR' });
  assert.equal(env.retries, 2);
});
test('Escape repeat does not repeatedly toggle the menu', (t) => {
  const env = setup(t);
  send(env.window, 'keydown', { code: 'Escape' });
  send(env.window, 'keydown', { code: 'Escape', repeat: true });
  assert.equal(env.menus, 1);
});
test('blur and visibility handlers clear held and queued intent', (t) => {
  const env = setup(t);
  for (const [target, type] of [
    [env.window, 'blur'],
    [env.document, 'visibilitychange'],
  ]) {
    send(env.elements.heavy, 'pointerdown');
    send(env.elements.guard, 'pointerdown', { pointerId: 2 });
    send(target, type);
    const value = env.input.take();
    assert.deepEqual(value.actions, []);
    assert.equal(value.guard, false);
    assert.equal(value.guardPressed, false);
  }
});
test('cancelling a reused pointer ID preserves its earlier completed quick tap', (t) => {
  const { elements: e, input } = setup(t);
  send(e.slash, 'pointerdown');
  send(e.slash, 'pointerup');
  send(e.heavy, 'pointerdown');
  send(e.heavy, 'pointercancel');
  assert.deepEqual(input.take().actions, ['slash']);
});

for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`second movement touch cannot steal steering or stop the owner on ${ending}`, (t) => {
    const { elements: e, input } = setup(t);
    send(e.move, 'pointerdown', { pointerId: 1 });
    send(e.move, 'pointermove', { pointerId: 1, clientX: 46 });
    send(e.move, 'pointerdown', { pointerId: 2 });
    send(e.move, 'pointermove', { pointerId: 2, clientX: -46 });
    assert.deepEqual(input.take().move, { x: 1, y: 0 });
    send(e.move, ending, { pointerId: 2 });
    assert.deepEqual(input.take().move, { x: 1, y: 0 });
    assert.equal(e.move.style.get('--knob-x'), '36px');
    assert.equal(e.move.classList.contains('pressed'), true);
    send(e.move, 'pointercancel', { pointerId: 1 });
    assert.deepEqual(input.take().move, { x: 0, y: 0 });
    assert.equal(e.move.style.get('--knob-x'), '0px');
    assert.equal(e.move.classList.contains('pressed'), false);
    send(e.move, 'pointerdown', { pointerId: 3 });
    send(e.move, 'pointermove', { pointerId: 3, clientY: -46 });
    assert.deepEqual(input.take().move, { x: 0, y: -1 });
  });
}

test('pistol touch button taps once and holds Fire without an aiming drag', t=>{
 const {elements:e,input}=setup(t,true);send(e.slash,'pointerdown');send(e.slash,'pointerup');
 let i=input.take();assert.deepEqual(i.actions,['fire']);assert.deepEqual(i.held,[]);assert.equal(i.aim,null);
 assert.deepEqual(input.take().actions,[]);send(e.slash,'pointerdown',{pointerId:2});
 i=input.take();assert.deepEqual(i.held,['fire']);assert.equal(i.aim,null);
 send(e.slash,'pointercancel',{pointerId:2});assert.deepEqual(input.take().held,[]);
});
test('Fire release/cancel clears stale arrow and another Fire pointer cannot replace it', t=>{
 const {elements:e,input}=setup(t,true);send(e.slash,'pointerdown',{pointerId:1,clientX:100,clientY:100});send(e.slash,'pointermove',{pointerId:1,clientX:100,clientY:70});const angle=e.slash.style.get('--aim-angle');assert.notEqual(angle,'0rad');
 send(e.slash,'pointerdown',{pointerId:2,clientX:100,clientY:100});assert.equal(e.slash.style.get('--aim-angle'),angle);send(e.slash,'pointerup',{pointerId:2});assert.equal(e.slash.style.get('--aim-angle'),angle);
 send(e.slash,'pointercancel',{pointerId:1});assert.equal(e.slash.style.get('--aim-angle'),'0rad');assert.equal(input.take().fireAim,null);send(e.slash,'pointerdown',{pointerId:3});assert.equal(e.slash.style.get('--aim-angle'),'0rad');input.clear();assert.equal(e.slash.style.get('--aim-angle'),'0rad');
});
