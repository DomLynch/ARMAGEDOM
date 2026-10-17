import test from 'node:test';
import assert from 'node:assert/strict';
import { InputState } from '../src/input.js';
test('a ready crossing preserves held movement but releases attacks and guard; failure clears everything',()=>{
 const s=new InputState();s.down(1,'move',{x:20,y:20});s.move(1,{x:100,y:0});s.down(2,'slash',{x:200,y:50});s.down(3,'guard',{x:300,y:50});s.keys.add('KeyW');s.keys.add('ShiftLeft');
 const before=s.take();s.clear({keepMovement:true});const after=s.take();assert.deepEqual(after.move,before.move);assert.equal(after.moveHeld,true);assert.equal(after.run,true);assert.equal(after.guard,false);assert.deepEqual(after.actions,[]);assert.deepEqual(after.held,[]);s.keys.delete('KeyW');s.move(1,{x:20,y:100});assert(s.take().move.y>0,'same pointer continues steering after keyboard release');s.clear();assert.equal(s.take().moveHeld,false);assert.deepEqual(s.take().move,{x:0,y:0});
});
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
    moveHeld: false,
    run: false,
    aim: null,
    fireAim: null,
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

test('flame Fire explicitly permits dragging without changing legacy pistol Fire or creating extra shots',()=>{const f=new InputState();f.down(1,'fire',{x:100,y:100},{aimable:true});f.move(1,{x:130,y:100});const a=f.take();assert.deepEqual(a.fireAim,{x:1,y:0});assert.deepEqual(a.actions,['fire']);assert.deepEqual(f.take().actions,[]);assert.deepEqual(f.take().held,['fire']);f.up(1);assert.equal(f.take().fireAim,null);const p=new InputState();p.down(1,'fire',{x:100,y:100});p.move(1,{x:130,y:100});assert.equal(p.take().fireAim,null);});
