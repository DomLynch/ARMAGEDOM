import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {LondonWorld} from '../src/world.js';

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

test('statue row preserves all previous layout data, entries and 22 routes',()=>{
  assert(row);
  assert.equal(hash({...layout,masks:layout.masks.filter(m=>m!==row)}),'1230a60e6d221a1491e60afc5127280de855eea91cbcbb23e480c5b6ccc184ab');
  assert.equal(hash([manifest.entries,manifest.links]),'66f7ec10186f371eee9e409c2e23c5ec5101885e53588308668cc98fb597744e');
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
