import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/combat.js';
import {createRunPersistence} from '../src/engine/run-core.js';
import {RUN_SAVE_KEY,PISTOL_SAVE_KEY,encodeRun,encodePistol,VEST_BAG_POSITION} from '../src/engine/run-state.js';
import {issueSupply} from '../src/supplies.js';

function fixture({raw=null,legacy=null,unavailable=false}={}){
 const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},lineClear:()=>true,move:(p,d)=>({x:p.x+d.x,z:p.z+d.z})};
 const fresh=cycle=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,animalVariants:true,animalCycle:cycle});
 let run=fresh('A'),writes=0,failed=false,replacements=0;
 const records=new Map();if(raw!==null)records.set(RUN_SAVE_KEY,raw);if(legacy!==null)records.set(PISTOL_SAVE_KEY,legacy);
 const storage=unavailable?null:{getItem:key=>records.get(key)??null,setItem(key,value){if(failed)throw Error('quota');writes++;records.set(key,value);}};
 const persistence=createRunPersistence({getRun:()=>run,setRun:value=>{replacements++;run=value;},createFreshRun:()=>fresh(run.animalCycle==='B'?'A':'B'),storage});
 return {persistence,records,world,get run(){return run;},get writes(){return writes;},get replacements(){return replacements;},fail(){failed=true;},recover(){failed=false;}};
}
test('guest uses current100 codec and one cached writer; fresh Retry updates the live authority',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.run);assert.equal(f.writes,1);assert.equal(JSON.parse(f.records.get(RUN_SAVE_KEY)).version,2);
 assert(f.persistence.persistRun(f.run));assert.equal(f.writes,1);const old=f.run;assert(f.persistence.retry());assert.notEqual(f.run,old);assert.equal(f.run.world,old.world);assert.equal(f.run.animalCycle,'B');assert.equal(f.replacements,1);
 assert.equal(f.persistence.persistRun(old),false);assert(f.persistence.persistRun(f.run));assert.equal(f.writes,2);
});
test('legacy migrates through existing codec; corrupt primary never falls back or overwrites before explicit Retry',()=>{
 const seed=fixture().run;seed.pistol={...seed.pistol,collected:true,equipped:false,magazine:4,reserve:2};
 const legacy=encodePistol(seed.pistol),f=fixture({legacy});f.persistence.restoreSavedRun(f.run);assert.equal(f.run.pistol.magazine,4);assert.equal(JSON.parse(f.records.get(RUN_SAVE_KEY)).version,2);
 const bad=fixture({raw:'{bad',legacy});bad.persistence.restoreSavedRun(bad.run);assert.equal(bad.run.runSaveInvalid,true);assert.equal(bad.run.player.hp,0);assert.equal(bad.writes,0);assert.equal(bad.records.get(RUN_SAVE_KEY),'{bad');
 assert(bad.persistence.retry());assert.equal(bad.run.player.hp,150);assert.equal(bad.run.animalCycle,'B');assert.equal(bad.run.pistol.collected,false);assert.equal(bad.writes,1);
});
test('unavailable storage preserves guest notices and failed Retry identity',()=>{
 const f=fixture({unavailable:true});f.persistence.restoreSavedRun(f.run);assert(f.run.runSaveInvalid);assert.equal(f.run.player.hp,150);assert.equal(f.run.message,'Run saving unavailable. Supplies kept.');const old=f.run;assert.equal(f.persistence.retry(),false);assert.equal(f.run,old);assert.equal(f.replacements,0);
});
function supplies(f){
 const g=f.run;g.player.pos={...VEST_BAG_POSITION};g.pistol={...g.pistol,collected:true,equipped:true,magazine:6,reserve:0};
 for(const placementKey of ['westminster-roamer-1','westminster-roamer-3'])g.supplies=issueSupply(g.supplies,{placementKey,areaId:'westminster',position:VEST_BAG_POSITION,hp:0}).state;
}
test('multiple nearby claims retain order, write before award, retry exactly once and emit existing DTOs/messages',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.run);supplies(f);const g=f.run,before=encodeRun(g),ids=g.supplies.pending.map(d=>d.id);f.fail();f.persistence.collectNearbySupplies(g);assert.equal(encodeRun(g),before);assert.equal(g.events.length,0);
 f.recover();f.persistence.collectNearbySupplies(g);assert.deepEqual(g.events.map(e=>e.dropId),ids);assert.equal(g.pistol.reserve,5);assert.equal(g.message,'Scavenged 2 spare rounds.');const writes=f.writes;f.persistence.collectNearbySupplies(g);assert.equal(f.writes,writes);assert.equal(g.events.length,2);
 f.persistence.collectNearbyVest(g);assert.equal(g.vest.equipped,true);assert.equal(g.events.at(-1).actor,g.player);assert.equal(g.events.at(-1).type,'vest-pickup');assert.equal(g.messageUntil,g.time+4);
});
test('full reserves keep drop and exact notice cooldown; vest write failure leaves equipment unchanged',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.run);supplies(f);const g=f.run;g.pistol.reserve=12;const before=encodeRun(g),writes=f.writes;f.persistence.collectNearbySupplies(g);assert.equal(encodeRun(g),before);assert.equal(f.writes,writes);assert.equal(g.message,'Spare rounds full. Supply kept.');assert.equal(g.supplyNoticeUntil,g.time+4);
 f.fail();f.persistence.collectNearbyVest(g);assert.equal(g.vest.equipped,false);assert.equal(g.events.length,0);assert.equal(g.message,'Run saving unavailable. Supplies kept.');
});
test('failed fresh Retry preserves previous run and its durable record until successful recovery',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.run);const old=f.run,raw=f.records.get(RUN_SAVE_KEY);f.fail();assert.equal(f.persistence.retry(),false);assert.equal(f.run,old);assert.equal(f.records.get(RUN_SAVE_KEY),raw);f.recover();assert(f.persistence.retry());assert.equal(f.replacements,1);
});
