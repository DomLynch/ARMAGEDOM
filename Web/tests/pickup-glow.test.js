import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {addPickupGlow} from '../src/pickup-glow.js';
test('actual1/2/3 instances retain original surfaces and transforms; owned contour disposal is idempotent',()=>{
 for(const count of [1,2,3]){
  const geometry=new T.CylinderGeometry(.018,.019,.11,8),map=new T.Texture(),material=new T.MeshStandardMaterial({color:0xb49a65,map}),mesh=new T.InstancedMesh(geometry,material,count);
  for(let i=0;i<count;i++)mesh.setMatrixAt(i,new T.Matrix4().makeTranslation(i,.022,.066*i));
  const matrices=[...mesh.instanceMatrix.array],h=addPickupGlow(mesh);let borrowed=0,owned=0;
  for(const r of [geometry,material,map])r.addEventListener('dispose',()=>borrowed++);
  h.halo.material.addEventListener('dispose',()=>owned++);h.halo.geometry.addEventListener('dispose',()=>owned++);
  assert.equal(mesh.material,material);assert.equal(material.color.getHex(),0xb49a65);assert.equal(material.emissive.getHex(),0);assert.equal(mesh.geometry,geometry);
  assert.deepEqual([...h.halo.instanceMatrix.array],matrices);assert.deepEqual([...mesh.instanceMatrix.array],matrices);assert.equal(h.halo.count,count);
  assert.equal(h.halo.material.depthTest,true);assert.equal(h.halo.material.depthWrite,false);assert.equal(h.halo.frustumCulled,false);
  h.dispose();h.dispose();assert.equal(h.halo.parent,null);assert.equal(owned,2);assert.equal(borrowed,0);
  mesh.dispose();geometry.dispose();material.dispose();map.dispose();
 }
});
test('hull survives until last user and recreation is owned; equipped cloth is rejected',()=>{
 const geometry=new T.BoxGeometry(),materials=[new T.MeshStandardMaterial(),new T.MeshStandardMaterial()],a=new T.Mesh(geometry,materials),b=new T.Mesh(geometry,materials[0]);
 const ha=addPickupGlow(a),hb=addPickupGlow(b);assert.equal(ha.halo.geometry,hb.halo.geometry);let freed=0;ha.halo.geometry.addEventListener('dispose',()=>freed++);
 ha.dispose();assert.equal(freed,0);assert.equal(a.material,materials);hb.dispose();assert.equal(freed,1);
 const hc=addPickupGlow(a);assert.notEqual(hc.halo.geometry,ha.halo.geometry);hc.dispose();
 const cloth=new T.SkinnedMesh(geometry,materials[0]);assert.throws(()=>addPickupGlow(cloth),TypeError);assert.equal(cloth.children.length,0);
 geometry.dispose();materials.forEach(m=>m.dispose());
});
