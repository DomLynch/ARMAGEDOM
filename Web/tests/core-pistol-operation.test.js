import test from 'node:test';
import assert from 'node:assert/strict';
import {createPistolOperation,PISTOL_ITEM_ID as id} from '../src/core/pistol-operation.js';
import {createPistolState,collectPistol,equipPistol,PISTOL_RULES} from '../src/pistol.js';
import {createRunOperation} from '../src/core/run-operation.js';

function setup(){
 let run={time:1,player:{hp:150,pos:{x:0,z:0},weapon:'knife',hurtUntil:0,dodgeUntil:0},
  world:{areaId:'westminster'},pistol:createPistolState({pickupPos:{x:0,z:0}})};
 let allowed=true,writeOK=true;const writes=[];
 const operation=createPistolOperation({getRun:()=>run,collectPistol,equipPistol,
  canAct:g=>allowed&&g.player.hp>0&&!g.player.swing&&g.time>=g.player.hurtUntil&&g.time>=g.player.dodgeUntil});
 const context={writeRun:candidate=>{
  assert.notEqual(candidate,run);assert.notEqual(candidate.player,run.player);
  assert.notEqual(candidate.pistol,run.pistol);writes.push(candidate);return writeOK;
 }};
 return {operation,context,writes,get run(){return run;},replace:g=>{run=g;},
  block:()=>{allowed=false;},fail:()=>{writeOK=false;},recover:()=>{writeOK=true;}};
}
const claim={type:'claimPickup',pickupId:id};
const equip=equipped=>({type:'equip',itemId:id,equipped});
test('failed pickup preserves ownership, ammo, equipment and original identity; recovery commits once',()=>{
 const s=setup(),original=s.run.pistol,player=s.run.player;s.fail();
 assert.equal(s.operation(claim,s.context).code,'storage-unavailable');
 assert.equal(s.run.pistol,original);assert.equal(s.run.player,player);assert.equal(player.weapon,'knife');
 assert.equal(original.collected,false);assert.equal(original.magazine,0);assert.equal(original.reserve,0);
 s.recover();const result=s.operation(claim,s.context);
 assert.deepEqual(result.events.map(e=>e.type),['pickup','equip']);
 assert.equal(s.run.pistol,s.writes.at(-1).pistol);assert.equal(s.run.pistol.magazine,PISTOL_RULES.capacity);
 assert.equal(s.run.pistol.reserve,PISTOL_RULES.reserve);assert.equal(player.weapon,'pistol');
 const count=s.writes.length;s.run.pistol.magazine=3;
 assert.equal(s.operation(claim,s.context).code,'already-collected');
 assert.equal(s.writes.length,count);assert.equal(s.run.pistol.magazine,3);
});
test('failed holster preserves reload and weapon; successful holster cancels reload after commit',()=>{
 const s=setup();s.operation(claim,s.context);s.run.pistol.reloadingUntil=4;
 const original=s.run.pistol;s.fail();
 assert.equal(s.operation(equip(false),s.context).code,'storage-unavailable');
 assert.equal(s.run.pistol,original);assert.equal(s.run.player.weapon,'pistol');assert.equal(original.reloadingUntil,4);
 s.recover();const result=s.operation(equip(false),s.context);
 assert.deepEqual(result.events.map(e=>e.type),['reload-cancel','holster']);
 assert.equal(s.run.pistol.reloadingUntil,0);assert.equal(s.run.player.weapon,'knife');
 const count=s.writes.length;assert.deepEqual(s.operation(equip(false),s.context),{ok:true,changed:false,events:[]});
 assert.equal(s.writes.length,count);assert.equal(s.operation(equip(true),s.context).events[0].type,'equip');
});
test('unknown ids, malformed equip, unowned pistol and unrelated commands cannot award or write',()=>{
 const s=setup();for(const command of [null,{type:'grant'}, {...claim,pickupId:'pistol'},
  {...equip(true),itemId:'vest'}, {...equip(true),equipped:1}])
  assert.equal(s.operation(command,s.context).code,'invalid-command');
 assert.equal(s.operation(equip(false),s.context).code,'not-eligible');assert.equal(s.writes.length,0);
 assert.throws(()=>createPistolOperation({}),/Missing pistol domain dependency/);
});
test('existing range and area rules plus actual action restrictions reject without writes',()=>{
 for(const change of [g=>{g.world.areaId='east';},g=>{g.player.pos.x=PISTOL_RULES.pickupRadius+.01;},
  g=>{g.player.hp=0;},g=>{g.finished=true;},g=>{g.runSaveInvalid=true;},
  g=>{g.player.swing={};},g=>{g.player.hurtUntil=2;},g=>{g.player.dodgeUntil=2;}]){
  const s=setup();change(s.run);assert.equal(s.operation(claim,s.context).code,'not-eligible');assert.equal(s.writes.length,0);
 }
 const blocked=setup();blocked.block();assert.equal(blocked.operation(claim,blocked.context).ok,false);
 assert.equal(blocked.writes.length,0);
 const edge=setup();edge.run.player.pos.x=PISTOL_RULES.pickupRadius;
 assert.equal(edge.operation(claim,edge.context).ok,true);
});
test('run operation delegates equip; current-run pointer remains authoritative after replacement',()=>{
 const s=setup(),old=s.run;const replacement=structuredClone(old);replacement.pistol.collected=true;
 s.replace(replacement);
 const execute=createRunOperation({getRun:()=>s.run,setRun:()=>{},createFreshRun:()=>{},
  applySavedRun:()=>{},claimPickup:s.operation,equip:s.operation});
 assert.equal(execute(equip(true),s.context).ok,true);assert.equal(replacement.pistol.equipped,true);
 assert.equal(old.pistol.equipped,false);assert.equal(old.player.weapon,'knife');
});
