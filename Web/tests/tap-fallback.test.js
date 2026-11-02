import test from 'node:test';
import assert from 'node:assert/strict';
import {installTapFallback} from '../src/engine/tap-fallback.js';

// A fake button: closest() answers for itself and for the pad/action selectors the way the real DOM would.
const button = (id, { excluded = false } = {}) => {
  const b = {id, disabled: false, isConnected: true, clicked: 0, click() { this.clicked++; }, closest(selector) { return selector === 'button' ? this : excluded && selector.includes('data-action') ? this : null; }};
  return b;
};
function rig() {
  const doc = new EventTarget(), timers = [];
  const remove = installTapFallback({target: doc, setTimer: (fn) => timers.push(fn)});
  const fire = (type, target, extra = {}) => {
    const event = new Event(type);
    Object.defineProperty(event, 'target', {value: target});
    Object.assign(event, {pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100}, extra);
    doc.dispatchEvent(event);
  };
  return {doc, timers, remove, fire, flush: () => timers.splice(0).forEach((fn) => fn())};
}
const pad = {closest: () => null}; // the move pad: not a button

test('a clean tap made while another finger is down gets a click when the browser sends none', () => {
  const r = rig(), tile = button('tile');
  r.fire('pointerdown', pad, {pointerId: 1});
  r.fire('pointerdown', tile, {pointerId: 2});
  r.fire('pointerup', tile, {pointerId: 2});
  assert.equal(tile.clicked, 0, 'not at once: the browser gets its grace period');
  r.flush();
  assert.equal(tile.clicked, 1);
});

test('a browser that does send the click is left alone: one click, never two', () => {
  const r = rig(), tile = button('tile');
  r.fire('pointerdown', pad, {pointerId: 1});
  r.fire('pointerdown', tile, {pointerId: 2});
  r.fire('pointerup', tile, {pointerId: 2});
  r.fire('click', tile, {pointerType: undefined});
  r.flush();
  assert.equal(tile.clicked, 0, 'the fallback did nothing; the browser click is the one click');
});

test('a single finger is never touched (the browser clicks it itself)', () => {
  const r = rig(), tile = button('tile');
  r.fire('pointerdown', tile, {pointerId: 1});
  r.fire('pointerup', tile, {pointerId: 1});
  r.flush();
  assert.equal(tile.clicked, 0);
});

test('a drag, a cancel, a lift off the button, the pad and the action buttons are not taps', () => {
  const r = rig(), tile = button('tile'), other = button('other'), act = button('slash', {excluded: true});
  r.fire('pointerdown', pad, {pointerId: 1});
  r.fire('pointerdown', tile, {pointerId: 2});
  r.fire('pointermove', tile, {pointerId: 2, clientX: 125});
  r.fire('pointerup', tile, {pointerId: 2});
  r.fire('pointerdown', tile, {pointerId: 3});
  r.fire('pointercancel', tile, {pointerId: 3});
  r.fire('pointerdown', tile, {pointerId: 4});
  r.fire('pointerup', other, {pointerId: 4});
  r.fire('pointerdown', act, {pointerId: 5});
  r.fire('pointerup', act, {pointerId: 5});
  r.fire('pointerdown', pad, {pointerId: 6});
  r.fire('pointerup', pad, {pointerId: 6});
  r.flush();
  assert.deepEqual([tile.clicked, other.clicked, act.clicked], [0, 0, 0]);
});

test('a button that was disabled or removed in the meantime is not clicked; mouse pointers are ignored', () => {
  const r = rig(), a = button('a'), b = button('b'), m = button('m');
  r.fire('pointerdown', pad, {pointerId: 1});
  r.fire('pointerdown', a, {pointerId: 2});
  r.fire('pointerup', a, {pointerId: 2});
  r.fire('pointerdown', b, {pointerId: 3});
  r.fire('pointerup', b, {pointerId: 3});
  a.disabled = true;
  b.isConnected = false;
  r.fire('pointerdown', m, {pointerId: 9, pointerType: 'mouse'});
  r.fire('pointerup', m, {pointerId: 9, pointerType: 'mouse'});
  r.flush();
  assert.deepEqual([a.clicked, b.clicked, m.clicked], [0, 0, 0]);
});

test('after every contact is cancelled the next lone tap is not mistaken for a secondary one; remove() detaches everything', () => {
  const r = rig(), tile = button('tile');
  r.fire('pointerdown', pad, {pointerId: 1});
  r.fire('touchcancel', pad);
  r.fire('pointerdown', tile, {pointerId: 2});
  r.fire('pointerup', tile, {pointerId: 2});
  r.flush();
  assert.equal(tile.clicked, 0);
  r.fire('pointerdown', pad, {pointerId: 3});
  r.remove();
  r.fire('pointerdown', tile, {pointerId: 4});
  r.fire('pointerup', tile, {pointerId: 4});
  r.flush();
  assert.equal(tile.clicked, 0, 'detached');
});
