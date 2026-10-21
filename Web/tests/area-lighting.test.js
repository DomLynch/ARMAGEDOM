import {privateLayout} from './helpers/private-layout.js';
import {createBrowserSession} from '../src/engine/browser-session.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {validateAreaLighting,applyAreaLighting,DEFAULT_LIGHTING} from '../src/engine/area-lighting.js';
import {preparePrivateAreaContent} from '../src/engine/private-area-content.js';
import {createWorld} from '../src/world.js';
import {createGame} from '../src/combat.js';
import {createHollowEncounter} from '../src/hollow-encounter.js';
import {createAreaLifecycle} from '../src/engine/areas.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const id='fixture-westminster-annex';
function fixture(){return {areas:read('./fixtures/private-fourth/private-registry-rows.json'),manifest:read('./fixtures/private-fourth/private-manifest.json'),residents:read('./fixtures/private-fourth/private-residents.json'),layouts:Object.fromEntries(['westminster','east','south'].map(id=>['layout.'+id,privateLayout(read('../public/world/'+id+'/layout.json'))])),namespace:'armagedom:private:lighting-proof:',textureBudgetBytes:32*1024*1024,lighting:{presets:{'current-default':{fillIntensity:1.6,keyIntensity:2.3},'private-dim':{fillIntensity:.55,keyIntensity:1.2}},areas:{westminster:'current-default',[id]:'private-dim'}}};}
function lights(){const scene=new T.Scene();scene.add(new T.HemisphereLight(0xb9bec9,0x4b3828,1.6),new T.DirectionalLight(0xffd7a0,2.3),new T.PointLight(0xd4c7a5,3.2,5,2));return scene;}
const values=scene=>scene.children.filter(l=>l.isLight).map(l=>l.intensity);
test('public named defaults retain current intensities; layout compatibility fields do not select lighting',()=>{
 const content=read('../public/world/area-content.json'),registry={ids:Object.keys(content.lighting.areas),has:id=>Object.hasOwn(content.lighting.areas,id)};
 const resolved=validateAreaLighting(content.lighting,registry);for(const id of registry.ids)assert.deepEqual(resolved[id],DEFAULT_LIGHTING);
 const s=lights(),fog=s.fog,colors=s.children.map(l=>l.color.getHex());applyAreaLighting(s,{areaId:'westminster',layout:{fillIntensity:.55,keyIntensity:1.2}});assert.deepEqual(values(s),[1.6,2.3,3.2]);assert.equal(s.fog,fog);assert.deepEqual(s.children.map(l=>l.color.getHex()),colors);
});
test('private invalid refs, fields, ranges and fog presets reject at intake',()=>{
 for(const change of [c=>c.lighting.areas[id]='unknown',c=>c.lighting.areas.unknown='private-dim',c=>c.lighting.presets['private-dim'].fog=true,c=>c.lighting.presets['private-dim'].keyIntensity=Infinity,c=>c.lighting.presets['private-dim'].fillIntensity=-1,c=>c.lighting.presets['private-dim'].keyIntensity=4.01,c=>c.lighting.extra=true]){const c=fixture();change(c);assert.throws(()=>preparePrivateAreaContent(c),/lighting/);}
 const input=fixture(),accepted=preparePrivateAreaContent(input);input.lighting.presets['private-dim'].keyIntensity=4;assert.equal(accepted.lighting[id].keyIntensity,1.2);assert(Object.isFrozen(accepted.lighting[id]));
});
test('actual private World and lifecycle apply target lights during warm draw and activation without changing active lights during preparation',async t=>{
 const content=preparePrivateAreaContent(fixture());class Loader{async loadAsync(){return new T.Texture({width:64,height:64});}}
 const scene=lights(),camera=new T.PerspectiveCamera(),world=await createWorld({THREE:{...T,TextureLoader:Loader},scene,camera,baseUrl:'https://fixture.invalid/',content});t.after(()=>world.dispose());
 const warmed=[];let target=null;const renderer={compileAsync:async()=>{},getRenderTarget:()=>target,setRenderTarget:v=>target=v,getScissorTest:()=>false,setScissorTest(){},getViewport:v=>v.set(0,0,800,600),setViewport(){},getScissor:v=>v.set(0,0,800,600),setScissor(){},render(s){if(s!==scene){warmed.push({prepared:values(s),active:values(scene),activeArea:world.areaId});}},getContext:()=>({SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,fenceSync:()=>({}),flush(){},clientWaitSync:()=>2,deleteSync(){}})};
 const actors={bindPreparedArea(){},areaViewStats:()=>({parked:[],ownedFinisherGeometryBytes:0,finisherGeometryBudgetBytes:1}),prepareAreaSteps:function*(){},discardArea(){},parkArea(){},activateArea(){},update(){},ratContact:()=>null};
 const game=createGame(world,{pilot:'donor-knife',areaResidents:true,openingGroup:false,residentPlacements:content.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 const oldRAF=globalThis.requestAnimationFrame,oldIdle=globalThis.requestIdleCallback,oldW=globalThis.innerWidth,oldH=globalThis.innerHeight;globalThis.requestAnimationFrame=cb=>queueMicrotask(cb);globalThis.requestIdleCallback=cb=>queueMicrotask(()=>cb({timeRemaining:()=>50}));globalThis.innerWidth=800;globalThis.innerHeight=600;t.after(()=>{globalThis.requestAnimationFrame=oldRAF;globalThis.requestIdleCallback=oldIdle;globalThis.innerWidth=oldW;globalThis.innerHeight=oldH;});
 const lifecycle=createAreaLifecycle({world,game,actors,renderer,scene,camera,traveling:true,loaded:true,contextLost:false,input:{clear(){}},effects:{reset(){}},hud:{update(){}},resetClock(){},cancelPistol(){}});t.after(()=>lifecycle.stop());
 await lifecycle.prepare(id);assert.equal(warmed.length,0,'announced-entry CPU preparation never draws inactive graphics');assert.deepEqual(values(scene),[1.6,2.3,3.2]);assert.equal(world.cachedArea(id).scene.children.filter(l=>l.isLight).length,0);
 assert.equal(await lifecycle.activate({areaId:id,entryPoint:world.manifest.entries[id]}),true);assert(warmed.some(v=>JSON.stringify(v.prepared)==='[0.55,1.2,3.2]'));for(const v of warmed)assert.deepEqual(v.active,[1.6,2.3,3.2]);assert.deepEqual(values(scene),[.55,1.2,3.2]);lifecycle.stop();
});

test('unsupported private lighting rejects before browser storage, DOM or texture startup',t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let reads=0;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){reads++;throw Error('Unexpected storage IO');}});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;});
 const input=fixture();input.lighting.areas[id]='unsupported';assert.throws(()=>createBrowserSession({privateContent:input}),/lighting/);assert.equal(reads,0);
});
