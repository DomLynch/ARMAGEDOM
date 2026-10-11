import test from 'node:test';import assert from 'node:assert/strict';
import {createSession} from '../src/engine/server.js';
import {assertSession} from '../src/engine/contracts.js';
const world={areaId:'westminster',move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
test('renderer-free session preserves fixed stepping, input, pause, retry and immutable snapshots',()=>{
 assert.equal(typeof globalThis.document,'undefined');const session=createSession({world,pilot:{pilot:"donor-knife"}});assertSession(session);assert.throws(()=>session.step(.1),/not started/);session.start();const before=session.state();assert(Object.isFrozen(before.player.pos));assert.throws(()=>before.player.hp=1,TypeError);session.input({move:{x:1,z:0}});session.step(1/120);assert.equal(session.state().time,0);session.step(1/120);assert(Math.abs(session.state().time-1/60)<1e-9);assert(session.state().player.pos.x>before.player.pos.x);session.pause(true);session.step(.1);assert(Math.abs(session.state().time-1/60)<1e-9);session.pause(false);session.step(1/60);assert(Math.abs(session.state().time-2/60)<1e-9);const retry=session.retry();assert.equal(retry.time,0);assert.equal(retry.player.hp,before.player.hp);session.dispose();assert.throws(()=>session.start(),/disposed/);assert.throws(()=>session.step(1/60),/disposed/);
});
test('event listeners receive immutable real domain outcomes and unsubscribe',()=>{
 const session=createSession({world,pilot:{pilot:"donor-knife"}});session.start();const events=[],off=session.events(e=>events.push(e));session.input({actions:['slash']});session.step(1/60);assert(events.some(e=>e.type==='attack'));assert(events.every(Object.isFrozen));off();const count=events.length;for(let i=0;i<80;i++)session.step(1/60);assert.equal(events.length,count);session.dispose();
});
