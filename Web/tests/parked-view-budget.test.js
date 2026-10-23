import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as THREE from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';import {createActors,finisherPresentationAge} from '../src/actors.js';import {createGame,enemy} from '../src/combat.js';
import {relieveGeometryBudget,protectedAreas} from '../src/engine/parked-view-budget.js';
const AREAS=['westminster','east','south','central-hub','a5','a6','a7','a8','a9'],MB=1024*1024;
// Fake actors that park `bytes` of finisher geometry per visited area, in the order they were left.
function fakeActors(budget=128*MB,bytes=40*MB){
 const parked=new Map();
 return{parked,park(id){parked.delete(id);parked.set(id,bytes);},discardArea(id){parked.delete(id);},
  areaViewStats(){return{parked:[...parked].map(([area])=>({area,count:3})),ownedFinisherGeometryBytes:[...parked.values()].reduce((a,b)=>a+b,0),finisherGeometryBudgetBytes:budget};}};
}
test('visiting nine areas over budget never fails: least recently parked areas are dropped',()=>{
 const actors=fakeActors(),state={urgent:null,tasks:new Map()},unready=[];let current='westminster';
 for(const next of AREAS.slice(1)){
  // Preparing `next` happens while `current` is still live; only afterwards is `current` parked.
  assert.doesNotThrow(()=>relieveGeometryBudget(actors,protectedAreas(state,current,next),id=>unready.push(id)),'travel to '+next);
  assert(actors.areaViewStats().ownedFinisherGeometryBytes<=128*MB);
  actors.park(current);current=next;
 }
 const kept=[...actors.parked.keys()];
 assert(kept.length>=3&&kept.length<=4,'about three areas fit the budget');
 assert.deepEqual(kept,AREAS.slice(AREAS.indexOf(kept[0]),8),'the most recently left areas stay, in order');
 assert(!kept.includes('westminster'),'oldest parked area went first');
 assert.equal(unready[0],'westminster','evicted areas are marked not ready so they rebuild through prepareAreaSteps');
});
test('current, target and in-flight areas are never evicted; throws only when still over budget',()=>{
 const actors=fakeActors(100*MB,60*MB);actors.park('east');actors.park('south');
 const state={urgent:'south',tasks:new Map([['central-hub',{status:'running'}],['a5',{status:'failed'}]])};
 const keep=protectedAreas(state,'westminster','east');
 assert.deepEqual([...keep].sort(),['central-hub','east','south','westminster']);
 assert.throws(()=>relieveGeometryBudget(actors,keep),/geometry budget exceeded/);
 assert.deepEqual([...actors.parked.keys()],['east','south']);
 assert.deepEqual(relieveGeometryBudget(actors,new Set(['westminster','east'])),['south']);
});
test('an in-budget area is untouched',()=>{const actors=fakeActors();actors.park('east');assert.deepEqual(relieveGeometryBudget(actors,new Set()),[]);assert(actors.parked.has('east'));});
test('corpse finisher age survives an evict-and-return of its area',async t=>{
 const read=p=>readFileSync(new URL('../public/assets/'+p,import.meta.url)),manifest=JSON.parse(read('manifest-hollow.json'));
 const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8Array([255,255,255,255])})})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const load=async name=>({description:manifest.models[name],gltf:await loadGeometry(read(manifest.models[name].url)),equipment:manifest.models[name].equipment?await loadGeometry(read(manifest.models[name].equipment.url)):null});
 const models=new Map([['vagrant',await load('vagrant')],['hollow-scavenger',await load('hollow-scavenger')]]);
 const world={areaId:'east',layout:{characterScale:1.265},toRender:({x,z})=>new THREE.Vector3(x,0,-z)},scene=new THREE.Scene(),actors=createActors(scene,world,{manifest,models,dispose(){}});t.after(()=>actors.dispose());
 const g=createGame(world,{pilot:'donor-knife',finishers:true});g.time=30;
 const corpse=Object.assign(enemy(7,{x:2,z:2}),{rig:'hollow-scavenger',hp:0,response:{clip:'Death',start:20,ticks:144},finisherPresentationAge:9.5});
 const record={enemies:[],corpses:[corpse]},stage={...world,scene:new THREE.Scene()};
 const build=()=>{for(const _ of actors.prepareAreaSteps('east',record,stage,g.finishers));};
 build();assert.deepEqual(actors.areaViewStats().parked,[{area:'east',count:1}]);
 actors.discardArea('east');assert.deepEqual(actors.areaViewStats().parked,[]);
 assert.equal(corpse.finisherPresentationAge,9.5,'age lives on the entity, not the view');
 build();assert.deepEqual(actors.areaViewStats().parked,[{area:'east',count:1}]);
 assert.equal(finisherPresentationAge(corpse,g.time),10,'elapsed 10s since death beats nothing lost; shown age 9.5 is never rewound');
 corpse.finisherPresentationAge=14;assert.equal(finisherPresentationAge(corpse,g.time),14);
});
