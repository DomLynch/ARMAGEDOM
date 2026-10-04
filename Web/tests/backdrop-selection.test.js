import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import * as THREE from 'three';import {createWorld} from '../src/world.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base))),layout=JSON.parse(readFileSync(new URL('westminster/layout.json',base)));
test('world uses explicit per-area backdrop selection through initial and atomic loads',async()=>{
 const oldFetch=globalThis.fetch,oldLoad=THREE.TextureLoader.prototype.loadAsync,urls=[];
 const selected={...manifest,backdrops:{westminster:'backdrop.webp',south:'backdrop.webp',east:'backdrop.webp'}};
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).endsWith('manifest.json')?selected:layout});
 THREE.TextureLoader.prototype.loadAsync=async url=>{urls.push(String(url));return new THREE.Texture();};let world;
 try{world=await createWorld({THREE,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),baseUrl:'http://test/'});await world.loadArea('south',{x:.52,y:.78});await world.loadArea('east',{x:.52,y:.78});assert.deepEqual(urls,['http://test/world/westminster/backdrop.webp','http://test/world/south/backdrop.webp','http://test/world/east/backdrop.webp']);}
 finally{world?.dispose();globalThis.fetch=oldFetch;THREE.TextureLoader.prototype.loadAsync=oldLoad;}
});
test('selected assets have accurate runtime hashes and preserve original PNGs',()=>{
 for(const area of ['westminster','south','east']){
  assert.equal(manifest.backdrops?.[area],'backdrop.webp');
  const file=manifest.files.find(x=>x.path===`${area}/backdrop.webp`);assert.ok(file);
  const bytes=readFileSync(new URL(file.path,base));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  assert.ok(readFileSync(new URL(`${area}/backdrop.png`,base)).length>bytes.length);
 }
});
