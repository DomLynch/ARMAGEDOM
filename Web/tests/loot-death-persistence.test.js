import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,receiveHit} from '../src/combat.js';
import {createHollowEncounter} from '../src/hollow-encounter.js';
import {createRunPersistence} from '../src/engine/run-core.js';
import {validateAreaLoot,DEFAULT_LOOT_RULES} from '../src/engine/area-loot.js';
import {publicAreaRegistry} from '../src/area-registry.js';
import {encodeRun,RUN_SAVE_KEY} from '../src/engine/run-state.js';
import {travelTo} from '../src/travel.js';
import {issueSupply} from '../src/supplies.js';
const mob='east-roamer-1',gear='westminster-worn-vest-v1',drop='area-supply-v2:'+mob,v3='armagedom:area-run:v3';
// Explicit COMPONENT-fixture tuning: one existing mob,100% quantity1 worn vest.
// Public data/rates are untouched. Positions and simple world IO are controlled;
// damage/death/drop/grant/restore use actual production functions, no issued seed.
function fixture(records=new Map()){
 const rules=validateAreaLoot({version:1,tables:{'component-vest-v1':{outcomes:[{itemId:gear,quantity:1,weight:1,conditions:['vest-not-equipped']}]}},placements:{east:{[mob]:'component-vest-v1'}}},publicAreaRegistry);
 const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},lootRules:rules,lineClear:()=>true,move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),async loadArea(id,entry){this.areaId=id;return entry;}};
 const fresh=cycle=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,animalVariants:true,animalCycle:cycle,areaResidents:true,openingGroup:false,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 let g=fresh('A'),quota=false,writes=0;
 const persistence=createRunPersistence({getRun:()=>g,setRun:value=>g=value,createFreshRun:()=>fresh(g.animalCycle==='A'?'B':'A'),storage:{getItem:key=>records.get(key)??null,setItem(key,raw){if(quota)throw Error('quota');records.set(key,raw);writes++;}}});
 return {get g(){return g},world,rules,records,persistence,get writes(){return writes},quota:v=>quota=v};
}
function tick(f,input={}){stepGame(f.g,input,1/60,{dispatchPistol:f.persistence.dispatchPistol});}
async function kill(f,{failDeathSave=false}={}){
 const g=f.g;g.player.pos={...g.pistol.pickupPos};tick(f,{actions:['pickup']});assert.equal(g.pistol.collected,true);
 await travelTo(g,{areaId:'east',entryPoint:{x:0,z:0}});const victim=g.enemies.find(e=>e.placementKey===mob);assert(victim?.hp>0);
 let shots=0;
 while(victim.hp>0&&shots<6){
  g.player.pos={x:victim.pos.x,z:victim.pos.z-5};
  let waits=0;while((g.time+1e-8<g.pistol.nextFireAt||g.time<g.player.hurtUntil)&&waits++<180)tick(f);
  assert(waits<180);tick(f,{actions:['fire'],aim:{x:0,z:1}});shots++;
 }
 assert.equal(victim.hp,0);assert(g.events.some(e=>e.type==='death'&&e.actor===victim));assert.equal(g.supplies.issued.filter(k=>k===mob).length,1);
 assert.equal(g.supplies.pending[0].id,drop);assert.equal(g.supplies.pending[0].kind,gear);assert.deepEqual(g.supplies.pending[0].position,victim.pos);
 const repeated=issueSupply(g.supplies,{areaId:'east',placementKey:mob,position:victim.pos,hp:victim.hp,rules:g.lootRules,cycle:g.animalCycle});assert.equal(repeated.state,g.supplies);assert.equal(repeated.drop,null);
 if(failDeathSave){f.quota(true);assert.equal(f.persistence.persistRun(g),false);}else assert(f.persistence.persistRun(g));return victim;
}
test('actual combat death selects stamped vest; failed pickup retains raw/live state, recovery grants once and reduces damage',async()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);const victim=await kill(f,{failDeathSave:true});f.g.player.pos={...victim.pos};const before=encodeRun(f.g),raw=f.records.get(v3);assert(!JSON.parse(raw).supplies.issued.includes(mob));f.quota(true);
 f.persistence.collectNearbySupplies(f.g,{});assert.equal(encodeRun(f.g),before);assert.equal(f.records.get(v3),raw);assert.equal(f.g.vest.equipped,false);
 f.quota(false);f.persistence.collectNearbySupplies(f.g,{});assert.equal(f.g.vest.equipped,true);assert.deepEqual(JSON.parse(f.records.get(v3)).supplies.issued,[mob]);assert.deepEqual(f.g.supplies.collected,[drop]);assert.equal(f.g.supplies.pending.length,0);
 const writes=f.writes;f.persistence.collectNearbySupplies(f.g,{});assert.equal(f.writes,writes);const hp=f.g.player.hp;
 receiveHit(f.g,{amount:20,origin:{x:f.g.player.pos.x+1,z:f.g.player.pos.z},block:false,parry:false});assert.equal(hp-f.g.player.hp,18);assert(f.persistence.persistRun(f.g));assert.equal(JSON.parse(f.records.get(v3)).hp,f.g.player.hp);
 assert.equal(JSON.parse(f.records.get(v3)).vest.equipped,true);assert(!f.records.has(RUN_SAVE_KEY));
});
test('pending real death and collected source both survive reload/reentry; dead resident cannot issue a second reward',async()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);await kill(f);const pending=fixture(f.records);pending.persistence.restoreSavedRun(pending.g);
 assert.equal(pending.g.vest.equipped,false);assert.equal(pending.g.supplies.pending[0].id,drop);const roll=structuredClone(pending.g.supplies.rolls);
 await travelTo(pending.g,{areaId:'east',entryPoint:{x:0,z:0}});assert(!pending.g.enemies.some(e=>e.placementKey===mob));pending.g.player.pos={...pending.g.supplies.pending[0].position};pending.persistence.collectNearbySupplies(pending.g,{});
 assert(pending.g.vest.equipped);const raw=pending.records.get(v3);const restored=fixture(pending.records);restored.persistence.restoreSavedRun(restored.g);assert(restored.g.vest.equipped);assert.deepEqual(restored.g.supplies.rolls,roll);
 for(const areaId of ['east','westminster','east']){await travelTo(restored.g,{areaId,entryPoint:{x:0,z:0}});restored.persistence.collectNearbySupplies(restored.g,{});if(areaId==='east')assert(!restored.g.enemies.some(e=>e.placementKey===mob));}
 assert.equal(restored.records.get(v3),raw);assert.equal(restored.g.supplies.collected.filter(id=>id===drop).length,1);
});
test('failed Retry retains earned gear and dead ledger; successful fresh Retry resets one run without replaying old rewards',async()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);const victim=await kill(f);f.g.player.pos={...victim.pos};f.persistence.collectNearbySupplies(f.g,{});const prior=f.g,raw=f.records.get(v3);f.quota(true);
 assert.equal(f.persistence.retry(),false);assert.equal(f.g,prior);assert.equal(f.records.get(v3),raw);assert(f.g.vest.equipped);
 f.quota(false);assert(f.persistence.retry());assert.notEqual(f.g,prior);assert.equal(f.g.vest.equipped,false);assert.deepEqual(f.g.supplies.issued,[]);assert.deepEqual(f.g.supplies.pending,[]);assert.deepEqual(f.g.supplies.collected,[]);assert.equal(f.g.animalCycle,'B');
 const fresh=encodeRun(f.g);f.persistence.collectNearbySupplies(prior,{});assert.equal(encodeRun(f.g),fresh);assert.equal(f.persistence.persistRun(prior),false);
});
test('pilot resolver preserves all West defaults and strict legacy saves migrate without overwriting old bytes',()=>{
 const f=fixture();for(const [key,r] of Object.entries(DEFAULT_LOOT_RULES))assert.deepEqual(f.rules[key],r);
 const old=JSON.parse(encodeRun(f.g));old.version=2;old.supplies={version:1,issued:[],collected:[],pending:[]};const raw=JSON.stringify(old);f.records.set(RUN_SAVE_KEY,raw);f.persistence.restoreSavedRun(f.g);
 assert.equal(f.records.get(RUN_SAVE_KEY),raw);assert.equal(JSON.parse(f.records.get(v3)).version,3);assert.equal(f.g.vest.equipped,false);assert.equal(f.g.pistol.collected,false);assert.equal(f.g.player.hp,150);
});
test('retained pending drop from old run cannot grant or write after successful fresh Retry',async()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);const victim=await kill(f);const prior=f.g;prior.player.pos={...victim.pos};assert.equal(prior.supplies.pending[0].id,drop);
 assert(f.persistence.retry());const current=f.g,fresh=encodeRun(current),raw=f.records.get(v3),writes=f.writes,old=encodeRun(prior);
 f.persistence.collectNearbySupplies(prior,{});
 assert.equal(f.g,current);assert.equal(encodeRun(current),fresh);assert.equal(f.records.get(v3),raw);assert.equal(f.writes,writes);assert.equal(current.vest.equipped,false);
 assert.equal(encodeRun(prior),old);assert.equal(prior.supplies.pending[0].id,drop);
});
