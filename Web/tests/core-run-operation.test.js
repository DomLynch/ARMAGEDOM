import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunOperation} from '../src/core/run-operation.js';

function setup(){
 let run={hp:73,animalCycle:'A'},writes=[],applied=0,replacements=0;
 const previous=run,candidate={hp:150,animalCycle:'B'};
 let writeOK=true,saved={hp:42},claims=0;
 const context={writeRun:g=>{writes.push(g);return writeOK;},readRun:()=>saved};
 const execute=createRunOperation({getRun:()=>run,setRun:g=>{assert.equal(writes.at(-1),g);replacements++;run=g;},
  createFreshRun:()=>candidate,applySavedRun:(g,s)=>{applied++;Object.assign(g,s);},
  claimPickup:(command,ctx)=>{assert.equal(ctx,context);claims++;return {ok:false,code:'already-collected',events:[]};}});
 return {execute,context,previous,candidate,writes,get run(){return run;},get applied(){return applied;},
  get replacements(){return replacements;},get claims(){return claims;},fail:()=>{writeOK=false;},
  recover:()=>{writeOK=true;},badRead:()=>{saved=null;}};
}
test('save writes current authority without mutation or events, including after Retry',()=>{
 const s=setup();assert.deepEqual(s.execute({type:'save'},s.context),{ok:true,changed:false,events:[]});
 assert.equal(s.writes[0],s.previous);s.execute({type:'retry'},s.context);s.execute({type:'save'},s.context);
 assert.equal(s.writes.at(-1),s.candidate);
});
test('failed save preserves authority and emits no success; invalid run is never written',()=>{
 const s=setup();s.fail();assert.equal(s.execute({type:'save'},s.context).code,'storage-unavailable');
 assert.equal(s.run,s.previous);s.previous.runSaveInvalid=true;s.writes.length=0;
 assert.equal(s.execute({type:'save'},s.context).code,'invalid-save');assert.equal(s.writes.length,0);
});
test('Restore applies only a validated read and never writes',()=>{
 const s=setup();s.badRead();assert.equal(s.execute({type:'restore'},s.context).ok,false);
 assert.equal(s.applied,0);assert.equal(s.previous.hp,73);assert.equal(s.writes.length,0);
 const good=setup();assert.equal(good.execute({type:'restore'},good.context).changed,true);
 assert.equal(good.run,good.previous);assert.equal(good.run.hp,42);assert.equal(good.applied,1);assert.equal(good.writes.length,0);
});
test('failed Retry retains old run; retrying the write replaces it only after success',()=>{
 const s=setup();s.fail();assert.equal(s.execute({type:'retry'},s.context).ok,false);
 assert.equal(s.run,s.previous);assert.equal(s.replacements,0);assert.equal(s.previous.animalCycle,'A');
 s.recover();assert.deepEqual(s.execute({type:'retry'},s.context),{ok:true,changed:true,events:[]});
 assert.equal(s.run,s.candidate);assert.equal(s.replacements,1);assert.equal(s.previous.hp,73);
});
test('selected pickup delegates command/context without a second award or save',()=>{
 const s=setup();assert.equal(s.execute({type:'claimPickup',pickupId:'supply:1'},s.context).code,'already-collected');
 assert.equal(s.claims,1);assert.equal(s.writes.length,0);assert.equal(s.applied,0);assert.equal(s.replacements,0);
});
test('unsupported commands and missing dependencies fail closed',()=>{
 const s=setup();for(const command of [{type:'equip',itemId:'vest',equipped:false},{type:'grant'},null])
  assert.equal(s.execute(command,s.context).code,'invalid-command');
 assert.equal(s.writes.length,0);assert.throws(()=>createRunOperation({}),/Missing run domain dependency/);
});
test('Retry rejects a missing or reused candidate without writes',()=>{
 const run={hp:73};for(const candidate of [null,run]){
  let writes=0,replacements=0;
  const execute=createRunOperation({getRun:()=>run,setRun:()=>replacements++,createFreshRun:()=>candidate,
   applySavedRun:()=>{},claimPickup:()=>{}});
  assert.equal(execute({type:'retry'},{writeRun:()=>{writes++;return true;}}).code,'not-eligible');
  assert.equal(writes,0);assert.equal(replacements,0);
 }
});
