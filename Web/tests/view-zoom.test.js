import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {LondonWorld,createWorld} from '../src/world.js';
const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../public/world/manifest.json',import.meta.url)));
function make(viewZoomMultiplier){const camera=new THREE.PerspectiveCamera();return new LondonWorld({THREE,scene:new THREE.Scene(),camera,layout,texture:new THREE.Texture(),manifest,baseUrl:'http://test/',viewZoomMultiplier});}
test('optional view zoom scales both orientations while preserving registration and collision',()=>{
 const baseline=make(),same=make(1),zoomed=make(1.15);
 for(const [w,h] of [[1672,941],[852,393],[390,844]])for(const point of [{x:.52,y:.78},{x:.52,y:.5}]){
  const pos=baseline.geometry.ground(point);
  for(const world of [baseline,same,zoomed])world.update(pos,0,w,h,true);
  assert.deepEqual(same.camera.projectionMatrix.elements,baseline.camera.projectionMatrix.elements);
  const height=world=>{const a=world.toRender(pos).project(world.camera),b=world.toRender(pos,2*world.actorScale).project(world.camera);return Math.abs(b.y-a.y);};
  assert.ok(Math.abs(height(zoomed)/height(baseline)-1.15)<1e-8);
  assert.deepEqual(zoomed.calibrated.elements,baseline.calibrated.elements);
  assert.deepEqual(zoomed.camera.position.toArray(),baseline.camera.position.toArray());
  assert.deepEqual(zoomed.move(pos,{x:.5,z:.5},.4),baseline.move(pos,{x:.5,z:.5},.4));
  assert.equal(zoomed.actorScale,baseline.actorScale);
  const feet=zoomed.toRender(pos).project(zoomed.camera),picked=zoomed.screenToGround(feet.x,feet.y);
  assert.ok(Math.hypot(picked.x-pos.x,picked.z-pos.z)<1e-7);
  for(const mesh of [zoomed.backdrop,...zoomed.masks]){
   const vertices=mesh.geometry.attributes.position;
   const other=(mesh===zoomed.backdrop?baseline.backdrop:baseline.masks[zoomed.masks.indexOf(mesh)]);
   assert.deepEqual([...vertices.array],[...other.geometry.attributes.position.array]);
   for(let i=0;i<vertices.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(vertices,i);
    const before=v.clone().project(baseline.camera),after=v.clone().project(zoomed.camera);
    const baseFeet=baseline.toRender(pos).project(baseline.camera);
    assert.ok(Math.abs((after.x-feet.x)-(before.x-baseFeet.x)*1.15)<1e-6);
    assert.ok(Math.abs((after.y-feet.y)-(before.y-baseFeet.y)*1.15)<1e-6);
   }
   if(mesh!==zoomed.backdrop){assert.equal(mesh.material.colorWrite,false);assert.equal(mesh.material.depthWrite,true);}
  }
  const image=zoomed.backdrop.geometry.attributes.position;
  const a=new THREE.Vector3().fromBufferAttribute(image,0).project(zoomed.camera),b=new THREE.Vector3().fromBufferAttribute(image,2).project(zoomed.camera);
  assert.ok(a.x<=-1+1e-4&&a.y<=-1+1e-4&&b.x>=1-1e-4&&b.y>=1-1e-4);
 }
 for(const world of [baseline,same,zoomed])world.dispose();
});
test('factory and atomic area loading retain the optional view zoom',async()=>{
 const fetchBefore=globalThis.fetch,loadBefore=THREE.TextureLoader.prototype.loadAsync;
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).endsWith('manifest.json')?manifest:layout});
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
 let world;
 try{
  world=await createWorld({THREE,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),baseUrl:'http://test/',viewZoomMultiplier:1.15});
  assert.equal(world.viewZoomMultiplier,1.15);
  world.update(world.spawn,0,390,844,true);
  await world.loadArea('south',{x:.52,y:.78});
  assert.equal(world.areaId,'south');assert.equal(world.viewZoomMultiplier,1.15);
 }finally{world?.dispose();globalThis.fetch=fetchBefore;THREE.TextureLoader.prototype.loadAsync=loadBefore;}
});

test('invalid view multipliers fail before creating owned geometry',()=>{for(const value of [0,-1,.5,NaN,Infinity])assert.throws(()=>make(value),/View zoom multiplier/);});
