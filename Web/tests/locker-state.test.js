import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
const {createLockerModel,LOCKER_WEAPON_IDS:ids,LOCKER_RESOURCE_RULES:rules}=await import(process.env.LOCKER_STATE_URL??new URL('../src/engine/locker-state.js',import.meta.url).href);
const model=()=>createLockerModel({weaponIds:ids,resourceRules:rules});
const inventory=()=>({weapons:Object.fromEntries(ids.map(id=>[id,{owned:true,equipped:false}])),ammo:{'pistol-reserve':12,'rifle-reserve':16,'shotgun-reserve':12,'rocket-reserve':3,'grenade-charges':3,'flame-fuel':611.6666666666755}});
const sum=(locker,view,key)=>locker.ammo[key]+view.ammo[key];
test('fixed physical catalogue and six shared finite pools, no base Knife/variant duplication',()=>{
 const m=model();assert.ok(m.valid(m.freshState()));assert.equal(ids.length,9);assert.equal(Object.keys(rules).length,6);assert.ok(!ids.includes('knife'));assert.ok(!ids.includes('borough-marshals-pistol-v1'));assert.ok(!ids.includes('ember-flamethrower-v1'));
 for(const weaponIds of[[...ids,'knife'],ids.slice(1),[...ids.slice(0,-1),ids[0]],['unknown']])assert.throws(()=>createLockerModel({weaponIds,resourceRules:rules}),TypeError);
 for(const rule of[{...rules['pistol-reserve'],carryCap:NaN},{...rules['pistol-reserve'],integer:false}])assert.throws(()=>createLockerModel({weaponIds:ids,resourceRules:{...rules,'pistol-reserve':rule}}),TypeError);
});
test('deposit/retrieve spare weapon changes only location, roundtrip preserves inventory and entitlements',()=>{
 const m=model(),locker=m.freshState(),view=inventory(),before=structuredClone(view),id=ids[1],receipt={status:'owned',rewardReceipt:'boss-warden-v1:bridge-warden-rifle-v1',magazine:5,reserve:16};Object.freeze(receipt);
 const bank=m.propose(locker,view,{type:'depositWeapon',itemId:id});assert.deepEqual(bank.locker.weapons,[id]);assert.deepEqual(bank.ammo,view.ammo);assert.deepEqual(view,before);assert.deepEqual(locker,m.freshState());assert.equal(receipt.magazine,5);assert.equal(receipt.rewardReceipt,'boss-warden-v1:bridge-warden-rifle-v1');
 assert.equal(m.propose(bank.locker,view,{type:'depositWeapon',itemId:id}),null);const back=m.propose(bank.locker,view,{type:'withdrawWeapon',itemId:id});assert.deepEqual(back.locker,locker);assert.deepEqual(back.ammo,view.ammo);assert.equal(m.propose(locker,view,{type:'withdrawWeapon',itemId:id}),null);
 for(const bad of['knife','borough-marshals-pistol-v1','ember-flamethrower-v1','unknown'])assert.equal(m.propose(locker,view,{type:'depositWeapon',itemId:bad}),null);
});
test('all ammo/reserve/charges/fractional fuel roundtrip conserves counts and loaded ammo is outside API',()=>{
 const m=model();for(const resource of Object.keys(rules)){
  const view=inventory(),locker=m.freshState(),before=structuredClone(view),total=sum(locker,view,resource),amount=resource==='flame-fuel'?100.25:view.ammo[resource];
  const deposit=m.propose(locker,view,{type:'depositSupply',resource,amount});assert.ok(deposit);const carried={weapons:view.weapons,ammo:deposit.ammo};assert.ok(Math.abs(sum(deposit.locker,carried,resource)-total)<1e-10);assert.equal(deposit.locker.ammo[resource],amount);assert.deepEqual(view,before);
  const retrieve=m.propose(deposit.locker,carried,{type:'withdrawSupply',resource,amount});assert.ok(retrieve);assert.ok(Math.abs(retrieve.ammo[resource]-view.ammo[resource])<1e-10);assert.equal(retrieve.locker.ammo[resource],0);for(const other of Object.keys(rules).filter(k=>k!==resource))assert.equal(retrieve.ammo[other],view.ammo[other]);
 }
});
test('unowned/equipped items and orphan banked ammo fail pair validation, no future grants',()=>{
 const m=model(),view=inventory(),locker=m.freshState(),pistol=ids[0];view.weapons[pistol].equipped=true;assert.equal(m.propose(locker,view,{type:'depositWeapon',itemId:pistol}),null);const bank=m.propose(locker,inventory(),{type:'depositWeapon',itemId:pistol}).locker;assert.equal(m.validInventory(bank,view),false);
 view.weapons[pistol]={owned:false,equipped:false};view.ammo['pistol-reserve']=0;assert.equal(m.validInventory(locker,view),true);assert.equal(m.validInventory(bank,view),false);assert.equal(m.propose(locker,view,{type:'depositWeapon',itemId:pistol}),null);
 const orphan=m.copy(locker);orphan.ammo['pistol-reserve']=1;assert.equal(m.valid(orphan),true);assert.equal(m.validInventory(orphan,view),false);assert.equal(m.propose(orphan,view,{type:'withdrawSupply',resource:'pistol-reserve',amount:1}),null);
});
test('overdraw, carry/stash overflow, fractional integer pool and invalid quantities reject without mutation',()=>{
 const m=model(),view=inventory(),locker=m.freshState(),before=structuredClone({view,locker});
 for(const amount of[0,-1,NaN,Infinity,.5,13])assert.equal(m.propose(locker,view,{type:'depositSupply',resource:'pistol-reserve',amount}),null);
 assert.equal(m.propose(locker,view,{type:'withdrawSupply',resource:'pistol-reserve',amount:1}),null);locker.ammo['pistol-reserve']=12;assert.equal(m.propose(locker,view,{type:'depositSupply',resource:'pistol-reserve',amount:1}),null);assert.equal(m.propose(locker,view,{type:'withdrawSupply',resource:'pistol-reserve',amount:1}),null);locker.ammo['pistol-reserve']=0;
 for(const action of[{type:'depositSupply',resource:'dressing',amount:1},{type:'depositSupply',resource:'pistol-reserve',amount:1,extra:1},{type:'depositWeapon',itemId:ids[0],amount:1},{type:'unknown'},null])assert.equal(m.propose(locker,view,action),null);assert.deepEqual({view,locker},before);
});
test('missing extension defaults fresh, corrupt present fails closed; strict hidden/accessor/duplicate fields',()=>{
 const m=model(),fresh=m.freshState();assert.deepEqual(m.restoreState(undefined),fresh);const saved={...fresh,weapons:[ids[1]],ammo:{...fresh.ammo,'rifle-reserve':3}};assert.deepEqual(m.restoreState(JSON.parse(JSON.stringify(saved))),saved);
 const bad=[null,{},'bad',{...fresh,version:2},{...fresh,weapons:[ids[0],ids[0]]},{...fresh,weapons:['unknown']},{...fresh,extra:1},{...fresh,ammo:{...fresh.ammo,'rifle-reserve':17}},Object.defineProperty({...fresh},'version',{get(){throw Error('getter');},enumerable:true})];
 for(const raw of bad){assert.equal(m.restoreState(raw),null);assert.equal(m.valid(raw),false);assert.throws(()=>m.copy(raw),TypeError);}
 const hidden=Object.defineProperty({...fresh},'version',{value:1,enumerable:false});assert.equal(m.valid(hidden),false);const copied=m.copy(saved);copied.weapons.push(ids[0]);copied.ammo['rifle-reserve']=0;assert.equal(saved.weapons.length,1);assert.equal(saved.ammo['rifle-reserve'],3);
});
test('one actual Core/IO whole-record commit: quota failure exposes neither partial transfer nor grant',()=>{
 // Test-only envelope exercises Core/IO transaction boundary, NOT live v12 migration.
 const m=model(),records=new Map(),key='test-only:locker';let current={locker:m.freshState(),inventory:inventory(),receipt:'owned-original',loadedMagazine:5},quota=false,action=null;
 const codec={RUN_SAVE_KEY:key,PISTOL_SAVE_KEY:'test-only:legacy',encodeRun:g=>JSON.stringify(g),restoreRun(g,raw){if(raw==null)return structuredClone(g);try{const s=JSON.parse(raw);return m.validInventory(s.locker,s.inventory)&&s.receipt==='owned-original'&&s.loadedMagazine===5?s:null;}catch{return null;}}};
 const io=createRunStorage({codec,storage:{getItem:k=>records.get(k)??null,setItem(k,raw){if(quota)throw Error('quota');records.set(k,raw);}}});
 const core=createCore({codec,readRun:()=>io.restore(current),writeRun:io.write,executeDomain(command,context){const proposal=m.propose(current.locker,current.inventory,action);if(!proposal)return{ok:false,code:'not-eligible',events:[]};const candidate={...current,locker:proposal.locker,inventory:{...current.inventory,ammo:proposal.ammo}};if(!context.writeRun(candidate))return{ok:false,code:'storage-unavailable',events:[]};current=candidate;return{ok:true,changed:true,events:[{type:'locker-transfer'}]};}});
 action={type:'depositSupply',resource:'rifle-reserve',amount:3};const before=structuredClone(current);quota=true;const failed=core.dispatch({type:'save'});assert.equal(failed.code,'storage-unavailable');assert.deepEqual(failed.events,[]);assert.deepEqual(current,before);assert.equal(records.size,0);
 quota=false;assert.ok(core.dispatch({type:'save'}).ok);const saved=records.get(key);assert.equal(current.inventory.ammo['rifle-reserve'],13);assert.equal(current.locker.ammo['rifle-reserve'],3);assert.equal(current.receipt,'owned-original');assert.equal(current.loadedMagazine,5);assert.deepEqual(codec.restoreRun(current,saved),current);
 quota=true;action={type:'withdrawSupply',resource:'rifle-reserve',amount:3};const banked=structuredClone(current);assert.equal(core.dispatch({type:'save'}).ok,false);assert.equal(records.get(key),saved);assert.deepEqual(current,banked);quota=false;assert.ok(core.dispatch({type:'save'}).ok);assert.equal(current.inventory.ammo['rifle-reserve'],16);assert.equal(current.locker.ammo['rifle-reserve'],0);
});
