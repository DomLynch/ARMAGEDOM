import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createRunOperation} from '../src/core/run-operation.js';
const {createUniqueRewardModel}=await import(process.env.UNIQUE_REWARD_STATE_URL??new URL('../src/engine/unique-reward-state.js',import.meta.url).href);
const item='hale-pitborn-cleaver-v1',receipt='east-roamer-2:hale-pitborn-cleaver-v1';
const model=createUniqueRewardModel({placementKey:'east-roamer-2',areaId:'east',itemId:item,baseVariantId:'knife',receiptId:receipt});
const death=()=>({type:'drop',placementKey:'east-roamer-2',areaId:'east',position:{x:2,z:-3}});
const pending=()=>model.transition(model.freshState(),death());
const owned=()=>model.transition(pending(),{type:'pickup'});
test('missing legacy DTO requires death knowledge; old dead Hale produces no item or pending drop',()=>{
 assert.equal(model.restoreState(undefined),null);assert.equal(model.restoreState(undefined,{sourceDead:'false'}),null);
 assert.deepEqual(model.restoreState(undefined,{sourceDead:false}),model.freshState());
 const oldDead=model.restoreState(undefined,{sourceDead:true});assert.equal(oldDead.status,'legacy-dead');assert.equal(oldDead.dropPosition,null);assert.equal(oldDead.rewardReceipt,null);assert.equal(model.ownsVariant(oldDead,item),false);
 assert.equal(model.transition(oldDead,{type:'pickup'}),null);assert.equal(model.restoreState(oldDead,{sourceDead:false}).status,'legacy-dead');
});
test('only the configured source and a finite position can propose a pending drop',()=>{
 const start=model.freshState();
 for(const action of [{...death(),placementKey:'east-roamer-1'},{...death(),areaId:'south'},{...death(),position:{x:NaN,z:0}},{...death(),position:{x:0,z:Infinity}},{...death(),position:{x:0,z:0,y:0}}])assert.equal(model.transition(start,action),null);
 const action=death(),next=model.transition(start,action);action.position.x=99;
 assert.equal(next.status,'pending');assert.deepEqual(next.dropPosition,{x:2,z:-3});assert.equal(model.ownsVariant(next,item),false);assert.deepEqual(start,model.freshState());
 assert.equal(model.transition(next,death()),null);
});
test('pickup atomically couples owned status and stable receipt, never autoequips or repeats',()=>{
 const before=pending(),next=model.transition(before,{type:'pickup'});
 assert.equal(next.status,'owned');assert.equal(next.rewardReceipt,receipt);assert.equal(next.dropPosition,null);assert.equal(next.selectedMeleeVariant,'knife');assert.equal(model.ownsVariant(next,item),true);
 assert.equal(before.status,'pending');assert.equal(model.transition(next,{type:'pickup'}),null);assert.equal(model.transition(next,death()),null);
 assert.equal(model.transition(model.freshState(),{type:'pickup'}),null);
});
test('selection requires owned reward and does not alter the receipt; duplicate selection is a defensive copy',()=>{
 for(const state of [model.freshState(),pending()])assert.equal(model.transition(state,{type:'select',variantId:item}),null);
 const next=model.transition(owned(),{type:'select',variantId:item}),again=model.transition(next,{type:'select',variantId:item});assert.deepEqual(again,next);assert.notEqual(again,next);
 assert.equal(next.rewardReceipt,receipt);assert.equal(model.transition(next,{type:'select',variantId:'knife'}).selectedMeleeVariant,'knife');assert.equal(model.transition(next,{type:'select',variantId:'unknown'}),null);
});
test('unknown/partial/corrupt or serialization-losing occupied DTO fails closed',()=>{
 const hidden={...owned()};Object.defineProperty(hidden,'status',{enumerable:false});
 const getter={...owned()};Object.defineProperty(getter,'status',{get(){throw Error('must not execute');}});
 for(const bad of [null,{},hidden,getter,{...owned(),version:2},{...owned(),rewardReceipt:'other'},{...owned(),rewardReceipt:null},{...pending(),rewardReceipt:receipt},{...pending(),dropPosition:null},{...model.freshState(),selectedMeleeVariant:item},{...owned(),selectedMeleeVariant:'other'},{...owned(),extra:true}]){
  assert.equal(model.valid(bad),false);assert.equal(model.restoreState(bad,{sourceDead:false}),null);
 }
});
test('reload copies a pending location; legacy-dead can earn only through an explicit new death action',()=>{
 const source=pending(),loaded=model.restoreState(JSON.parse(JSON.stringify(source))),copied=model.copy(source);loaded.dropPosition.x=77;copied.dropPosition.z=88;assert.deepEqual(source.dropPosition,{x:2,z:-3});
 const oldDead=model.restoreState(undefined,{sourceDead:true}),newDeath=model.transition(oldDead,death());assert.equal(newDeath.status,'pending');assert.equal(oldDead.status,'legacy-dead');assert.equal(model.transition(newDeath,death()),null);assert.equal(model.transition(newDeath,{type:'pickup'}).status,'owned');
});
// Actual146 Core/IO/run-operation, with a narrow test codec and scoped producer.
// Web owns the full successor codec/F3 and actual gameplay death/proximity gating.
const oldKey='armagedom:area-boss-run:v6',newKey='armagedom:unique-reward-run:v7';
function fixture(records=new Map()){
 let g={hp:21,sourceDead:false,reward:model.freshState()},quota=false,queued=null,legacy=false,writes=0;
 const codec={RUN_SAVE_KEY:newKey,PISTOL_SAVE_KEY:'armagedom:pistol:v1',encodeRun:run=>JSON.stringify({...run,version:7}),restoreRun(template,raw){
  const old=legacy;legacy=false;if(raw==null)return {...template,reward:model.freshState()};
  try{const saved=JSON.parse(raw);if(saved.version!==(old?6:7))return null;const reward=model.restoreState(saved.reward,{sourceDead:saved.sourceDead});return reward&&typeof saved.sourceDead==='boolean'&&Number.isFinite(saved.hp)?{hp:saved.hp,sourceDead:saved.sourceDead,reward}:null;}catch{return null;}
 }};
 const io=createRunStorage({codec,storage:{getItem(key){if(key!==newKey)return records.get(key)??null;const raw=records.get(key);legacy=raw==null&&records.has(oldKey);return raw??records.get(oldKey)??null;},setItem(key,raw){writes++;if(quota)throw Error('quota');records.set(key,raw);}}});
 const operation=(command,context)=>{
  const action=queued,next=model.transition(g.reward,action);if(!next)return {ok:false,code:'not-eligible',events:[]};
  const candidate={...g,reward:next,sourceDead:action.type==='drop'?true:g.sourceDead};
  if(!context.writeRun(candidate))return {ok:false,code:'storage-unavailable',events:[]};
  g.reward=next;g.sourceDead=candidate.sourceDead;queued=null;return {ok:true,changed:true,events:[{type:action.type}]};
 };
 const domain=createRunOperation({getRun:()=>g,setRun:next=>g=next,createFreshRun:()=>({hp:150,sourceDead:false,reward:model.copy(g.reward)}),applySavedRun:(run,saved)=>Object.assign(run,saved),claimPickup:operation});
 const core=createCore({executeDomain:domain,codec,readRun:()=>io.restore(g),writeRun:io.write});
 return{core,records,get run(){return g;},get writes(){return writes;},quota(value){quota=value;},action(action){queued=action;return core.dispatch({type:'claimPickup',pickupId:item});},retryQueued(){return core.dispatch({type:'claimPickup',pickupId:item});}};
}
test('actual Core/IO: failed death write has no visible drop/death ledger; retained intent commits together later',()=>{
 const f=fixture();assert.ok(f.core.dispatch({type:'save'}).ok);const old=f.records.get(newKey);f.quota(true);
 assert.equal(f.action(death()).code,'storage-unavailable');assert.equal(f.run.reward.status,'eligible');assert.equal(f.run.sourceDead,false);assert.equal(f.records.get(newKey),old);
 f.quota(false);assert.ok(f.retryQueued().ok);const saved=JSON.parse(f.records.get(newKey));assert.equal(saved.sourceDead,true);assert.equal(saved.reward.status,'pending');assert.deepEqual(saved.reward.dropPosition,{x:2,z:-3});
});
test('actual Core/IO: quota on pickup retains pending position and bytes; reload and repeated pickup cannot duplicate',()=>{
 const f=fixture();assert.ok(f.action(death()).ok);const old=f.records.get(newKey);f.quota(true);assert.equal(f.action({type:'pickup'}).code,'storage-unavailable');assert.equal(f.run.reward.status,'pending');assert.equal(model.ownsVariant(f.run.reward,item),false);assert.equal(f.records.get(newKey),old);
 f.quota(false);assert.ok(f.retryQueued().ok);const count=f.writes;assert.equal(f.action({type:'pickup'}).ok,false);assert.equal(f.writes,count);
 const loaded=fixture(f.records);assert.ok(loaded.core.dispatch({type:'restore'}).ok);assert.equal(loaded.run.reward.status,'owned');assert.equal(loaded.run.reward.rewardReceipt,receipt);assert.equal(loaded.action({type:'pickup'}).ok,false);assert.equal(loaded.action(death()).ok,false);
});
test('actual Core Retry: pending/owned/selection survive; failed Retry preserves original run and bytes',()=>{
 for(const select of [false,true]){
  const f=fixture();assert.ok(f.action(death()).ok);if(select){assert.ok(f.action({type:'pickup'}).ok);assert.ok(f.action({type:'select',variantId:item}).ok);}
  const before=f.run,raw=f.records.get(newKey),expected=model.copy(before.reward);f.quota(true);assert.equal(f.core.dispatch({type:'retry'}).code,'storage-unavailable');assert.equal(f.run,before);assert.equal(f.records.get(newKey),raw);
  f.quota(false);assert.ok(f.core.dispatch({type:'retry'}).ok);assert.equal(f.run.hp,150);assert.equal(f.run.sourceDead,false);assert.deepEqual(f.run.reward,expected);assert.equal(f.action(death()).ok,false);
  const loaded=fixture(f.records);assert.ok(loaded.core.dispatch({type:'restore'}).ok);assert.deepEqual(loaded.run.reward,expected);
 }
});
test('narrow migration fixture: preserve old v6 raw, no retrogrant; genuine new death after Retry can earn once',()=>{
 const raw=JSON.stringify({version:6,hp:43,sourceDead:true}),records=new Map([[oldKey,raw]]),f=fixture(records);assert.ok(f.core.dispatch({type:'restore'}).ok);assert.equal(f.run.reward.status,'legacy-dead');assert.equal(f.action({type:'pickup'}).ok,false);
 assert.ok(f.core.dispatch({type:'save'}).ok);assert.equal(records.get(oldKey),raw);assert.equal(f.run.sourceDead,true);
 assert.ok(f.core.dispatch({type:'retry'}).ok);assert.equal(f.run.sourceDead,false);assert.equal(f.run.reward.status,'legacy-dead');assert.ok(f.action(death()).ok);assert.ok(f.action({type:'pickup'}).ok);assert.equal(f.action(death()).ok,false);assert.equal(records.get(oldKey),raw);
});
test('narrow migration fixture: alive/dead defaults and failed first successor write preserve old raw',()=>{
 for(const sourceDead of [false,true]){
  const raw=JSON.stringify({version:6,hp:43,sourceDead}),records=new Map([[oldKey,raw]]),f=fixture(records);
  assert.ok(f.core.dispatch({type:'restore'}).ok);assert.equal(f.run.reward.status,sourceDead?'legacy-dead':'eligible');assert.equal(f.run.reward.dropPosition,null);
  f.quota(true);assert.equal(f.core.dispatch({type:'save'}).code,'storage-unavailable');assert.equal(records.has(newKey),false);assert.equal(records.get(oldKey),raw);
  f.quota(false);assert.ok(f.core.dispatch({type:'save'}).ok);assert.equal(records.get(oldKey),raw);assert.ok(records.has(newKey));
 }
});
test('occupied corrupt successor never falls back or overwrites raw during restore/save',()=>{
 for(const raw of ['{broken',JSON.stringify({version:7,hp:43,sourceDead:true,reward:{...owned(),rewardReceipt:'other'}})]){
  const old=JSON.stringify({version:6,hp:43,sourceDead:false}),records=new Map([[oldKey,old],[newKey,raw]]),f=fixture(records);
  assert.equal(f.core.dispatch({type:'restore'}).code,'invalid-save');assert.equal(f.core.dispatch({type:'save'}).ok,false);assert.equal(records.get(newKey),raw);assert.equal(records.get(oldKey),old);
 }
});
