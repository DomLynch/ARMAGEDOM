import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import * as T from'three';
import{loadGeometry}from'../../art/donor/probe.mjs';import{disposeActorSources}from'../src/actor-resources.js';import{createGame,enemy}from'../src/combat.js';
const{createActors}=await import(process.env.ACTORS_MODULE_URL??new URL('../src/actors.js',import.meta.url));
const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest-hollow.json',base))),profile=JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url))).bosses.profiles.witch;
const delta=(a,b)=>Math.max(...a.elements.map((x,i)=>Math.abs(x-b.elements[i])));
function relative(view){view.model.updateWorldMatrix(true,true);return view.model.getObjectByName('hand_r').matrixWorld.clone().invert().multiply(view.flameMount.matrixWorld);}
test('actual Witch held Ember survives first-frame hurt, stagger, recovery and patrol without overriding native Hit; dead hides it',async t=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old;});
 const models=new Map();for(const name of['vagrant','boss-westminster-witch','player-flamethrower']){const description=manifest.models[name];models.set(name,{description,gltf:await loadGeometry(fs.readFileSync(new URL(description.url,base))),equipment:description.equipment?await loadGeometry(fs.readFileSync(new URL(description.equipment.url,base))):null});}
 const sources=new Set([...models.values()].flatMap(m=>[m.gltf,m.equipment].filter(Boolean)));t.after(()=>disposeActorSources(sources));
 function fixture(armed){const scene=new T.Scene(),world={areaId:'westminster',layout:{characterScale:1.265},spawn:{x:0,z:0},geometry:{clear:()=>true,lineClear:()=>true},lineClear:()=>true,toRender:(p,h=0)=>new T.Vector3(p.x,h,-p.z),camera:new T.PerspectiveCamera()};const actors=createActors(scene,world,{models,manifest,dispose(){}}),g=createGame(world,{pilot:'donor-knife'}),e=Object.assign(enemy(0,{x:0,z:1.5}),{rig:'boss-westminster-witch',weapon:'knife',hp:120,bodyScale:1,combatScale:1,placementKey:'boss-witch-v1',bossProfile:armed?profile:{...profile,weapon:undefined},home:{x:0,z:1.5},recoverUntil:0,staggerUntil:0});g.enemies=[e];t.after(()=>actors.dispose());return{actors,g,e};}
 const held=fixture(true),native=fixture(false);let binding;
 for(const c of[
  {name:'first-frame-Hit',time:1.05,stagger:2,recover:0,response:{clip:'Hit',start:1,ticks:18},aim:false},
  {name:'stagger-Hit-motion',time:1.15,stagger:2,recover:0,response:{clip:'Hit',start:1,ticks:18},aim:false},
  {name:'recovery',time:2.1,stagger:0,recover:3,response:{clip:'Hit',start:2,ticks:18},aim:false},
  {name:'ready-idle',time:4,stagger:0,recover:0,aim:true},
  {name:'hurt-after-ready',time:4.1,stagger:5,recover:0,response:{clip:'Hit',start:4,ticks:18},aim:false},
  {name:'ready-patrol',time:6,stagger:0,recover:0,move:true,aim:true},
 ]){
  for(const f of[held,native]){f.g.time=c.time;Object.assign(f.e,{staggerUntil:c.stagger,recoverUntil:c.recover,response:c.response??null});if(c.move)f.e.pos.x+=.1;f.actors.update(f.g,1/60,0,{presentationDt:1/60});}
  const v=held.actors.views.get(held.e.id),n=native.actors.views.get(native.e.id);assert(v.flameMount?.visible,c.name+' living weapon remains visible');assert.equal(v.flameMount.parent,v.model,c.name+' existing owner retained');assert.equal(v.knife.visible,false);const now=relative(v);if(!binding||c.aim)binding=now;else assert(delta(binding,now)<1e-7,c.name+' exact native hand-relative attachment');
  const bones=['upperarm_r','lowerarm_r','hand_r'];if(!c.aim)for(const bone of bones)assert(delta(v.model.getObjectByName(bone).matrix,n.model.getObjectByName(bone).matrix)<1e-8,c.name+' preserves native '+bone+' rather than aim IK');else assert(bones.some(bone=>delta(v.model.getObjectByName(bone).matrix,n.model.getObjectByName(bone).matrix)>.01),c.name+' ordinary ready IK still applies');
  assert(v.flameMount.matrix.elements.every(Number.isFinite));
 }
 held.e.hp=0;held.g.time=7;held.actors.update(held.g,1/60);assert.equal(held.actors.views.get(held.e.id).flameMount.visible,false,'dead weapon remains hidden');
});
