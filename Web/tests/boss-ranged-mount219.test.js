import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';import {createActors} from '../src/actors.js';import {disposeActorSources} from '../src/actor-resources.js';import {fixture} from './helpers/rifle-fixture.js';
const root=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest-hollow.json',root)));
test('actual two boss rigs reuse existing gun poses, and source refreshes live boss transform without a render',async t=>{
 const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const models=new Map(),sources=new Set();
 for(const id of ['vagrant','boss-south-nightborn','boss-butcher','player-shotgun','player-rocket-launcher']){const description=manifest.models[id],gltf=await loadGeometry(fs.readFileSync(new URL(description.url,root)));sources.add(gltf);const row={description,gltf};if(description.equipment){row.equipment=await loadGeometry(fs.readFileSync(new URL(description.equipment.url,root)));sources.add(row.equipment);}models.set(id,row);}
 const library={manifest,models,dispose:()=>disposeActorSources(sources)};
 for(const[areaId,rig]of [['south','boss-south-nightborn'],['elephant-and-castle','boss-butcher']]){
  const f=fixture({areaId}),g=f.g,e=g.enemies.find(e=>e.rig===rig);g.enemies=[e];e.pos={x:0,z:0};e.home={...e.pos};e.alerted=true;
  Object.assign(f.world,{toRender:(p,h=0)=>new T.Vector3(p.x,h,-p.z)});
  // Each actor owner clones materials/skeletons; source library remains shared.
  const actors=createActors(new T.Scene(),f.world,{...library,dispose(){}},{visualScale:1.3225});
  try{actors.update(g,0);const first=actors.bossRangedSource(g,e);assert(first);const view=actors.views.get(e.id);assert(view.bossGunPose.mount.visible);assert(view.bossGunPose.muzzle);
   e.pos.x+=1;e.facing={x:1,z:0};const fresh=actors.bossRangedSource(g,e),actual=view.bossGunPose.muzzle.getWorldPosition(new T.Vector3());assert.deepEqual(fresh,{x:actual.x,y:actual.y,z:actual.z});assert(Math.hypot(fresh.x-first.x,fresh.z-first.z)>.5,'query refreshes requested boss rather than stale cached pose');
   e.hp=0;actors.update(g,0);assert.equal(view.bossGunPose.mount.visible,false);
  }finally{actors.dispose();}
 }
 library.dispose();
});
