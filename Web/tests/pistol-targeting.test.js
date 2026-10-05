import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPistolTarget,selectCombatTarget} from '../src/pistol-targeting.js';
import {tracePistol,stepPistol,createPistolState,collectPistol} from '../src/pistol.js';

const position={x:0,z:0}, facing={x:0,z:1};
const direction=degrees=>({x:Math.sin(degrees*Math.PI/180),z:Math.cos(degrees*Math.PI/180)});
const target=(id,degrees=0,distance=4,extra={})=>{
  const d=direction(degrees);
  return {id,pos:{x:d.x*distance,z:d.z*distance},hp:40,radius:.4,...extra};
};
const select=(targets,extra={})=>selectPistolTarget({position,facing,targets,lineClear:()=>true,...extra});
const melee=(targets,extra={})=>selectCombatTarget({position,facing,targets,lineClear:()=>true,range:2,...extra});

test('shared melee policy includes45 degree edges but not outside, side or rear',()=>{
  for(const angle of [-45,45]) assert.equal(melee([target('edge',angle,1)]).targetId,'edge');
  for(const angle of [-45.001,45.001,-90,90,180]) assert.equal(melee([target('outside',angle,1)]),null);
});
test('shared ranking chooses alignment before distance and breaks ties deterministically',()=>{
  assert.equal(melee([target('close',40,.5),target('aligned',2,1.9)]).targetId,'aligned');
  assert.equal(melee([target('far',-20,1.9),target('near',20,1)]).targetId,'near');
  const tied=[target('b',20,1),target('a',-20,1)];
  assert.equal(melee(tied).targetId,'a');assert.equal(melee([...tied].reverse()).targetId,'a');
});
test('shared selection rejects dead, hidden, foreign-area, blocked and beyond weapon reach',()=>{
  const bad=[target('dead',0,1,{hp:0}),target('hidden',0,1,{visible:false}),
    target('foreign',0,1,{areaId:'east'}),target('far',0,2.001),target('blocked',0,1.8)];
  const extra={areaId:'westminster',lineClear:(_a,b)=>b.z<1.7};
  assert.equal(melee(bad,extra),null);
  assert.equal(melee([...bad,target('valid',20,1,{areaId:'westminster'})],extra).targetId,'valid');
  assert.equal(melee([target('boundary',0,2)]).targetId,'boundary');
});
test('shared selector requires finite positive reach and a strictly forward cone',()=>{
  for(const range of [undefined,0,-1,NaN,Infinity]) assert.equal(melee([target('front',0,1)],{range}),null);
  for(const coneDegrees of [-1,90,180,NaN,Infinity]) assert.equal(melee([target('front',0,1)],{coneDegrees}),null);
  assert.equal(melee([target('front',0,1)],{coneDegrees:0}).targetId,'front');
  assert.equal(selectCombatTarget(),null);
});
test('shared selection follows current explicit intent with no retained lock or enemy tracking',()=>{
  const targets=[target('old',0,1),target('new',30,1)];
  assert.equal(melee(targets).targetId,'old');
  const out=melee(targets,{aim:direction(30),retainedTargetId:'old'});
  assert.equal(out.targetId,'new');
  const committed={...out.direction};targets[1].pos={x:-1,z:0};
  assert.deepEqual(out.direction,committed);
  assert.equal(melee(targets,{aim:direction(180),retainedTargetId:'old'}),null);
  assert.equal(melee(targets,{aim:{x:0,z:0}}),null);
});
test('shared selector respects weapon-supplied potential reach without changing target/body state',()=>{
  const targets=[target('potential',15,2.4)];Object.freeze(targets[0].pos);Object.freeze(targets[0]);Object.freeze(targets);
  assert.equal(melee(targets),null);
  assert.equal(melee(targets,{range:2.5}).targetId,'potential');
  assert.equal(targets[0].hp,40);assert.equal(targets[0].radius,.4);
});
test('pistol resolves new12 degree candidate each call when caller supplies no retention',()=>{
  const targets=[target('old',0,4),target('new',10,4)];
  assert.equal(select(targets).targetId,'old');
  assert.equal(select(targets,{aim:direction(10)}).targetId,'new');
  assert.equal(select([target('outside',15)]),null);
  assert.equal(select([target('far',0,19)],{range:100,coneDegrees:45}),null);
});

