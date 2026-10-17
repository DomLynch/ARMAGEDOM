import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createRunOperation} from '../src/core/run-operation.js';
const {createFlameFuelModel,FLAME_PILOT_PROFILE:profile}=await import(process.env.FLAME_FUEL_STATE_URL??new URL('../src/engine/flame-fuel-state.js',import.meta.url).href);
const model=createFlameFuelModel(profile),full=()=>model.pickup(model.freshState(),profile.pickupId).state;
test('config is required; approved pilot data is finite/frozen and carries no source coordinate',()=>{
 assert.equal(profile.capacity/profile.unitsPerSecond,10);assert.equal(profile.pickupId,'flamethrower-area8-v1');assert.equal(profile.areaId,'area8');assert.deepEqual(profile.contact,{range:3,coneDegrees:40,interval:.2,damage:8,afterburnDamage:0});assert.deepEqual(profile.presentation,{emitterCapacity:1,dynamicLights:false,recoil:0});
 for(const p of[profile,profile.contact,profile.presentation])assert(Object.isFrozen(p));
 for(const config of[undefined,{}, {...profile,capacity:0},{...profile,capacity:Infinity},{...profile,unitsPerSecond:0},{...profile,unitsPerSecond:NaN},{...profile,pickupId:''}])assert.throws(()=>createFlameFuelModel(config),TypeError);
});
test('missing legacy extension safely defaults; present corrupt or inconsistent DTO never resets',()=>{
 assert.deepEqual(model.restoreState(undefined),model.freshState());
 for(const bad of[null,{}, {...full(),version:2},{...full(),fuelUnits:1000.01},{...full(),fuelUnits:-1},{...full(),fuelUnits:NaN},{...full(),fuelUnits:Infinity},{...full(),collected:false},{...full(),extra:true}])assert.equal(model.restoreState(bad),null);
 const getter={...full()};Object.defineProperty(getter,'fuelUnits',{get(){throw Error('no getter');}});assert.equal(model.valid(getter),false);
});
test('authorized source pickup once; partial/empty/reload/Retry copies cannot refill or regrant',()=>{
 assert.equal(model.pickup(model.freshState(),'other'),null);const start=model.freshState(),owned=model.pickup(start,profile.pickupId);assert.deepEqual(start,model.freshState());assert.equal(owned.remaining,1000);
 for(const state of[owned.state,model.consume(owned.state,{seconds:2,active:true}).state,model.consume(owned.state,{seconds:20,active:true}).state]){
  const restored=model.restoreState(JSON.parse(JSON.stringify(model.copy(state))));assert.deepEqual(restored,state);assert.equal(model.pickup(restored,profile.pickupId),null);
 }
});
test('inactive release/menu/blur/death slices and zero elapsed consume nothing; malformed deltas reject',()=>{
 const state=full();for(const context of['release','menu','blur','death','not-yet-active']){const r=model.consume(state,{seconds:10,active:false});assert.equal(r.spent,0,context);assert.deepEqual(r.state,state);assert.notEqual(r.state,state);}
 assert.equal(model.consume(state,{seconds:0,active:true}).spent,0);
 for(const step of[{seconds:-1,active:true},{seconds:NaN,active:true},{seconds:Infinity,active:true},{seconds:1,active:1},{seconds:1},{seconds:1,active:true,held:true}])assert.equal(model.consume(state,step),null);
 assert.equal(model.consume(model.freshState(),{seconds:1,active:true}),null);
});
test('fractional elapsed fuel, bounded final slice and empty intent preserve pure inputs',()=>{
 const before=full(),part=model.consume(before,{seconds:.00125,active:true});assert.equal(part.spent,.125);assert.equal(part.remaining,999.875);assert.equal(before.fuelUnits,1000);
 const last=model.consume({version:1,collected:true,fuelUnits:3.5},{seconds:1,active:true});assert.equal(last.spent,3.5);assert.equal(last.remaining,0);assert.equal(last.empty,true);assert.equal(last.state.collected,true);assert.equal(last.spent/profile.unitsPerSecond,.035);
 assert.equal(model.consume(last.state,{seconds:1,active:true}).spent,0);assert.equal(model.consume(before,{seconds:20,active:true}).spent,1000);
});
test('elapsed consumption has the same ten-second empty boundary across frame rates',()=>{
 for(const fps of[30,60,144,240]){let state=full(),total=0;for(let n=0;n<10*fps;n++){const p=model.consume(state,{seconds:1/fps,active:true});total+=p.spent;state=p.state;}assert.equal(state.fuelUnits,0,'fps='+fps);assert(Math.abs(total-1000)<1e-8);}
 const a=model.consume(full(),{seconds:.75,active:true}).state,b=model.consume(model.consume(full(),{seconds:.25,active:true}).state,{seconds:.5,active:true}).state;assert.equal(a.fuelUnits,b.fuelUnits);
});
// Real existing Core/IO/run-operation, with a deliberately test-only unified
// codec. This does not append fuel to production's strict v7 or create a store.
function fixture(records=new Map()){
 let g={hp:45,fuel:model.freshState(),normalWeapon:'pistol',magazine:3,nextFireAt:9},quota=false,pending=null;
 const codec={RUN_SAVE_KEY:'test-only:one-run',PISTOL_SAVE_KEY:'test-only:legacy',encodeRun:run=>JSON.stringify(run),restoreRun(template,raw){if(raw==null)return {...template,fuel:model.freshState()};try{const parsed=JSON.parse(raw),fuel=model.restoreState(parsed.fuel);return fuel?{...parsed,fuel}:null;}catch{return null;}},captureRunState:run=>JSON.stringify(run),isRunStateUnchanged:(run,s)=>JSON.stringify(run)===s};
 const io=createRunStorage({codec,storage:{getItem:key=>records.get(key)??null,setItem(key,raw){if(quota)throw Error('quota');records.set(key,raw);}}});
 const domain=createRunOperation({getRun:()=>g,setRun:next=>g=next,createFreshRun:()=>({...g,hp:150,fuel:model.copy(g.fuel)}),applySavedRun:(run,saved)=>Object.assign(run,saved),claimPickup(command,context){const p=model.pickup(g.fuel,command.pickupId);if(!p)return{ok:false,code:'not-eligible',events:[]};if(!context.writeRun({...g,fuel:p.state}))return{ok:false,code:'storage-unavailable',events:[]};g.fuel=p.state;return{ok:true,changed:true,events:[{type:'fuel-picked-up'}]};}});
 const execute=(command,context)=>{
  if(command.type!=='save'||pending===null)return domain(command,context);
  const proposal=pending;if(!context.writeRun({...g,fuel:proposal.state}))return{ok:false,code:'storage-unavailable',events:[]};g.fuel=proposal.state;pending=null;return{ok:true,changed:proposal.spent>0,events:proposal.spent>0?[{type:'fuel-consumed',spent:proposal.spent}]:[]};
 };
 const core=createCore({executeDomain:execute,codec,readRun:()=>io.restore(g),writeRun:io.write});
 return{core,records,get run(){return g;},quota:v=>quota=v,pickup:()=>core.dispatch({type:'claimPickup',pickupId:profile.pickupId}),use(seconds,active){pending=model.consume(g.fuel,{seconds,active});if(!pending)return{ok:false};return core.dispatch({type:'save'});}};
}
test('real Core/IO proposal failure cannot grant fuel or visible consumption; recovered write persists remaining',()=>{
 const f=fixture();f.quota(true);assert.equal(f.pickup().code,'storage-unavailable');assert.equal(f.run.fuel.collected,false);f.quota(false);assert.ok(f.pickup().ok);const raw=f.records.get('test-only:one-run');
 f.quota(true);assert.equal(f.use(1,true).code,'storage-unavailable');assert.equal(f.run.fuel.fuelUnits,1000);assert.equal(f.records.get('test-only:one-run'),raw);f.quota(false);assert.ok(f.use(1,true).ok);assert.equal(f.run.fuel.fuelUnits,900);assert.equal(f.run.magazine,3);assert.equal(f.run.nextFireAt,9);assert.equal(f.run.normalWeapon,'pistol');
 const loaded=fixture(f.records);assert.ok(loaded.core.dispatch({type:'restore'}).ok);assert.equal(loaded.run.fuel.fuelUnits,900);assert.equal(loaded.pickup().ok,false);
});
test('real Core Retry keeps collection and partially spent/empty fuel, preserves original run on failure',()=>{
 for(const seconds of[2,20]){const f=fixture();assert.ok(f.pickup().ok);assert.ok(f.use(seconds,true).ok);const before=f.run,expected=model.copy(before.fuel),raw=f.records.get('test-only:one-run');f.quota(true);assert.equal(f.core.dispatch({type:'retry'}).ok,false);assert.equal(f.run,before);assert.equal(f.records.get('test-only:one-run'),raw);f.quota(false);assert.ok(f.core.dispatch({type:'retry'}).ok);assert.deepEqual(f.run.fuel,expected);assert.equal(f.run.hp,150);assert.equal(f.pickup().ok,false);}
});
