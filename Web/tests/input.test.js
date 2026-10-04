import test from 'node:test';
import assert from 'node:assert/strict';
import { InputState } from '../src/input.js';
test('two pointers can move and aim an attack together', () => {
  const s = new InputState();
  s.down(1, 'move', { x: 0, y: 0 });
  s.move(1, { x: 30, y: -30 });
  s.down(2, 'slash', { x: 200, y: 100 });
  s.move(2, { x: 230, y: 100 });
  const i = s.take();
  assert.deepEqual(i.actions, ['slash']);
  assert.equal(i.held[0], 'slash');
  assert.ok(i.move.x > 0 && i.move.y < 0);
  assert.deepEqual(i.aim, { x: 1, y: 0 });
});
test('guard is held once and releases even when finger ends outside', () => {
  const s = new InputState();
  s.down(1, 'guard', { x: 0, y: 0 });
  assert.equal(s.take().guardPressed, true);
  assert.equal(s.take().guardPressed, false);
  s.move(1, { x: 200, y: 100 });
  assert.equal(s.take().guard, true);
  s.up(1);
  assert.equal(s.take().guard, false);
});
test('background/menu/rotation clear held movement and queued attacks', () => {
  const s = new InputState();
  s.down(1, 'move', { x: 0, y: 0 });
  s.move(1, { x: 30, y: 0 });
  s.down(2, 'heavy', { x: 0, y: 0 });
  s.down(3, 'guard', { x: 0, y: 0 });
  s.clear();
  assert.deepEqual(s.take(), {
    move: { x: 0, y: 0 },
    aim: null,
    actions: [],
    held: [],
    guard: false,
    guardPressed: false,
    dodge: false,
  });
});
test('dodge is one press, not repeated on hold', () => {
  const s = new InputState();
  s.down(1, 'dodge', { x: 0, y: 0 });
  assert.equal(s.take().dodge, true);
  assert.equal(s.take().dodge, false);
});
test('releasing one of two guard pointers does not cancel remaining held guard', () => {
  const s = new InputState();
  s.down(1, 'guard', { x: 0, y: 0 });
  s.down(2, 'guard', { x: 0, y: 0 });
  s.up(1);
  assert.equal(s.take().guard, true);
  s.up(2);
  assert.equal(s.take().guard, false);
});
