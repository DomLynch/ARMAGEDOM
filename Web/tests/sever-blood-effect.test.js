import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {createSeverBloodEffect} from '../src/engine/sever-blood-effect.js';
function fixture(){
 const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))),geometry=createGeometry(layout),p=geometry.ground({x:.52,y:.78}),scene=new THREE.Scene();
 const world={layout,geometry,areaId:'westminster',toRender:(p,y)=>new THREE.Vector3(p.x,y,-p.z)};
 let anchors={head:{x:p.x,y:1.6,z:-p.z},neckNormal:{x:0,y:1,z:0}};
 const token={finisherAge:0,finisher:{impactAnchors:()=>anchors}},effect={palette:[0x310508,0x831428]},fx=createSeverBloodEffect({THREE,scene,world});
 return{scene,world,fx,token,effect,anchors,setAnchors:a=>anchors=a};
}
test('posed jet follows the neck and pool grows on safe real West ground, then independently expires',()=>{
 const f=fixture();assert.deepEqual(f.fx.start(f.token,f.effect,f.anchors),{jet:true,pool:true,safeGround:true});
 f.fx.update(.11);let s=f.fx.snapshot();assert.equal(s.jets.length,1);assert.ok(Math.abs(s.jets[0].scale[1]-.9)<1e-12);assert.ok(s.pools[0].radius>0&&s.pools[0].radius<.5);
 const paused=structuredClone(s);f.fx.update(.11);assert.deepEqual(f.fx.snapshot(),paused);
 f.setAnchors({...f.anchors,head:{...f.anchors.head,x:f.anchors.head.x+.25}});f.fx.update(.12);s=f.fx.snapshot();assert.equal(s.jets[0].position[0],f.anchors.head.x+.25);assert.equal(s.pools[0].position[0],f.anchors.head.x);
 f.fx.update(.4);s=f.fx.snapshot();assert.equal(s.jets.length,0);assert.equal(s.pools[0].radius,.5);assert.ok(s.pools[0].opacity>0);
 f.fx.update(1.5);assert.equal(f.fx.snapshot().pools.length,1);f.fx.update(4);assert.equal(f.fx.snapshot().pools.length,0);f.fx.dispose();
});
test('fixed slots bound simultaneous effects; cancellation, travel and reset release all slots',()=>{
 const f=fixture(),tokens=Array.from({length:5},()=>({...f.token}));
 const admitted=tokens.map(t=>f.fx.start(t,f.effect,f.anchors));assert.equal(admitted.filter(r=>r.jet).length,2);assert.equal(admitted.filter(r=>r.pool).length,4);
 f.fx.cancel(tokens[0]);assert.equal(f.fx.snapshot().jets.length,1);assert.equal(f.fx.snapshot().pools.length,3);
 f.world.areaId='other';f.fx.update(.05);assert.equal(f.fx.snapshot().pools.length,0);assert.equal(f.fx.snapshot().jets.length,0);
 f.fx.start(tokens[0],f.effect,f.anchors);f.fx.reset();assert.equal(f.fx.snapshot().pools.length,0);f.fx.dispose();
});
test('unsafe full footprint suppresses only ground pool; downward jet never extends below ground',()=>{
 const f=fixture();f.world.geometry={...f.world.geometry,clear:()=>false};const a={...f.anchors,head:{...f.anchors.head,y:.1},neckNormal:{x:0,y:-1,z:0}};f.setAnchors(a);
 assert.deepEqual(f.fx.start(f.token,f.effect,a),{jet:true,pool:false,safeGround:false});f.fx.update(.11);const j=f.fx.snapshot().jets[0];assert.ok(j.position[1]-j.scale[1]/2>=-1e-12);assert.equal(f.fx.snapshot().pools.length,0);f.fx.dispose();
});
test('dispose releases only its own six materials and two geometries once',()=>{
 const f=fixture(),unrelated=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());f.scene.add(unrelated);let materials=0,geometries=0,foreign=0;const seen=new Set();
 f.scene.traverse(n=>{if(!n.isMesh)return;if(n===unrelated){n.geometry.addEventListener('dispose',()=>foreign++);return;}n.material.addEventListener('dispose',()=>materials++);if(!seen.has(n.geometry)){seen.add(n.geometry);n.geometry.addEventListener('dispose',()=>geometries++);}});
 f.fx.dispose();f.fx.dispose();assert.equal(materials,6);assert.equal(geometries,2);assert.equal(foreign,0);assert.deepEqual(f.scene.children,[unrelated]);assert.equal(f.fx.start(f.token,f.effect,f.anchors),null);
});
