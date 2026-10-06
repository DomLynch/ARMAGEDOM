import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';import {createActors} from '../src/actors.js';import {disposeActorSources} from '../src/actor-resources.js';import {createGame,stepGame,attack} from '../src/combat.js';
const publicRoot=new URL('../public/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets/manifest-hollow.json',publicRoot)));
test('existing actor Low contact hits actual rigid drone frame, misses far body, and owns lifecycle',async t=>{
 const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const description=manifest.models.vagrant,gltf=await loadGeometry(fs.readFileSync(new URL('assets/'+description.url,publicRoot))),equipment=await loadGeometry(fs.readFileSync(new URL('assets/'+description.equipment.url,publicRoot)));
 const world={areaId:'westminster',layout:{characterScale:1.265},spawn:{x:0,z:0},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,geometry:{clear:()=>true,lineClear:()=>true},toRender:(p,h=0)=>new T.Vector3(p.x,h,-p.z)};
 const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
 const actors=createActors(new T.Scene(),world,{manifest,models:new Map([['vagrant',{description,gltf,equipment}]]),dispose:()=>disposeActorSources(new Set([gltf,equipment]))},{visualScale:1.3225});t.after(()=>actors.dispose());
 for(const gap of [.95,4.5]){
  const g=createGame(world,{pilot:'donor-knife',encounter,drone:true,areaResidents:true,openingGroup:false}),e=g.enemies.find(e=>e.rig==='low-hover-drone');g.enemies=[e];Object.assign(e,{pos:{x:0,z:gap},home:{x:0,z:gap},recoverUntil:100});actors.reset();actors.update(g,0);g.ratContact=actors.ratContact();assert.equal(actors.views.get(e.id).root.scale.x,1);attack(g,'slash',{x:0,z:1});
  for(let i=0;i<54;i++){stepGame(g);actors.update(g,1/60);}
  assert.equal(e.hp,gap===.95?10:20);actors.reset();assert.equal(actors.views.size,0);
 }
});
