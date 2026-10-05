import test from 'node:test';import assert from 'node:assert/strict';
import {createSupplyView} from '../src/supplies-view.js';import {createVestBagView} from '../src/vest-view.js';
test('actual ground views glow all partial counts and release private plus original materials once',()=>{
 for(const view of [createSupplyView({kind:'ammo',count:1}),createSupplyView({kind:'ammo',count:2}),createSupplyView({kind:'ammo',count:3}),createSupplyView({kind:'dressing'}),createVestBagView()]){
  const glowing=[],lines=[];view.root.traverse(o=>{if(o.isLine)lines.push(o);if(o.isMesh&&o.material.emissive?.r===.65)glowing.push(o);});assert.equal(lines.length,0);assert.ok(glowing.length);
  const mats=glowing.map(o=>o.material);let released=0;for(const m of mats){assert.equal(m.depthTest,true);assert.equal(m.depthWrite,true);assert.equal(m.toneMapped,false);assert.deepEqual(m.emissive.toArray(),[.65,.2,.05]);assert.equal(m.emissiveIntensity,1);m.addEventListener('dispose',()=>released++);}
  view.update(0);view.update(100);assert.deepEqual(glowing.map(o=>o.material),mats);view.dispose();view.dispose();assert.equal(released,mats.length);assert.equal(view.root.children.length,0);assert.ok(glowing.every((o,i)=>o.material!==mats[i]));
 }
});
