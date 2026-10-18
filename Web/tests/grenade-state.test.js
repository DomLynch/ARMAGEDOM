import test from 'node:test';
import assert from 'node:assert/strict';
const {validateGrenadeProfile,createGrenadeModel}=await import(process.env.GRENADE_STATE_URL??new URL('../src/engine/grenade-state.js',import.meta.url).href);
const profile={itemId:'standard-grenade-v1',capacity:3,maxRange:8,fuseSeconds:1,radius:3,maxDamage:60};
const model=()=>createGrenadeModel({profile,areaIds:['westminster','area7']});
const origin={x:0,z:0},target={x:8,z:0};
const thrown=()=>model().proposeThrow({charges:3,time:10},origin,target,'area7','grenade:1').active;
const victim=(victimId,x=8,extra={})=>({victimId,areaId:'area7',position:{x,z:0},hp:100,eligible:true,...extra});
test('only exact registered profile and explicit unique known areas admitted',()=>{
 const p=validateGrenadeProfile(profile);assert.deepEqual(p,profile);assert.ok(Object.isFrozen(p));assert.notEqual(p,profile);
 for(const bad of[null,{...profile,itemId:'sticky-grenade-v1'},{...profile,maxDamage:61},{...profile,extra:1},{...profile,capacity:Infinity}])assert.throws(()=>validateGrenadeProfile(bad),TypeError);
 for(const areaIds of[[],['area7','area7'],['__proto__'],[1],null])assert.throws(()=>createGrenadeModel({profile,areaIds}),TypeError);
});
test('throw proposes one charge spend and copies committed aim; no input mutation or homing',()=>{
 const m=model(),state=Object.freeze({charges:3,time:10}),from=Object.freeze({...origin}),aim={...target};const result=m.proposeThrow(state,from,aim,'area7','grenade:1');assert.deepEqual(result,{charges:2,active:{id:'grenade:1',areaId:'area7',position:target,detonateAt:11}});assert.equal(state.charges,3);aim.x=1;assert.equal(result.active.position.x,8);
 assert.equal(m.proposeThrow({charges:1,time:10},origin,target,'area7','grenade:3').charges,0);
});
test('empty charges, range overflow, zero length, unknown IDs and malformed values reject',()=>{
 const m=model(),s={charges:3,time:0};
 for(const charges of[0,-1,4,1.5,NaN])assert.equal(m.proposeThrow({...s,charges},origin,target,'area7','g1'),null);
 for(const time of[-1,NaN,Infinity,Number.MAX_VALUE])assert.equal(m.proposeThrow({...s,time},origin,target,'area7','g1'),null);
 for(const aim of[origin,{x:8.000001,z:0},{x:Infinity,z:0},{x:1,z:0,extra:1},null])assert.equal(m.proposeThrow(s,origin,aim,'area7','g1'),null);
 assert.equal(m.proposeThrow(s,origin,target,'unknown','g1'),null);for(const bad of['',1,'__proto__'])assert.equal(m.proposeThrow(s,origin,target,'area7',bad),null);
 assert.equal(m.proposeThrow({...s,extra:0},origin,target,'area7','g1'),null);
});
test('active game fuse waits then emits a stable blast exactly at deadline with linear falloff',()=>{
 const m=model(),active=thrown(),targets=[victim('centre'),victim('half',9.5),victim('edge',11),victim('outside',12)];
 const before=m.proposeDetonation(active,10.999,'area7',targets);assert.deepEqual(before,{active,blast:null});assert.notEqual(before.active,active);assert.notEqual(before.active.position,active.position);
 assert.deepEqual(m.proposeDetonation(before.active,11,'area7',targets),{active:null,blast:{id:'grenade:1',areaId:'area7',position:target,hits:[{victimId:'centre',damage:60},{victimId:'half',damage:30}]}});
});
test('dead, obstructed/ineligible, foreign-area and empty targets produce no damage intents',()=>{
 const m=model(),active=thrown();assert.deepEqual(m.proposeDetonation(active,12,'area7',[]).blast.hits,[]);
 const targets=[victim('dead',8,{hp:0}),victim('wall',8,{eligible:false}),victim('other',8,{areaId:'westminster'})];assert.deepEqual(m.proposeDetonation(active,12,'area7',targets).blast.hits,[]);
});
test('travel clears intent before fuse; host consumes returned null, no late-area blast',()=>{
 const result=model().proposeDetonation(thrown(),10.1,'westminster',[]);assert.deepEqual(result,{active:null,blast:null});assert.equal(model().proposeDetonation(result.active,12,'area7',[]),null);
 assert.equal(model().proposeDetonation(thrown(),12,'unknown',[]),null);
});
test('duplicate victim IDs fail closed, including dead/ineligible duplicate rows',()=>{
 const m=model();for(const second of[victim('same'),victim('same',8,{hp:0}),victim('same',8,{eligible:false})])assert.equal(m.proposeDetonation(thrown(),11,'area7',[victim('same'),second]),null);
 for(const row of[victim('bad',8,{areaId:'unknown'}),victim('bad',8,{eligible:1}),victim('bad',NaN),victim('bad',8,{hp:-1}),victim('__proto__')])assert.equal(m.proposeDetonation(thrown(),11,'area7',[row]),null);
});
test('detonation never mutates active or targets; malformed active/time fail closed',()=>{
 const active=thrown(),targets=[victim('live')],before=structuredClone({active,targets});Object.freeze(active.position);Object.freeze(active);for(const t of targets){Object.freeze(t.position);Object.freeze(t);}Object.freeze(targets);
 const result=model().proposeDetonation(active,11,'area7',targets);assert.deepEqual({active,targets},before);assert.equal(targets[0].hp,100);result.blast.position.x=0;assert.equal(active.position.x,8);
 for(const bad of[null,{...active,id:''},{...active,areaId:'unknown'},{...active,detonateAt:Infinity},{...active,detonateAt:0},{...active,extra:1}])assert.equal(model().proposeDetonation(bad,11,'area7',[]),null);
 for(const time of[-1,NaN,Infinity])assert.equal(model().proposeDetonation(active,time,'area7',[]),null);
});
