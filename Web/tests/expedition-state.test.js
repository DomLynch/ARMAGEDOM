import test from 'node:test';
import assert from 'node:assert/strict';
const {createExpeditionModel}=await import(process.env.EXPEDITION_STATE_URL??new URL('../src/engine/expedition-state.js',import.meta.url).href);
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createRunOperation} from '../src/core/run-operation.js';
const base='westminster-start-pistol-v1',reward='watchmans-pistol-v1',receipt='west-east-stolen-supply-v1:watchmans-pistol-v1';
const options=()=>({areaIds:['westminster','east','south'],expeditionId:'west-east-stolen-supply-v1',rewardVariantId:reward,baseVariantId:base,receiptId:receipt});
const model=createExpeditionModel(options());
const advance=(state,...types)=>types.reduce((s,type)=>model.transition(s,{type}),state);
test('missing legacy extension defaults safely; present corrupt/future/unknown data never resets',()=>{
 assert.deepEqual(model.restoreState(undefined),model.freshState());
 for(const bad of [null,{},'x',{...model.freshState(),version:2},{...model.freshState(),visitedIds:['unknown']},{...model.freshState(),selectedPistolVariant:'future-gun'}, {...model.freshState(),unexpected:1}])assert.equal(model.restoreState(bad),null);
});
test('ordered stages reject skips and repeats; claim owns reward and receipt together, selection stays base',()=>{
 let state=model.freshState();const original=model.copy(state);
 assert.equal(model.transition(state,{type:'claim'}),null);
 state=model.transition(state,{type:'accept'});assert.equal(model.transition(state,{type:'accept'}),null);
 state=model.transition(state,{type:'recover'});assert.equal(model.transition(state,{type:'recover'}),null);
 const claimed=model.transition(state,{type:'claim'});
 assert.equal(claimed.status,'claimed');assert.equal(claimed.rewardReceipt,receipt);assert.equal(claimed.selectedPistolVariant,base);assert.ok(model.ownsVariant(claimed,reward));
 assert.equal(model.transition(claimed,{type:'claim'}),null);assert.deepEqual(original,model.freshState());assert.equal(state.rewardReceipt,null);
});
test('receipt/status/ownership cannot drift, and locked variant cannot be selected',()=>{
 const fresh=model.freshState(),claimed=advance(fresh,'accept','recover','claim');
 assert.equal(model.transition(fresh,{type:'select',variantId:reward}),null);
 for(const bad of [{...fresh,rewardReceipt:receipt},{...claimed,rewardReceipt:null},{...claimed,rewardReceipt:'other'},{...fresh,selectedPistolVariant:reward}])assert.equal(model.valid(bad),false);
 const selected=model.transition(claimed,{type:'select',variantId:reward});assert.equal(selected.selectedPistolVariant,reward);
 assert.equal(model.transition(selected,{type:'select',variantId:base}).selectedPistolVariant,base);assert.equal(model.ownsVariant(selected,'other'),false);
});
test('visits/select are idempotent defensive proposals; catalogue mutation cannot admit unknown IDs',()=>{
 const config=options(),local=createExpeditionModel(config);config.areaIds.push('alien');
 const start=local.freshState(),visited=local.transition(start,{type:'visit',areaId:'east'}),again=local.transition(visited,{type:'visit',areaId:'east'});
 assert.deepEqual(again.visitedIds,['east']);assert.notEqual(again,visited);assert.notEqual(again.visitedIds,visited.visitedIds);
 again.visitedIds.push('south');assert.deepEqual(visited.visitedIds,['east']);assert.deepEqual(start.visitedIds,[]);
 assert.equal(local.transition(start,{type:'visit',areaId:'alien'}),null);assert.deepEqual(local.transition(start,{type:'select',variantId:base}),start);
});
test('restore/copy isolate caller state and reject duplicate, sparse or accessor DTOs',()=>{
 const state=model.transition(model.freshState(),{type:'visit',areaId:'east'}),restored=model.restoreState(JSON.parse(JSON.stringify(state)));
 restored.visitedIds.push('south');assert.deepEqual(state.visitedIds,['east']);
 const getter={...state};Object.defineProperty(getter,'status',{get(){throw Error('must not execute');}});
 const hidden={...state};Object.defineProperty(hidden,'status',{enumerable:false});
 const sparse=[];sparse.length=1;
 for(const bad of [getter,hidden,{...state,visitedIds:['east','east']},{...state,visitedIds:sparse},{...state,visitedIds:Object.assign(['east'],{extra:true})}])assert.equal(model.valid(bad),false);
 assert.throws(()=>model.copy(null),TypeError);
 const action={};Object.defineProperty(action,'type',{get(){throw Error('must not execute');}});assert.equal(model.transition(state,action),null);
 assert.equal(model.transition(state,{type:'claim',rewardReceipt:receipt}),null);
});
// Actual frozen138 Core + IO + run-operation; only the codec fixture is narrow.
// Web owns adoption into the real v4 codec/F3 snapshot and gameplay eligibility.
function fixture(raw){
 const records=new Map(raw===undefined?[]:[['armagedom:progression-run:v4',raw]]);let quota=false,g={hp:19,ammo:2,expedition:model.freshState()},writes=0;
 const codec={RUN_SAVE_KEY:'armagedom:progression-run:v4',PISTOL_SAVE_KEY:'armagedom:pistol:v1',encodeRun:run=>JSON.stringify({version:4,hp:run.hp,ammo:run.ammo,expedition:run.expedition}),restoreRun(template,value){
  if(value==null)return {...template,expedition:model.freshState()};
  try{const saved=JSON.parse(value),expedition=model.restoreState(saved.expedition);return saved.version===4&&Number.isFinite(saved.hp)&&Number.isInteger(saved.ammo)&&expedition?{...saved,expedition}:null;}catch{return null;}
 }};
 const io=createRunStorage({codec,storage:{getItem:key=>records.get(key)??null,setItem(key,value){writes++;if(quota)throw Error('quota');records.set(key,value);}}});
 const operation=(command,context)=>{
  const action=command.type==='equip'?{type:'select',variantId:command.itemId}:{type:command.pickupId};
  const next=model.transition(g.expedition,action);if(!next)return {ok:false,code:'not-eligible',events:[]};
  const candidate={...g,expedition:next};if(!context.writeRun(candidate))return {ok:false,code:'storage-unavailable',events:[]};
  g.expedition=next;return {ok:true,changed:true,events:[{type:action.type}]};
 };
 const domain=createRunOperation({getRun:()=>g,setRun:next=>g=next,createFreshRun:()=>({hp:150,ammo:0}),applySavedRun:(run,saved)=>Object.assign(run,saved),claimPickup:operation,equip:operation});
 const wrapped=(command,context)=>domain(command,{...context,writeRun(candidate){
  const proposal=command.type==='retry'?{...candidate,expedition:model.copy(g.expedition)}:candidate;
  if(!context.writeRun(proposal))return false;if(command.type==='retry')candidate.expedition=proposal.expedition;return true;
 }});
 const core=createCore({executeDomain:wrapped,codec,readRun:()=>io.restore(g),writeRun:io.write});
 return {core,records,get run(){return g;},get writes(){return writes;},quota(value){quota=value;},step:type=>core.dispatch({type:'claimPickup',pickupId:type}),reload(){return fixture(records.get(codec.RUN_SAVE_KEY));}};
}
test('actual Core/IO: quota on claim preserves recovered case and bytes; retry commits one reward across reload',()=>{
 const f=fixture();assert.ok(f.step('accept').ok);assert.ok(f.step('recover').ok);const before=f.records.get('armagedom:progression-run:v4');
 f.quota(true);assert.equal(f.step('claim').code,'storage-unavailable');assert.equal(f.run.expedition.status,'recovered');assert.equal(f.run.expedition.rewardReceipt,null);assert.equal(model.ownsVariant(f.run.expedition,reward),false);assert.equal(f.records.get('armagedom:progression-run:v4'),before);
 f.quota(false);assert.ok(f.step('claim').ok);const writes=f.writes;assert.equal(f.step('claim').ok,false);assert.equal(f.writes,writes);
 const loaded=f.reload();assert.ok(loaded.core.dispatch({type:'restore'}).ok);assert.equal(loaded.run.expedition.rewardReceipt,receipt);assert.equal(loaded.step('claim').ok,false);
});
test('actual Core/IO: selection keeps combat/ammo; failed write never changes live selection',()=>{
 const f=fixture();for(const type of ['accept','recover','claim'])assert.ok(f.step(type).ok);
 f.quota(true);assert.equal(f.core.dispatch({type:'equip',itemId:reward,equipped:true}).code,'storage-unavailable');assert.equal(f.run.expedition.selectedPistolVariant,base);
 f.quota(false);assert.ok(f.core.dispatch({type:'equip',itemId:reward,equipped:true}).ok);assert.equal(f.run.ammo,2);assert.equal(f.run.hp,19);
 const loaded=f.reload();assert.ok(loaded.core.dispatch({type:'restore'}).ok);assert.equal(loaded.run.expedition.selectedPistolVariant,reward);assert.equal(loaded.run.ammo,2);
});
test('actual Core Retry: all new stages/discovery survive while old combat resets; quota leaves original run',()=>{
 for(const stages of [[],['accept'],['accept','recover'],['accept','recover','claim']]){
  const f=fixture();for(const type of stages)assert.ok(f.step(type).ok);
  if(stages.includes('claim'))assert.ok(f.core.dispatch({type:'equip',itemId:reward,equipped:true}).ok);
  f.run.expedition=model.transition(f.run.expedition,{type:'visit',areaId:'east'});
  const previous=f.run,expected=model.copy(previous.expedition);f.quota(true);assert.equal(f.core.dispatch({type:'retry'}).code,'storage-unavailable');assert.equal(f.run,previous);assert.deepEqual(f.run.expedition,expected);
  f.quota(false);assert.ok(f.core.dispatch({type:'retry'}).ok);assert.notEqual(f.run,previous);assert.equal(f.run.hp,150);assert.equal(f.run.ammo,0);assert.deepEqual(f.run.expedition,expected);
  const loaded=f.reload();assert.ok(loaded.core.dispatch({type:'restore'}).ok);assert.deepEqual(loaded.run.expedition,expected);
 }
});
test('actual Core restore: missing old extension upgrades; corrupt present extension preserves raw, no fallback',()=>{
 const old=fixture(JSON.stringify({version:4,hp:44,ammo:3}));assert.ok(old.core.dispatch({type:'restore'}).ok);assert.deepEqual(old.run.expedition,model.freshState());assert.equal(old.run.hp,44);
 const raw=JSON.stringify({version:4,hp:44,ammo:3,expedition:{...model.freshState(),selectedPistolVariant:'unknown'}}),bad=fixture(raw);
 assert.equal(bad.core.dispatch({type:'restore'}).code,'invalid-save');assert.equal(bad.core.dispatch({type:'save'}).ok,false);assert.equal(bad.records.get('armagedom:progression-run:v4'),raw);
});

test('case collected before acceptance uses original recovered DTO and claims once without another fetch',()=>{
 const fresh=model.freshState(),owned=model.transition(fresh,{type:'recover'});
 assert.equal(owned.status,'recovered');assert.equal(owned.version,1);assert.equal(owned.rewardReceipt,null);assert.equal(owned.selectedPistolVariant,base);
 const resumed=model.restoreState(JSON.parse(JSON.stringify(owned)));assert.deepEqual(resumed,owned);assert.equal(model.transition(resumed,{type:'accept'}),null);assert.equal(model.transition(resumed,{type:'recover'}),null);
 const claimed=model.transition(resumed,{type:'claim'});assert.equal(claimed.rewardReceipt,receipt);assert.equal(model.transition(claimed,{type:'claim'}),null);assert.equal(fresh.status,'available');
});
