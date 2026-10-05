import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {attachPistolSlide} from '../src/pistol-slide.js';

async function pistol(){
 const bytes=await readFile(new URL('../public/assets/pistol/pistol.glb',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'62d6bdc4789365ace89c98bc3fe74322ae427f316810f81cb4ad66857e73f321');
 return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'' )).scene;
}
function triangles(mesh){
 const result=[], index=mesh.geometry.index;
 for(let i=0;i<index.count;i+=3)result.push(`${mesh.material.name}:${index.getX(i)},${index.getX(i+1)},${index.getX(i+2)}`);
 return result.sort();
}

test('actual pistol partitions all triangles and moves upper islands without moving grip or muzzle',async()=>{
 const mount=await pistol(), container=mount.getObjectByName('PistolMesh'), meshes=[...container.children];
 const sources=meshes.map(m=>m.geometry), materials=meshes.map(m=>m.material), original=meshes.flatMap(triangles).sort();
 const muzzle=mount.getObjectByName('Muzzle');mount.scale.setScalar(1.265*1.3225);mount.rotation.y=.7;
 mount.updateMatrixWorld(true);const muzzleBefore=muzzle.getWorldPosition(new T.Vector3()), gripBefore=meshes[0].getWorldPosition(new T.Vector3());
 const handle=attachPistolSlide(mount);assert.equal(handle.supported,true,handle.reason);
 assert.deepEqual([...meshes,...handle.slide.children].flatMap(triangles).sort(),original);
 assert.equal(meshes.reduce((n,m)=>n+m.geometry.index.count/3,0),748);
 assert.equal(handle.slide.children.reduce((n,m)=>n+m.geometry.index.count/3,0),616);
 assert.equal(meshes[0].geometry,sources[0]);
 for(let i=1;i<3;i++){
  const part=handle.slide.children[i-1];assert.equal(meshes[i].material,materials[i]);assert.equal(part.material,materials[i]);
  for(const name of Object.keys(sources[i].attributes)){
   assert.notEqual(meshes[i].geometry.attributes[name].array,sources[i].attributes[name].array);
   assert.deepEqual(meshes[i].geometry.attributes[name].array,sources[i].attributes[name].array);
   assert.deepEqual(part.geometry.attributes[name].array,sources[i].attributes[name].array);
  }
  const pos=part.geometry.attributes.position;
  for(const index of part.geometry.index.array)assert.ok(pos.getY(index)+container.position.y>=.036-1e-6);
 }
 mount.updateMatrixWorld(true);const slideOrigin=handle.slide.getWorldPosition(new T.Vector3());
 handle.setRecoil(1);mount.updateMatrixWorld(true);
 const displacement=handle.slide.getWorldPosition(new T.Vector3()).sub(slideOrigin);
 const expected=new T.Vector3(0,0,-.012*mount.scale.x).applyQuaternion(mount.quaternion);
 assert.ok(displacement.distanceTo(expected)<1e-8);
 assert.ok(muzzle.getWorldPosition(new T.Vector3()).distanceTo(muzzleBefore)<1e-8);
 assert.ok(meshes[0].getWorldPosition(new T.Vector3()).distanceTo(gripBefore)<1e-8);
 handle.dispose();for(let i=0;i<3;i++)assert.equal(meshes[i].geometry,sources[i]);
});

test('shot reset and repeated disposal restore sources and release only owned buffers',async()=>{
 const mount=await pistol(), container=mount.getObjectByName('PistolMesh'), meshes=[...container.children], sources=meshes.map(m=>m.geometry);
 let borrowedDisposals=0;for(const mesh of meshes){mesh.geometry.addEventListener('dispose',()=>borrowedDisposals++);mesh.material.addEventListener('dispose',()=>borrowedDisposals++);}
 for(let repeat=0;repeat<12;repeat++){
  const handle=attachPistolSlide(mount);assert.equal(handle.supported,true,handle.reason);
  const geos=[...meshes.slice(1),...handle.slide.children].map(m=>m.geometry), indices=geos.map(g=>g.index), positions=geos.map(g=>g.attributes.position);
  let ownedDisposals=0;for(const g of geos)g.addEventListener('dispose',()=>ownedDisposals++);
  assert.equal(attachPistolSlide(mount).supported,false);
  for(let frame=0;frame<30;frame++)handle.setRecoil(frame/29);
  for(let i=0;i<4;i++){assert.equal(geos[i].index,indices[i]);assert.equal(geos[i].attributes.position,positions[i]);}
  handle.setRecoil(2);assert.equal(handle.slide.position.z,-.012);
  handle.reset();assert.equal(handle.slide.position.z,0);
  handle.setRecoil(NaN);assert.equal(handle.slide.position.z,0);
  handle.dispose();handle.dispose();handle.setRecoil(1);
  assert.equal(ownedDisposals,4);for(let i=0;i<3;i++)assert.equal(meshes[i].geometry,sources[i]);
  assert.equal(container.getObjectByName('PistolSlide'),undefined);assert.equal(handle.slide.position.z,0);
 }
 assert.equal(borrowedDisposals,0);
});

test('unsupported geometry falls back without changing source ownership',async()=>{
 const mount=await pistol(), container=mount.getObjectByName('PistolMesh'), mesh=container.children[1];
 mesh.geometry=mesh.geometry.clone();const source=mesh.geometry;
 for(let i=0;i<source.attributes.position.count;i++)source.attributes.position.setY(i,source.attributes.position.getY(i)+.002);
 const handle=attachPistolSlide(mount);assert.equal(handle.supported,false);
 assert.equal(mesh.geometry,source);assert.equal(container.getObjectByName('PistolSlide'),undefined);
 handle.setRecoil(1);handle.reset();handle.dispose();assert.equal(attachPistolSlide(new T.Group()).supported,false);
});
