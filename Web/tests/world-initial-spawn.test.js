import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {createWorld} from '../src/world.js';import {createGeometry} from '../src/world-geometry.js';import {preparePrivateAreaContent} from '../src/engine/private-area-content.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
function rendering(){let textures=0;class Loader{async loadAsync(){textures++;return new T.Texture({width:1672,height:941});}}return{THREE:{...T,TextureLoader:Loader},scene:new T.Scene(),camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/',textures:()=>textures};}
for(const area of ['lambeth','elephant-and-castle','east-bridge','westminster'])test('normal configured startup resolves '+area+' spawn before texture allocation and in the actual world',async t=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>({ok:true,json:async()=>{const data=read('../public/'+new URL(url).pathname.slice(1));if(new URL(url).pathname==='/world/manifest.json')data.initialArea=area;return data;}});t.after(()=>{globalThis.fetch=original;});
 const options=rendering(),world=await createWorld(options);t.after(()=>world.dispose());const geometry=createGeometry(world.layout),entry=geometry.ground(world.registry.get(area).entry);
 assert.equal(world.areaId,area);assert.equal(options.textures(),1);assert(geometry.clear(world.spawn,.4));
 if(area==='westminster')assert.deepEqual(world.spawn,{x:0,z:-6});else{assert.equal(geometry.clear({x:0,z:-6},.4),false,'old hardcoded origin is blocked in actual target layout');assert.deepEqual(world.spawn,entry);}
});
test('private configured startup retains its existing origin',async t=>{
 const manifest=read('./fixtures/private-fourth/private-manifest.json');manifest.initialArea='fixture-westminster-annex';
 const content=preparePrivateAreaContent({areas:read('./fixtures/private-fourth/private-registry-rows.json'),manifest,residents:read('./fixtures/private-fourth/private-residents.json'),layouts:Object.fromEntries(['westminster','east','south'].map(id=>['layout.'+id,read('../public/world/'+id+'/layout.json')])),namespace:'armagedom:private:fourth-pilot:',textureBudgetBytes:32*1024*1024});
 const options=rendering(),world=await createWorld({...options,content});t.after(()=>world.dispose());assert.equal(world.areaId,'fixture-westminster-annex');assert.deepEqual(world.spawn,{x:0,z:-6});assert.equal(options.textures(),1);
});
