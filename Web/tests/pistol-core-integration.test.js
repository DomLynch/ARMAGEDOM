import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame} from '../src/combat.js';
import {createRunPersistence} from '../src/engine/run-core.js';
import {RUN_SAVE_KEY,encodeRun} from '../src/engine/run-state.js';
import {PISTOL_ITEM_ID} from '../src/core/pistol-operation.js';
function setup(){
 const world={areaId:'westminster',spawn:{x:-.85,z:-6.15},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
 const fresh=()=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true});
 let g=fresh(),fail=false;const writes=[];
 const io=createRunPersistence({getRun:()=>g,setRun:next=>{g=next;},createFreshRun:fresh,storage:{getItem:()=>null,setItem(key,raw){assert.equal(key,RUN_SAVE_KEY);if(fail)throw Error('quota');writes.push(raw);}}});
 return {get g(){return g;},io,writes,fail:()=>{fail=true;},recover:()=>{fail=false;},tick(intent={}){stepGame(g,intent,1/60,{dispatchPistol:io.dispatchPistol});}};
}
test('actual combat pickup is durable before award, denied write emits no award, recovery awards exactly once',()=>{
 const s=setup();s.fail();s.tick({actions:['pickup'],held:['fire']});
 assert.equal(s.g.pistol.collected,false);assert.equal(s.g.player.weapon,'knife');assert.equal(s.g.pistol.magazine,0);
 assert.ok(!s.g.events.some(e=>['pickup','equip','shot'].includes(e.type)));assert.equal(s.writes.length,0);
 s.recover();s.tick({actions:['pickup'],held:['fire']});
 assert.deepEqual(s.g.events.filter(e=>['pickup','equip','shot'].includes(e.type)).map(e=>e.type),['pickup','equip']);
 assert.equal(s.g.pistol.magazine,6);assert.equal(s.writes.length,1);assert.equal(JSON.parse(s.writes[0]).pistol.collected,true);
 s.tick({actions:['pickup']});assert.equal(s.writes.length,1);assert.ok(!s.g.events.some(e=>e.type==='pickup'));
});
test('eligible holster failure preserves reload and blocks simultaneous fire; success cancels then holsters once',()=>{
 const s=setup();s.tick({actions:['pickup']});s.g.pistol.magazine=3;s.g.pistol.reloadingUntil=4;
 const before={...s.g.pistol};s.fail();s.tick({actions:['heavy','stab'],held:['fire']});
 assert.deepEqual(s.g.pistol,before);assert.equal(s.g.player.weapon,'pistol');
 assert.ok(!s.g.events.some(e=>['shot','reload-cancel','holster'].includes(e.type)));
 s.recover();s.tick({actions:['heavy'],held:['fire']});
 assert.deepEqual(s.g.events.filter(e=>['reload-cancel','holster','shot'].includes(e.type)).map(e=>e.type),['reload-cancel','holster']);
 assert.equal(s.g.pistol.magazine,3);assert.equal(s.g.pistol.reloadingUntil,0);assert.equal(s.g.player.weapon,'knife');
 s.tick({actions:['pickup']});assert.equal(s.g.player.weapon,'pistol');assert.equal(s.g.pistol.magazine,3);
 assert.equal(JSON.parse(s.writes.at(-1)).pistol.equipped,true);
});
test('cancel and dodge retain early reload cancellation, and blocked pickup cannot write',()=>{
 for(const intent of [{cancel:true,actions:['heavy']},{dodge:true,actions:['heavy']}]){
  const s=setup();s.tick({actions:['pickup']});s.g.pistol.reloadingUntil=4;const count=s.writes.length;
  s.tick(intent);assert.equal(s.g.pistol.reloadingUntil,0);assert.equal(s.g.pistol.equipped,true);
  assert.equal(s.writes.length,count);assert.ok(s.g.events.some(e=>e.type==='reload-cancel'));
 }
 for(const intent of [{cancel:true,actions:['pickup']},{dodge:true,actions:['pickup']}]){
  const s=setup();s.tick(intent);assert.equal(s.g.pistol.collected,false);assert.equal(s.writes.length,0);
 }
 const s=setup();s.g.player.hurtUntil=10;s.tick({actions:['pickup']});assert.equal(s.g.pistol.collected,false);assert.equal(s.writes.length,0);
});
test('owned equipped pickup preserves legal fire and Retry rejects the previous run authority',()=>{
 const s=setup();s.tick({actions:['pickup']});s.tick({actions:['pickup','fire'],aim:{x:1,z:0}});
 assert.equal(s.g.pistol.magazine,5);assert.equal(s.g.events.filter(e=>e.type==='shot').length,1);
 const old=s.g;assert.equal(s.io.retry(),true);assert.notEqual(s.g,old);
 assert.equal(s.io.dispatchPistol(old,{type:'claimPickup',pickupId:PISTOL_ITEM_ID},true).code,'not-eligible');
 assert.equal(s.g.pistol.collected,false);s.tick({actions:['pickup']});assert.equal(s.g.pistol.collected,true);
 assert.equal(JSON.parse(encodeRun(s.g)).version,2);
});