test('front target resolves a normalized direction from player position',()=>{
  const out=selectPistolTarget({position:{x:2,z:3},facing:{x:0,z:10},
    targets:[{...target('front'),pos:{x:2,z:7}}],lineClear:()=>true});
  assert.deepEqual(out,{targetId:'front',direction:facing});
});
test('acquisition includes both 12 degree edges, excludes beyond and rear',()=>{
  for(const angle of [-12,12]) assert.equal(select([target('edge',angle)]).targetId,'edge');
  for(const angle of [-12.001,12.001,-90,90,180]) assert.equal(select([target('outside',angle)]),null);
});
test('alignment wins over proximity; proximity breaks equal alignment',()=>{
  assert.equal(select([target('near',10,1),target('aligned',0,17)]).targetId,'aligned');
  assert.equal(select([target('far',-10,8),target('near',10,3)]).targetId,'near');
});
test('equal candidates have stable ID ordering independent of target array order',()=>{
  const targets=[target('b',10),target('a',-10)];
  assert.equal(select(targets).targetId,'a');
  assert.equal(select([...targets].reverse()).targetId,'a');
});
test('retention prevents flicker even when another target is better aligned or closer',()=>{
  for(const angle of [5,12,15,-18,18]) {
    assert.equal(select([target('held',angle,10),target('new',0,1)],
      {retainedTargetId:'held'}).targetId,'held');
  }
});
test('retention releases beyond 18 degrees and never tracks a rear target',()=>{
  for(const angle of [-18.001,18.001,90,180]) {
    assert.equal(select([target('held',angle),target('front')],
      {retainedTargetId:'held'}).targetId,'front');
  }
});
test('deliberate turn reacquires against new intent instead of stale retention',()=>{
  const targets=[target('old',0),target('new',15)];
  assert.equal(select(targets,{aim:direction(15),retainedTargetId:'old'}).targetId,'old');
  assert.equal(select(targets,{aim:direction(15),retainedTargetId:'old',switchTarget:true}).targetId,'new');
  assert.equal(select([target('old',15)],{retainedTargetId:'old',switchTarget:true}),null);
});
test('explicit intent overrides facing; zero or invalid explicit aim cannot fall back',()=>{
  assert.equal(select([target('right',90)],{aim:{x:7,z:0}}).targetId,'right');
  for(const aim of [{x:0,z:0},{x:NaN,z:1},{x:Infinity,z:1}]) assert.equal(select([target('front')],{aim}),null);
  assert.equal(select([target('front')],{aim:null}).targetId,'front');
});
test('dead, hidden, out-of-range or blocked retained targets release to visible alternative',()=>{
  for(const held of [target('held',0,4,{hp:0}),target('held',0,4,{visible:false}),target('held',0,18.001)]) {
    assert.equal(select([held,target('next',10)],{retainedTargetId:'held'}).targetId,'next');
  }
  const lineClear=(_a,b)=>b.z<5;
  assert.equal(select([target('held',0,8),target('next',10,3)],
    {retainedTargetId:'held',lineClear}).targetId,'next');
});
test('range uses inclusive 18m target center and overlapping/invalid candidates are ignored',()=>{
  assert.equal(select([target('edge',0,18)]).targetId,'edge');
  const invalid=[target('overlap',0,0),target('far',0,18.001),target('nan',0,4,{hp:NaN}),
    target('infinite',0,4,{hp:Infinity}),target('badpos',0,4,{pos:{x:NaN,z:4}}),target(null),null];
  assert.equal(select(invalid),null);
});
test('missing or invalid position/intent/LOS fails closed; no targets returns null',()=>{
  for(const extra of [{position:null},{position:{x:Infinity,z:0}},{facing:null},
    {lineClear:undefined},{lineClear:()=>false}]) assert.equal(select([target('front')],extra),null);
  assert.equal(select([]),null);assert.equal(selectPistolTarget(),null);
});
test('selector preserves frozen input and carries no weapon/ammo writes',()=>{
  const targets=[target('front')];Object.freeze(targets[0].pos);Object.freeze(targets[0]);Object.freeze(targets);
  Object.freeze(position);Object.freeze(facing);
  const before=JSON.stringify(targets);
  assert.deepEqual(Object.keys(select(targets)).sort(),['direction','targetId']);
  assert.equal(JSON.stringify(targets),before);
});
test('resolved direction still obeys existing first-hit and Fire/ammo authority',()=>{
  const targets=[target('near',0,2),target('selected',0,7)];
  const selected=select(targets,{retainedTargetId:'selected'});
  assert.equal(selected.targetId,'selected');
  assert.equal(tracePistol(position,selected.direction,targets,()=>true).targetId,'near');
  const state=collectPistol(createPistolState({pickupPos:position}),{areaId:'westminster',position}).state;
  const input={time:0,position,aim:selected.direction,targets,lineClear:()=>true};
  assert.equal(stepPistol(state,input).state.magazine,6);
  const fired=stepPistol(state,{...input,fire:true});
  assert.equal(fired.state.magazine,5);assert.equal(fired.events[0].targetId,'near');
});
