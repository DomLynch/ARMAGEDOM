import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as THREE from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';import {createActors} from '../src/actors.js';import {createGame,enemy} from '../src/combat.js';
const read=p=>readFileSync(new URL('../public/assets/'+p,import.meta.url));
const manifest=JSON.parse(read('manifest-hollow.json'));
const shim=t=>{const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8Array([255,255,255,255])})})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});};
const world={areaId:'westminster',layout:{characterScale:1.265},toRender:({x,z})=>new THREE.Vector3(x,0,-z)};
const hunterActor=()=>Object.assign(enemy(0,{x:1,z:1}),{rig:'hollow-scavenger',markedHunter:true,placementKey:'marked-hunter-test',hp:120,maxHP:120,moveSpeed:2.5,humanBodyRecipe:'human-gaunt-skulker'});
async function sources(withHunter){
 const entry=name=>loadGeometry(read(manifest.models[name].url)),equip=name=>loadGeometry(read(manifest.models[name].equipment.url));
 const models=new Map([['vagrant',{description:manifest.models.vagrant,gltf:await entry('vagrant'),equipment:await equip('vagrant')}],['hollow-scavenger',{description:manifest.models['hollow-scavenger'],gltf:await entry('hollow-scavenger'),equipment:await equip('hollow-scavenger')}]]);
 if(withHunter)models.set('marked-hunter',{description:manifest.models['marked-hunter'],gltf:await entry('marked-hunter')});
 return models;
}
test('the 6.6 MB hunter model is not part of the initial load',()=>{assert.equal(manifest.models['marked-hunter'].deferred,true);});
test('hunter arriving with its model loaded uses it',async t=>{
 shim(t);const g=createGame(world,{pilot:'donor-knife'}),h=hunterActor();g.enemies=[h];
 const actors=createActors(new THREE.Scene(),world,{manifest,models:await sources(true),dispose(){}});actors.update(g,0);
 assert.equal(actors.views.get(h.id).root.name,'marked-hunter');actors.dispose();
});
test('hunter arriving before its model loads uses the tinted scavenger and does not throw',async t=>{
 shim(t);const g=createGame(world,{pilot:'donor-knife'}),h=hunterActor();g.enemies=[h];
 const models=await sources(false),actors=createActors(new THREE.Scene(),world,{manifest,models,dispose(){}});
 assert.doesNotThrow(()=>actors.update(g,0));
 const view=actors.views.get(h.id);assert(view);assert.notEqual(view.root.name,'marked-hunter');assert.equal(h.rig,'hollow-scavenger');
 assert(view.materials.some(row=>row.material.color&&row.material.color.g<row.material.color.r),'hunter tint applied to the fallback');actors.dispose();
});
test('the hunter warning event starts the model load once and tolerates a failed load',async t=>{
 shim(t);const g=createGame(world,{pilot:'donor-knife'}),calls=[];
 const library={manifest,models:await sources(false),dispose(){},ensureModels(names){calls.push(names);return Promise.reject(Error('offline'));}},actors=createActors(new THREE.Scene(),world,library);
 g.events=[{type:'marked-hunter-warning',position:{x:0,z:0},seconds:5}];actors.events(g);await Promise.resolve();
 assert.deepEqual(calls,[['marked-hunter']]);g.events=[{type:'hit',amount:0}];actors.events(g);assert.equal(calls.length,1);actors.dispose();
});
