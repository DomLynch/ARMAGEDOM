import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {LondonWorld} from '../src/world.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
const layouts=Object.fromEntries(['westminster','east','south'].map(id=>[id,JSON.parse(readFileSync(new URL(`${id}/layout.json`,base)))]));
function fixture(t,{defer=false}={}){
 const requests=[],textures=[],originalFetch=globalThis.fetch;let release;
 globalThis.fetch=async url=>{const id=new URL(url).pathname.split('/').at(-2);requests.push(id);return{ok:true,json:async()=>layouts[id]};};
 t.after(()=>{globalThis.fetch=originalFetch;});
 const texture=()=>{const tex=new T.Texture({width:1672,height:941});tex.releases=0;tex.addEventListener('dispose',()=>tex.releases++);textures.push(tex);return tex;};
 class Loader{async loadAsync(){const tex=texture();if(defer)await new Promise(resolve=>{release=resolve;});return tex;}}
 const scene=new T.Scene(),world=new LondonWorld({THREE:{...T,TextureLoader:Loader},scene,camera:new T.PerspectiveCamera(),layout:layouts.westminster,texture:texture(),manifest,baseUrl:'https://example.invalid/'});
 t.after(()=>world.dispose());return{world,scene,requests,textures,release:()=>release()};
}
test('prepared and warm-return worlds retain owned textures, collision and GPU readiness without rebuilding',async t=>{
 const {world,scene,requests,textures}=fixture(t);await world.prepareArea('westminster');world.markAreaReady('westminster');
 const original=world.group,east=await world.prepareArea('east');world.markAreaReady('east');
 await world.loadArea('east');assert.equal(world.group,east.group);assert.equal(world.group.parent,scene);assert.equal(textures[0].releases,0);
 await world.loadArea('westminster');assert.equal(world.group,original);assert.equal(world.isAreaReady('westminster'),true);assert(world.geometry.clear(world.spawn,.4));
 await world.loadArea('east');assert.deepEqual(requests,['east']);assert.equal(textures.length,2);world.dispose();assert.deepEqual(textures.map(x=>x.releases),[1,1]);assert.equal(scene.children.length,0);
});
test('concurrent preparation decodes once and disposal releases a late texture without installing it',async t=>{
 const {world,scene,requests,textures,release}=fixture(t,{defer:true}),a=world.prepareArea('east'),b=world.prepareArea('east');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,1);assert.equal(world.areaId,'westminster');assert.equal(world.group.parent,scene);
 world.dispose();release();const results=await Promise.allSettled([a,b]);assert(results.every(x=>x.status==='rejected'));assert.deepEqual(textures.map(x=>x.releases),[1,1]);assert.equal(scene.children.length,0);
});
test('blocked or unknown entry leaves the active camera, collision and stage intact',async t=>{
 const {world,scene,textures}=fixture(t),group=world.group,geometry=world.geometry,matrix=world.camera.projectionMatrix.clone();
 await assert.rejects(world.loadArea('east',{x:0,y:0}),/blocked/);await assert.rejects(world.prepareArea('fourth'),/Unknown/);
 assert.equal(world.areaId,'westminster');assert.equal(world.group,group);assert.equal(world.geometry,geometry);assert.equal(group.parent,scene);assert.deepEqual(world.camera.projectionMatrix.elements,matrix.elements);assert.equal(textures[0].releases,0);
 await world.prepareArea('south');const stats=world.preparationStats();assert.equal(stats.areas.length,3);assert(stats.estimatedTextureBytes<stats.textureBudgetBytes);
});
