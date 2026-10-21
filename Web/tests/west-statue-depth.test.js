import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {LondonWorld} from '../src/world.js';
import {pistolPointerPoint} from '../src/pistol-targeting.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const layout=read('../public/world/westminster/layout.json');
const manifest=read('../public/world/manifest.json');
const reference=read('./fixtures/west-statue-outline.json');
const row=layout.masks.find(m=>m.name===reference.name);
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const area=points=>points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.y-b.x*a.y;},0)/2;
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function fixture(){
  const world=new LondonWorld({THREE,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),layout,texture:new THREE.Texture()});
  const mesh=world.masks.find(m=>m.name===reference.name),camera=world.camera.clone();
  camera.projectionMatrix.copy(world.calibrated);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  return {world,mesh,hit(p){ray.setFromCamera(new THREE.Vector2(2*p.x-1,1-2*p.y),camera);return ray.intersectObject(mesh,false).length>0;}};
}

test('statue layout matches its registered asset digest',()=>{
 assert(row);
 const record=manifest.files.find(f=>f.path==='westminster/layout.json');
 assert(record);assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))).digest('hex'),record.sha256);
});

test('existing triangle fan exactly covers the independently traced concave outline',()=>{
  assert.deepEqual(row.points,[reference.fanOrigin,...reference.outline,reference.outline[0]]);
  let sum=0;
  for(let i=0;i<reference.outline.length;i++)assert(cross(reference.outline[i],reference.outline[(i+1)%reference.outline.length],row.points[0])>0,'Fan origin must lie in every boundary half-plane');
  for(let i=1;i<row.points.length-1;i++){const a=cross(row.points[0],row.points[i],row.points[i+1])/2;assert(a>0,'No reversed or degenerate triangles');sum+=a;}
  assert(Math.abs(sum-area(reference.outline))<1e-14);
  const {world,mesh,hit}=fixture();
  try{
    assert.equal(mesh.geometry.index.count,reference.outline.length*3);
    for(let x=.85573;x<.952;x+=.0027)for(let y=.32917;y<.564;y+=.0027)assert.equal(hit({x,y}),inside({x,y},reference.outline),`Mesh coverage at ${x},${y}`);
  }finally{world.dispose();}
});

test('actual mask raycasts cover the statue but miss the wing notch and adjacent road',()=>{
  const {world,hit}=fixture();
  try{assert(hit({x:.905,y:.50}));assert(!hit({x:.899,y:.36}));assert(!hit(reference.ordinaryAdjacent));}finally{world.dispose();}
});

test('ordinary behind/front/adjacent samples remain full-radius clear with correct relative depths',()=>{
  const {world}=fixture(),g=world.geometry;
  try{
    for(const p of [reference.ordinaryBehind,reference.ordinaryFront,reference.ordinaryAdjacent])assert(g.clear(g.ground(p),.4));
    const maskDepth=g.point(g.ground(row.foot)).depth;
    assert(g.point(g.ground(reference.ordinaryBehind)).depth>maskDepth);
    assert(g.point(g.ground(reference.ordinaryFront)).depth<maskDepth);
  }finally{world.dispose();}
});

test('same-screen surfaces in front of the statue win while surfaces behind it remain covered',()=>{
  const {world,mesh}=fixture(),p={x:.905,y:.50};
  const camera=world.camera.clone();camera.projectionMatrix.copy(world.calibrated);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  world.camera.copy(camera);world.camera.updateMatrixWorld(true);
  const x=2*p.x-1,y=1-2*p.y,ground=world.screenToGround(x,y),hit=world.ray.intersectObject(mesh,false)[0];assert(hit);
  const frame=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));frame.name='ARM_Drone_Rigid_Frame';
  const model=new THREE.Group();model.add(frame);const views=new Map([[1,{model}]]),actor={id:1,rig:'low-hover-drone',hp:20};
  try{
    for(const [offset,covered]of [[2,true],[-2,false]]){
      frame.position.copy(hit.point).addScaledVector(world.ray.ray.direction,offset);frame.lookAt(world.ray.ray.origin);frame.updateMatrixWorld(true);
      const actual=pistolPointerPoint(world,views,[actor],x,y);
      if(covered)assert.deepEqual(actual,ground,'Mask must cover the farther surface');
      else assert(Math.hypot(actual.x-ground.x,actual.z-ground.z)>.1,'Nearer surface must remain pickable in front of the mask');
    }
  }finally{frame.geometry.dispose();frame.material.dispose();world.dispose();}
});
