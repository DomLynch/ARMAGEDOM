import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createGeometry} from '../src/world-geometry.js';
import {atmosphereForArea,ATMOSPHERE_PRESETS,atmosphereBudget}from'../src/atmosphere-areas.js';
import {createAtmosphere} from '../src/atmosphere.js';
import {WESTMINSTER_ATMOSPHERE,ATMOSPHERE_BUDGET} from '../src/atmosphere-westminster.js';

function fixture(){
  const layout=JSON.parse(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
  const camera=new THREE.PerspectiveCamera(layout.fieldOfView,1672/941,.1,300);
  camera.position.set(0,layout.height,layout.distance);camera.lookAt(0,0,-layout.targetZ);camera.updateMatrixWorld(true);
  const world={areaId:'westminster',camera,calibrated:camera.projectionMatrix.clone(),geometry:createGeometry(layout)};
  const scene=new THREE.Scene();return {world,scene,fx:createAtmosphere({THREE,scene,world})};
}
test('painting anchors survive a cropped camera; bounded three batches without textures',()=>{
  const {world,scene,fx}=fixture();
  world.camera.projectionMatrix.elements[0]*=2;world.camera.projectionMatrix.elements[12]=.4;
  fx.update(.016);
  assert.equal(fx.stats().quads,ATMOSPHERE_BUDGET.quads);assert.equal(fx.stats().drawCalls,3);assert.equal(fx.stats().textureBytes,0);
  const smoke=scene.children[0].children.find(x=>x.name==='Atmosphere smoke');
  const positions=smoke.geometry.getAttribute('position');
  for(const [index,anchor] of [[0,WESTMINSTER_ATMOSPHERE[0]],[4*WESTMINSTER_ATMOSPHERE[0].smoke,WESTMINSTER_ATMOSPHERE[1]]]){
    const p=new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(world.camera.matrixWorldInverse).applyMatrix4(world.calibrated);
    assert.ok(Math.abs((p.x+1)/2-anchor.x)<1e-6);assert.ok(Math.abs((1-p.y)/2-anchor.y)<1e-6);
  }
  for(const mesh of scene.children[0].children){assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.map,undefined);}
  fx.dispose();
});
test('pause, disable and invalid delta freeze effects; reset does not duplicate resources',()=>{
  const {fx,scene}=fixture();fx.update(.05);const time=fx.stats().time;
  fx.update(3,{paused:true});fx.update(3,{enabled:false});fx.update(NaN);fx.update(-1);assert.equal(fx.stats().time,time);
  fx.reset();assert.equal(fx.stats().time,0);assert.equal(scene.children.length,1);fx.update(9);assert.equal(fx.stats().time,.1);fx.dispose();
});
test('area exit disposes each resource once, reentry allocates one group, final disposal is idempotent',()=>{
  const {world,scene,fx}=fixture();fx.update(.01);const old=[...scene.children[0].children];let released=0;
  for(const mesh of old){mesh.geometry.addEventListener('dispose',()=>released++);mesh.material.addEventListener('dispose',()=>released++);}
  world.areaId='unknown';fx.update(.01);assert.equal(scene.children.length,0);assert.equal(released,6);assert.equal(fx.stats().quads,0);
  world.areaId='westminster';fx.update(.01);fx.update(.01);assert.equal(scene.children.length,1);assert.equal(fx.stats().quads,ATMOSPHERE_BUDGET.quads);
  fx.dispose();fx.dispose();fx.update(.01);assert.equal(scene.children.length,0);assert.equal(released,6);assert.equal(fx.stats().disposed,true);
});
test('bus emits smoke only with its own tint; other smoke retains its accepted colour',()=>{
  const bus=WESTMINSTER_ATMOSPHERE[0];
  assert.equal(bus.fireHeight,0);assert.equal(bus.fireWidth,0);assert.equal(bus.embers,0);
  const {fx,scene}=fixture();fx.update(.01);
  const tint=scene.children[0].children.find(x=>x.name==='Atmosphere smoke').geometry.getAttribute('tint');
  for(const [index,expected] of [[0,bus.smokeColor],[bus.smoke*4,[.095,.085,.075]]]){
    for(let channel=0;channel<3;channel++)assert.ok(Math.abs(tint.array[index*3+channel]-expected[channel])<1e-6);
  }
  fx.dispose();
});

test('five seeded presets and active three-area budgets retain approved West parameters',()=>{
 assert.equal(Object.keys(ATMOSPHERE_PRESETS).length,5);const {fx,scene,world}=fixture();for(const [area,count,anchors]of [['westminster',28,6],['east',24,7],['south',21,6]]){const resolved=atmosphereForArea(area);assert.equal(resolved.length,anchors);assert.equal(new Set(resolved.map(a=>a.id)).size,anchors);assert.deepEqual(atmosphereForArea(area),resolved);assert(atmosphereBudget(area).quads<=28);world.areaId=area;fx.update(.01);assert.equal(scene.children.filter(o=>o.name==='London restrained atmosphere').length,1);assert.equal(fx.stats().quads,count);assert.equal(fx.stats().textureBytes,0);assert(fx.stats().drawCalls<=3);}
 for(const [i,a]of atmosphereForArea('westminster').entries())for(const key of Object.keys(WESTMINSTER_ATMOSPHERE[i]))assert.deepEqual(a[key],WESTMINSTER_ATMOSPHERE[i][key]);fx.dispose();fx.dispose();assert.equal(scene.children.length,0);
});
