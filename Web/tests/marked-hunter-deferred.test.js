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
test('a live hunter built from the stand-in is rebuilt with its own model once that model has loaded',async t=>{
 shim(t);const g=createGame(world,{pilot:'donor-knife'}),h=hunterActor();g.enemies=[h];
 const models=await sources(false),late=await sources(true),actors=createActors(new THREE.Scene(),world,{manifest,models,dispose(){}});
 actors.update(g,0);const first=actors.views.get(h.id);assert.notEqual(first.root.name,'marked-hunter');
 actors.update(g,0);assert.equal(actors.views.get(h.id),first,'no rebuild while the model is still missing');
 models.set('marked-hunter',late.get('marked-hunter'));const pos={...h.pos};actors.update(g,0);
 const view=actors.views.get(h.id);assert.notEqual(view,first);assert.equal(view.root.name,'marked-hunter');assert.equal(view.entity,h);assert.deepEqual(h.pos,pos);
 actors.update(g,0);assert.equal(actors.views.get(h.id),view,'rebuilt once only');actors.dispose();
});
test('a dead hunter keeps the view it was killed in',async t=>{
 shim(t);const g=createGame(world,{pilot:'donor-knife'}),h=hunterActor();g.enemies=[h];
 const models=await sources(false),late=await sources(true),actors=createActors(new THREE.Scene(),world,{manifest,models,dispose(){}});
 actors.update(g,0);const first=actors.views.get(h.id);h.hp=0;models.set('marked-hunter',late.get('marked-hunter'));actors.update(g,0);
 assert.equal(actors.views.get(h.id),first);actors.dispose();
});
test('the model load starts once when the player first holds marked money, before any warning',async t=>{
 shim(t);const g=createGame({...world,markedData:{hunterBounty:1}},{pilot:'donor-knife'}),calls=[];
 const library={manifest,models:await sources(false),dispose(){},ensureModels(names){calls.push(names);return Promise.resolve();}},actors=createActors(new THREE.Scene(),world,library);
 g.marked={version:1,carried:0,bank:0,bounty:0};actors.update(g,0);assert.equal(calls.length,0);
 g.marked.carried=5;actors.update(g,0);assert.deepEqual(calls,[['marked-hunter']]);
 g.marked.bounty=9;actors.update(g,0);assert.equal(calls.length,1);actors.dispose();
});
test('hunters off: holding cash or a bounty never requests the hunter model',async t=>{
 shim(t);const g=createGame({...world,markedData:{hunterBounty:1,hunters:false}},{pilot:'donor-knife'}),calls=[];
 const library={manifest,models:await sources(false),dispose(){},ensureModels(names){calls.push(names);return Promise.resolve();}},actors=createActors(new THREE.Scene(),world,library);
 g.marked={version:1,carried:100,bank:0,bounty:500};actors.update(g,0);actors.update(g,0);assert.equal(calls.length,0);actors.dispose();
});
