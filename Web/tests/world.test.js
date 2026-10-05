import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
let module={};
try {module=await import('../src/world.js');} catch(e) {if(e.code!=='ERR_MODULE_NOT_FOUND') throw e;}
const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../public/world/manifest.json',import.meta.url)));
function setup(){
  assert.equal(typeof module.LondonWorld,'function','Three.js registered world missing');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  return {scene,camera,world:new module.LondonWorld({THREE,scene,camera,layout,texture:new THREE.Texture(),manifest})};
}
test('one crop registers backdrop, foreground depths, actor and picking at different phone aspects',()=>{
  const {world,camera}=setup();
  for(const [width,height] of [[1672,941],[1920,1080],[844,390],[390,844]]) {
    const p=world.geometry.ground({x:.52,y:.78});world.update(p,1,width,height,true);
    const actor=world.toRender(p).project(camera);
    const ground=world.screenToGround(actor.x,actor.y);
    assert.ok(Math.hypot(ground.x-p.x,ground.z-p.z)<1e-7);
    const image=world.backdrop.geometry.attributes.position;
    const uv=world.backdrop.geometry.attributes.uv;
    for(let i=0;i<image.count;i++) {
      const painted=new THREE.Vector3().fromBufferAttribute(image,i).project(camera);
      const groundForCorner=world.geometry.ground({x:uv.getX(i),y:1-uv.getY(i)});
      const floor=world.toRender(groundForCorner).project(camera);
      assert.ok(Math.hypot(painted.x-floor.x,painted.y-floor.y)<1e-5,'image drifts from collision');
    }
    const bottomLeft=new THREE.Vector3().fromBufferAttribute(image,0).project(camera);
    const topRight=new THREE.Vector3().fromBufferAttribute(image,2).project(camera);
    assert.ok(bottomLeft.x<=-1.000001+1e-4&&bottomLeft.y<=-1+1e-4&&topRight.x>=1-1e-4&&topRight.y>=1-1e-4,'image does not cover viewport');
  }
  for(const mesh of world.masks) {
    assert.equal(mesh.material.colorWrite,false);
    assert.equal(mesh.material.depthWrite,true);
    assert.ok(mesh.renderOrder<0);
  }
  world.dispose();
});
test('fixed camera and adaptive crop preserve actor size from near street to far street',()=>{
  const {world,camera}=setup();let reference;
  for(const q of [{x:.52,y:.78},{x:.90,y:.40},{x:.52,y:.5}]) {
    const p=world.geometry.ground(q);world.update(p,1,1672,941,true);
    const a=world.toRender(p).project(camera),b=world.toRender(p,2).project(camera);
    const height=Math.abs(b.y-a.y);reference??=height;
    assert.ok(Math.abs(height/reference-1)<.001);
    assert.deepEqual(camera.position.toArray(),[0,23,26]);
  }
  world.dispose();
});
test('disposing an area removes owned meshes and releases texture without removing actors',()=>{
  const {world,scene}=setup();const actor=new THREE.Group();scene.add(actor);let released=0;
  world.texture.addEventListener('dispose',()=>released++);world.dispose();
  assert.equal(released,1);assert.deepEqual(scene.children,[actor]);
});
test('area requests preserve the four existing route thresholds and destination entries',()=>{
  const {world}=setup();assert.equal(typeof world.travelAt,'function','travel detector missing');
  for(const [area,point,destination,entry] of [
    ['westminster',{x:.966,y:.335},'east',{x:.10,y:.72}],
    ['westminster',{x:.60,y:.985},'south',{x:.55,y:.29}],
    ['east',{x:.03,y:.74},'westminster',{x:.90,y:.40}],
    ['south',{x:.54,y:.22},'westminster',{x:.60,y:.92}]
  ]) {world.areaId=area;assert.deepEqual(world.travelAt(world.geometry.ground(point)),{areaId:destination,entryPoint:entry});}
  world.areaId='westminster';assert.equal(world.travelAt(world.spawn),null);assert.equal(world.actorScale,1.265);world.dispose();
});
test('portrait shows a readable actor above controls where painting bounds allow, retaining portrait framing',()=>{
  const {world,camera}=setup();
  const mid=world.geometry.ground({x:.52,y:.5});
  for(const position of [world.spawn,mid,world.geometry.ground({x:.52,y:.78})]) {
    world.update(position,0,390,844,true);
    const feet=world.toRender(position).project(camera),head=world.toRender(position,2*world.actorScale).project(camera);
    const pixels=(head.y-feet.y)*844/2;
    if(position===mid)assert.ok(Math.abs(pixels-63)<1e-8,`unclamped portrait reference is ${pixels}px, expected63`);else assert.ok(pixels>=63&&pixels<=70,`finite-painting clamp portrait reference is ${pixels}px`);
    const image=world.backdrop.geometry.attributes.position;
    const a=new THREE.Vector3().fromBufferAttribute(image,0).project(camera),b=new THREE.Vector3().fromBufferAttribute(image,2).project(camera);
    assert.ok(a.x<=-1+1e-4&&a.y<=-1+1e-4&&b.x>=1-1e-4&&b.y>=1-1e-4);
    const picked=world.screenToGround(feet.x,feet.y);assert.ok(Math.hypot(picked.x-position.x,picked.z-position.z)<1e-7);
    if(position===mid)assert.ok((1-feet.y)/2>=.5&&(1-feet.y)/2<=.55);
    assert.equal(world.actorScale,1.265);assert.deepEqual(camera.position.toArray(),[0,23,26]);
  }
  world.update(world.spawn,0,852,393,true);
  const a=world.toRender(world.spawn).project(camera),b=world.toRender(world.spawn,2*world.actorScale).project(camera);
  assert.ok(Math.abs((b.y-a.y)*393/2-55.839178022156624*.9)<1e-8,'landscape must use the approved 10% zoom-out');
  assert.ok(Math.abs((1-a.y)/2-.6877572955357277)<1e-8,'landscape framing changed');
  world.dispose();
});
test('portrait follow responds to production movement and settles after rotation',()=>{
  const {world,camera}=setup();let position={...world.spawn};world.update(position,0,390,844,true);
  const start=(1-world.toRender(position).project(camera).y)/2;
  for(let frame=0;frame<60;frame++) {
    position=world.move(position,{x:0,z:2/60},.4);world.update(position,1/60,390,844);
    const feet=world.toRender(position).project(camera),head=world.toRender(position,2*world.actorScale).project(camera);
    assert.ok((head.y-feet.y)*844/2<=80);
    const pick=world.screenToGround(feet.x,feet.y);assert.ok(Math.hypot(pick.x-position.x,pick.z-position.z)<1e-7);
  }
  assert.ok(position.z>world.spawn.z+1.9);
  assert.ok((1-world.toRender(position).project(camera).y)/2<start-.05);
  // Rotation retains registration; gentle follow converges to the same landscape result as immediate framing.
  for(let frame=0;frame<240;frame++)world.update(position,1/60,852,393);
  const settled=camera.projectionMatrix.clone();world.update(position,0,852,393,true);
  assert.ok(settled.elements.every((value,i)=>Math.abs(value-camera.projectionMatrix.elements[i])<1e-6));world.dispose();
});
