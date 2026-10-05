import test from 'node:test';import assert from 'node:assert/strict';
import {createSupplyView} from '../src/supplies-view.js';import {createVestBagView} from '../src/vest-view.js';
test('actual ground views halo all partial counts and dispose owned and original materials once',()=>{
 for(const view of [createSupplyView({kind:'ammo',count:1}),createSupplyView({kind:'ammo',count:2}),createSupplyView({kind:'ammo',count:3}),createSupplyView({kind:'dressing'}),createVestBagView()]){
  const halos=[],surfaces=[],lines=[],materials=new Set();view.root.traverse(o=>{if(o.isLine)lines.push(o);if(o.isMesh){materials.add(o.material);if(o.name==='Ground pickup soft halo')halos.push(o);else if(o.material.isMeshStandardMaterial)surfaces.push({mesh:o,material:o.material});}});assert.equal(lines.length,0);assert.ok(halos.length);
  for(const h of halos){assert.equal(h.material.depthTest,true);assert.equal(h.material.depthWrite,false);assert.equal(h.material.toneMapped,false);assert.equal(h.material.uniforms.color.value.getHex(),0xff7b12);assert.ok(h.parent.material.isMeshStandardMaterial);if(h.isInstancedMesh){assert.equal(h.count,h.parent.count);assert.deepEqual([...h.instanceMatrix.array],[...h.parent.instanceMatrix.array]);}}
  const freed=new Map();for(const m of materials)m.addEventListener('dispose',()=>freed.set(m,(freed.get(m)??0)+1));
  view.update(0);view.update(100);assert.ok(surfaces.every(s=>s.mesh.material===s.material));view.dispose();view.dispose();assert.equal(freed.size,materials.size);assert.ok([...freed.values()].every(n=>n===1));assert.equal(view.root.children.length,0);assert.ok(halos.every(h=>h.parent===null));assert.ok(surfaces.every(s=>s.mesh.material===s.material));
 }
});
