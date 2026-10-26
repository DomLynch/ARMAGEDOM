import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {createWorld} from '../src/world.js';import {createAtmosphere} from '../src/atmosphere.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../public/'+p,import.meta.url)));
test('actual world loads public mixed resident/effect data once, freezes geometry and prepares new area through the same loader',async t=>{
 const requests=[],original=globalThis.fetch;globalThis.fetch=async url=>{const p=new URL(url).pathname.slice(1);requests.push(p);return{ok:true,json:async()=>read(p)};};t.after(()=>{globalThis.fetch=original;});const textureRequests=[];class Loader{async loadAsync(url){textureRequests.push(String(url));return new T.Texture({width:1672,height:941});}}
 const scene=new T.Scene(),w=await createWorld({THREE:{...T,TextureLoader:Loader},scene,camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/'});t.after(()=>w.dispose());assert.equal(w.reaperData?.itemId,'watchmans-pistol-v1');assert.equal(w.reaperData?.rules.damage,6);assert.equal(w.bossEquipmentData.commanderPistol.weaponKey,'railgun');assert.equal(w.bossEquipmentData.commanderPistol.rules.range,4.5);assert.equal(w.residentPlacements['east-bridge'][1].foundationRef,'original-rat');assert(Object.isFrozen(w.residentPlacements['east-bridge']));const layoutRequests=requests.filter(p=>p.endsWith('/layout.json')).length;assert.equal(w.registry.ids.length,9);assert.equal(layoutRequests,1);assert.equal(textureRequests.length,1,'only the starting-area backdrop is loaded initially');
 const stage=await w.prepareArea('east-bridge');assert(Object.isFrozen(stage.layout));assert.equal(w.validatedLayouts,null);assert.equal(stage.residentPlacements,w.residentPlacements);assert.equal(stage.reaperData,w.reaperData);assert.equal(stage.reaperData.rules.boltSpeed,8);assert.equal(requests.filter(p=>p.endsWith('/layout.json')).length,2);assert.equal(textureRequests.length,2,'one explicitly prepared destination adds only one backdrop');
 await w.loadArea('east-bridge');const atmo=createAtmosphere({THREE:T,scene,world:w});t.after(()=>atmo.dispose());atmo.update(0,{paused:true});assert.equal(atmo.stats().quads,10);assert.equal(atmo.stats().drawCalls,3);assert.equal(atmo.stats().textureBytes,0);assert.equal(atmo.stats().area,'east-bridge');
});
test('malformed loaded content rejects before allocating the initial texture or a live Game',async t=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>{const p=new URL(url).pathname.slice(1);return{ok:true,json:async()=>{const data=read(p);if(p.endsWith('area-content.json'))data.residents['east-bridge'][1].foundationRef='missing';return data;}};};t.after(()=>{globalThis.fetch=original;});let textures=0;class Loader{async loadAsync(){textures++;return new T.Texture();}}
 await assert.rejects(createWorld({THREE:{...T,TextureLoader:Loader},scene:new T.Scene(),camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/'}),/Unknown creature foundation/);assert.equal(textures,0);
});

test('unrelated unavailable layouts do not prevent startup; failed destination validation preserves the active world',async t=>{
 const original=globalThis.fetch,requests=[];let broken=false;
 globalThis.fetch=async url=>{const p=new URL(url).pathname.slice(1);requests.push(p);if(p.endsWith('/layout.json')&&!p.includes('/westminster/')&&!p.includes('/east/'))return{ok:false,status:404};return{ok:true,json:async()=>{const data=read(p);if(broken&&p.includes('/east/layout.json'))data.road=[];return data;}};};t.after(()=>{globalThis.fetch=original;});
 let textures=0;class Loader{async loadAsync(){textures++;return new T.Texture({width:1672,height:941});}}
 const w=await createWorld({THREE:{...T,TextureLoader:Loader},scene:new T.Scene(),camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/'});t.after(()=>w.dispose());
 assert.deepEqual(requests.filter(p=>p.endsWith('/layout.json')),['world/westminster/layout.json']);const group=w.group,camera=w.camera.projectionMatrix.clone(),geometry=w.geometry;broken=true;
 await assert.rejects(w.prepareArea('east'));assert.equal(textures,1);assert.equal(w.areaId,'westminster');assert.equal(w.group,group);assert.equal(w.geometry,geometry);assert.deepEqual(w.camera.projectionMatrix.elements,camera.elements);assert.deepEqual(w.preparationStats().pending,[]);assert.equal(w.preparationStats().retainedLayouts,1);
 broken=false;await w.prepareArea('east');assert.equal(textures,2);assert.equal(w.preparationStats().retainedLayouts,2);
 await assert.rejects(w.prepareArea('south'),/HTTP 404/);assert.equal(textures,2);
});
test('starting resident geometry rejects before texture allocation',async t=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>{const p=new URL(url).pathname.slice(1);return{ok:true,json:async()=>{const data=read(p);if(p.endsWith('area-content.json')){const row=structuredClone(data.residents['east-bridge'][1]);row.key='bad-start';row.pos={x:1e5,z:0};row.patrol=[{x:1e5,z:0},{x:1e5,z:1}];data.residents.westminster=[row];}return data;}};};t.after(()=>{globalThis.fetch=original;});let textures=0;class Loader{async loadAsync(){textures++;return new T.Texture();}}
 await assert.rejects(createWorld({THREE:{...T,TextureLoader:Loader},scene:new T.Scene(),camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/'}));assert.equal(textures,0);
});
