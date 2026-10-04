import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInput } from '../src/input.js';

// EventTarget exercises dispatch/default cancellation; production-browser QA covers DOM/CSS.
class Surface extends EventTarget {
  constructor(id, parent = null) {
    super(); this.id = id; this.parent = parent; this.dataset = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {} };
  }
  closest(selectors) {
    for (let p = this; p; p = p.parent)
      if (selectors.split(',').some(s => s.trim() === `#${p.id}` ||
        (s.trim() === '[data-action]' && p.dataset.action))) return p;
    return null;
  }
  setPointerCapture() {}
}
function fixture(t) {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const body = new Surface('body'), html = new Surface('html');
  const world = new Surface('world', body), move = new Surface('move', body);
  const guard = new Surface('guard', body), slash = new Surface('slash', body);
  guard.dataset.action = 'guard'; slash.dataset.action = 'slash';
  const menu = new Surface('menu', body), resume = new Surface('resume', menu);
  const menuButton = new Surface('menu-button', body);
  const win = new EventTarget(), doc = new EventTarget();
  Object.assign(doc, { body, documentElement: html, hidden: false,
    querySelector: s => s === '#move' ? move : null,
    querySelectorAll: s => s === '[data-action]' ? [guard, slash] : [],
    getElementById: () => null });
  globalThis.document = doc; globalThis.window = win;
  t.after(() => { globalThis.document = oldDocument; globalThis.window = oldWindow; });
  let paused = false, interactions = 0;
  const input = attachInput({canvas: world, onMenu() {}, onRetry() {},
    isPaused: () => paused, onInteraction: () => interactions++});
  function touch(type, target, time, count = 0, changed = 1) {
    const e = new Event(type, {cancelable: true});
    Object.defineProperties(e, {target: {value: target}, timeStamp: {value: time},
      touches: {value: Array(count).fill({})}, changedTouches: {value: Array(changed).fill({})}});
    doc.dispatchEvent(e); return e;
  }
  function pointer(type, target, id, x, y) {
    const e = new Event(type, {cancelable: true});
    Object.assign(e, {pointerId: id, pointerType: 'touch', clientX: x, clientY: y});
    target.dispatchEvent(e);
  }
  return {doc, win, body, html, world, move, guard, slash, menu, resume, menuButton,
    touch, pointer, input, pause: v => paused = v, interactions: () => interactions};
}
test('Safari gestures and cross-control pinch cancel defaults without stopping dispatch', t => {
  const f = fixture(t); let observed = 0;
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    f.doc.addEventListener(type, () => observed++);
    const e = new Event(type, {cancelable: true}); f.doc.dispatchEvent(e);
    assert.equal(e.defaultPrevented, true);
  }
  for (const target of [f.world, f.move, f.guard, f.body, f.html])
    for (const type of ['touchstart', 'touchmove'])
      assert.equal(f.touch(type, target, 50, 2).defaultPrevented, true);
  assert.equal(observed, 3);
});
test('game double taps include HUD gaps while single taps and menu clicks stay available', t => {
  const f = fixture(t);
  assert.equal(f.touch('touchend', f.world, 100).defaultPrevented, false);
  assert.equal(f.touch('touchend', f.body, 200).defaultPrevented, true);
  assert.equal(f.touch('touchend', f.move, 600).defaultPrevented, false);
  assert.equal(f.touch('touchend', f.guard, 700).defaultPrevented, true);
  assert.equal(f.touch('touchend', f.menuButton, 720).defaultPrevented, false);
  assert.equal(f.touch('touchend', f.slash, 730).defaultPrevented, false);
  assert.equal(f.touch('touchend', f.resume, 740).defaultPrevented, false);
  f.pause(true);
  assert.equal(f.touch('touchend', f.body, 750).defaultPrevented, false);
});
test('multi-finger release and cancellation cannot become a double tap', t => {
  const f = fixture(t);
  f.touch('touchend', f.world, 100);
  f.touch('touchstart', f.move, 150, 1);
  f.touch('touchstart', f.guard, 160, 2);
  f.touch('touchend', f.guard, 170, 1);
  assert.equal(f.touch('touchend', f.move, 180).defaultPrevented, false);
  assert.equal(f.touch('touchend', f.world, 190).defaultPrevented, false);
  f.touch('touchcancel', f.world, 195);
  assert.equal(f.touch('touchend', f.world, 200).defaultPrevented, false);
});
test('pinch prevention preserves two-pointer movement, dragged guard, rapid attacks and cancel', t => {
  const f = fixture(t);
  f.pointer('pointerdown', f.move, 1, 0, 0);
  f.pointer('pointermove', f.move, 1, 30, -20);
  f.pointer('pointerdown', f.guard, 2, 100, 100);
  f.touch('touchstart', f.guard, 100, 2);
  f.pointer('pointermove', f.guard, 2, 130, 100);
  let state = f.input.take();
  assert.ok(state.move.x > 0 && state.move.y < 0);
  assert.equal(state.guardPressed, true); assert.equal(state.guard, true);
  assert.deepEqual(state.aim, {x: 1, y: 0});
  f.pointer('pointerup', f.guard, 2, 130, 100);
  for (let i = 0; i < 2; i++) {
    f.pointer('pointerdown', f.slash, 3, 100, 100);
    f.pointer('pointerup', f.slash, 3, 100, 100);
    f.touch('touchend', f.slash, 200 + 100 * i);
    assert.deepEqual(f.input.take().actions, ['slash']);
  }
  f.pointer('pointercancel', f.move, 1, 30, -20);
  state = f.input.take(); assert.deepEqual(state.move, {x: 0, y: 0});
  assert.equal(state.guard, false);
});
test('single-finger menu scrolling is not canceled and release/click unlock audio', t => {
  const f = fixture(t); f.pause(true);
  assert.equal(f.touch('touchmove', f.menu, 100, 1).defaultPrevented, false);
  const pausedBefore = f.interactions();
  for (const type of ['pointerup', 'touchend', 'click']) f.win.dispatchEvent(new Event(type));
  assert.equal(f.interactions(), pausedBefore);
  f.pause(false);
  const before = f.interactions();
  for (const type of ['pointerup', 'touchend', 'click']) f.win.dispatchEvent(new Event(type));
  assert.equal(f.interactions(), before + 3);
});

test('Shift sprint reaches the adapter and blur releases keyboard intent', t => {
  const f = fixture(t);
  for (const code of ['KeyD', 'ShiftLeft']) {
    const e = new Event('keydown', {cancelable: true}); Object.assign(e, {code, repeat: false}); f.win.dispatchEvent(e);
  }
  assert.equal(f.input.take().run, true);
  const up = new Event('keyup'); Object.assign(up, {code: 'ShiftLeft'}); f.win.dispatchEvent(up);
  assert.equal(f.input.take().run, false);
  f.win.dispatchEvent(new Event('blur')); assert.deepEqual(f.input.take().move, {x: 0, y: 0});
});
