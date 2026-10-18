import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnlockRewardModel} from '../src/engine/unlock-reward-state.js';
import {createRewardCollectionModel} from '../src/engine/reward-collection-state.js';
const config=itemId=>({itemId,source:{placementKey:'boss-surgeon-v1',areaId:'lambeth',receiptId:'boss-surgeon-v1:'+itemId}});
const options=config('surgeon-knife-v1'),m=createUnlockRewardModel(options);
const drop={type:'drop',placementKey:options.source.placementKey,areaId:options.source.areaId,position:{x:2,z:-3}};
const owned=()=>m.transition(m.transition(m.freshState(),drop),{type:'pickup'});
test('strict catalogue and stable source:item receipt, no ammo contract',()=>{
 assert.deepEqual(Object.keys(m.freshState()),['version','status','dropPosition','rewardReceipt','selected']);
 for(const bad of[null,{...options,ammo:3},{...options,itemId:'__proto__'},{...options,source:{...options.source,receiptId:'wrong'}},{...options,source:{...options.source,extra:1}},Object.defineProperty({},'itemId',{get(){throw Error('getter');},enumerable:true})])assert.throws(()=>createUnlockRewardModel(bad),TypeError);
 const c=config('marshal-pistol-v1'),other=createUnlockRewardModel(c);c.source.receiptId='changed';assert.ok(other.valid(other.freshState()));
});
test('absent-only migration requires explicit source death; corrupt present data never resets',()=>{
 assert.equal(m.restoreState(undefined,{sourceDead:false}).status,'eligible');assert.equal(m.restoreState(undefined,{sourceDead:true}).status,'legacy-dead');
 for(const options of[undefined,{},null,{sourceDead:1},{sourceDead:false,extra:1}])assert.equal(m.restoreState(undefined,options),null);
 for(const raw of[null,{},'',{...m.freshState(),selected:true},{...owned(),rewardReceipt:'wrong'}])assert.equal(m.restoreState(raw,{sourceDead:false}),null);
 assert.deepEqual(m.restoreState(owned()),owned());
});
test('matching confirmed drop, once pickup receipt, explicit select and deselect',()=>{
 for(const sourceDead of[false,true]){
  const fresh=m.restoreState(undefined,{sourceDead}),pending=m.transition(fresh,drop);assert.equal(pending.status,'pending');assert.equal(fresh.dropPosition,null);assert.equal(m.transition(pending,drop),null);
  const state=m.transition(pending,{type:'pickup'});assert.deepEqual(state,{version:1,status:'owned',dropPosition:null,rewardReceipt:options.source.receiptId,selected:false});assert.equal(m.transition(state,{type:'pickup'}),null);assert.equal(m.transition(state,drop),null);
  const selected=m.transition(state,{type:'select',selected:true});assert.equal(selected.selected,true);assert.equal(state.selected,false);assert.equal(m.transition(selected,{type:'select',selected:false}).selected,false);
 }
 assert.equal(m.transition(m.freshState(),{type:'select',selected:true}),null);assert.equal(m.transition(m.freshState(),{type:'select',selected:false}).selected,false);
});
test('wrong source/area, malformed actions and unsupported resource actions reject',()=>{
 for(const action of[{...drop,placementKey:'other'},{...drop,areaId:'east'},{...drop,position:{x:NaN,z:0}},{...drop,position:{x:0,z:0,extra:1}},{type:'pickup',extra:1},{type:'select',selected:1},{type:'fire'},{type:'reload'},null])assert.equal(m.transition(m.freshState(),action),null);
});
test('accessors, hidden, symbol and unknown fields reject at DTO and action boundary',()=>{
 for(const change of[s=>Object.defineProperty(s,'status',{get(){throw Error('getter');},enumerable:true}),s=>Object.defineProperty(s,'selected',{value:false,enumerable:false}),s=>Object.assign(s,{ammo:0}),s=>Object.assign(s,{[Symbol('hidden')]:true})]){const state=change(m.freshState());assert.equal(m.valid(state),false);assert.equal(m.restoreState(state,{sourceDead:false}),null);assert.equal(m.transition(state,{type:'pickup'}),null);assert.throws(()=>m.copy(state),TypeError);}
 const getter=Object.defineProperty({},'type',{get(){throw Error('getter');},enumerable:true});assert.equal(m.transition(m.freshState(),getter),null);
 const hidden=Object.defineProperty({type:'select'},'selected',{value:false,enumerable:false});assert.equal(m.transition(m.freshState(),hidden),null);
});
test('positions copied through drop, copy and restore; frozen caller inputs untouched',()=>{
 const action={...drop,position:Object.freeze({...drop.position})},fresh=Object.freeze(m.freshState());Object.freeze(action);const pending=m.transition(fresh,action);Object.freeze(pending.dropPosition);Object.freeze(pending);const copied=m.copy(pending),restored=m.restoreState(pending);copied.dropPosition.x=55;restored.dropPosition.z=55;assert.deepEqual(pending.dropPosition,drop.position);assert.deepEqual(action.position,drop.position);assert.equal(m.transition(pending,{type:'pickup'}).selected,false);
});
test('actual reward collection switches unlocks without resource fields or double selection',()=>{
 const collection=createRewardCollectionModel({surgeon:m,marshal:createUnlockRewardModel(config('marshal-pistol-v1'))});let state=collection.freshState();for(const field of['surgeon','marshal']){state=collection.transition(state,field,drop);state=collection.transition(state,field,{type:'pickup'});}
 state=collection.transition(state,'surgeon',{type:'select',selected:true});const switched=collection.transition(state,'marshal',{type:'select',selected:true});assert.ok(collection.valid(switched));assert.equal(switched.surgeon.selected,false);assert.equal(switched.marshal.selected,true);assert.equal(state.surgeon.selected,true);assert.equal(Object.hasOwn(switched.marshal,'magazine'),false);assert.equal(Object.hasOwn(switched.marshal,'reserve'),false);
});
