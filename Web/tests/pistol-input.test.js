import test from 'node:test';
import assert from 'node:assert/strict';
import {InputState} from '../src/input.js';
test('touch Fire tap queues one shot; held Fire needs no aiming drag',()=>{
 const s=new InputState();s.down(2,'fire',{x:200,y:100});assert.deepEqual(s.take().actions,['fire']);assert.deepEqual(s.take().held,['fire']);
 s.move(2,{x:208,y:104});assert.deepEqual(s.take().held,['fire']);s.up(2);assert.deepEqual(s.take().actions,[]);assert.deepEqual(s.take().actions,[]);
});
test('deliberate right-thumb drag fires along explicit aim while left thumb moves',()=>{
 const s=new InputState();s.down(1,'move',{x:0,y:0});s.move(1,{x:30,y:0});s.down(2,'fire',{x:200,y:100});s.move(2,{x:200,y:70});const i=s.take();
 assert.ok(i.move.x>0);assert.deepEqual(i.aim,{x:0,y:-1});assert.deepEqual(i.actions,['fire']);assert.deepEqual(i.held,['fire']);s.up(2);assert.deepEqual(s.take().held,[]);assert.deepEqual(s.take().actions,[]);
});
test('cancelled Fire clears unconsumed tap and release never adds a shot',()=>{
 const s=new InputState();s.down(2,'fire',{x:0,y:0});s.cancel(2);assert.deepEqual(s.take().actions,[]);
 s.down(2,'fire',{x:0,y:0});s.move(2,{x:20,y:0});s.clear();assert.deepEqual(s.take().held,[]);assert.equal(s.take().aim,null);
});
test('desktop Fire press/hold/release retains immediate mouse aiming parity',()=>{
 const s=new InputState();s.down(2,'fire',{x:0,y:0});assert.deepEqual(s.take().actions,['fire']);assert.deepEqual(s.take().held,['fire']);s.up(2);assert.deepEqual(s.take().actions,[]);assert.deepEqual(s.take().held,[]);
});

test('second Fire contact cannot steal the existing aim or cancel its ownership',()=>{
 const s=new InputState();s.down(1,'fire',{x:0,y:0});s.move(1,{x:20,y:0});s.down(2,'fire',{x:0,y:0});s.move(2,{x:0,y:-30});s.up(2);assert.deepEqual(s.take().aim,{x:1,y:0});assert.deepEqual(s.take().held,['fire']);
});
