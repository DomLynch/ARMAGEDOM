import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {addPickupOutline} from '../src/pickup-outline.js';import {createSupplyView} from '../src/supplies-view.js';import {createVestBagView} from '../src/vest-view.js';
test('outline follows ordinary mesh and all instance matrices without owning source resources',()=>{
 const geometry=new T.BoxGeometry(1,1,1),material=new T.MeshBasicMaterial(),mesh=new T.InstancedMesh(geometry,material,2);mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(-2,0,0));mesh.setMatrixAt(1,new T.Matrix4().makeTranslation(3,0,0));
 const before=geometry.attributes.position.array.slice(),view=addPickupOutline(mesh);view.outline.geometry.computeBoundingBox();assert.equal(view.outline.geometry.boundingBox.min.x,-2.5);assert.equal(view.outline.geometry.boundingBox.max.x,3.5);
 mesh.position.set(4,2,1);mesh.scale.setScalar(2);mesh.updateMatrixWorld(true);assert.deepEqual(view.outline.matrixWorld.elements,mesh.matrixWorld.elements);mesh.visible=false;assert.equal(view.outline.parent.visible,false);
 let ownG=0,ownM=0,borrowed=0;view.outline.geometry.addEventListener('dispose',()=>ownG++);view.outline.material.addEventListener('dispose',()=>ownM++);geometry.addEventListener('dispose',()=>borrowed++);material.addEventListener('dispose',()=>borrowed++);view.dispose();view.dispose();assert.deepEqual([ownG,ownM,borrowed],[1,1,0]);assert.deepEqual(geometry.attributes.position.array,before);assert.equal(mesh.children.length,0);mesh.dispose();geometry.dispose();material.dispose();
});
test('all partial ammo, dressing and ground vest shapes retain constant depth-tested contours and dispose once',()=>{
 for(const view of [createSupplyView({kind:'ammo',count:1}),createSupplyView({kind:'ammo',count:2}),createSupplyView({kind:'ammo',count:3}),createSupplyView({kind:'dressing'}),createVestBagView()]){
  const lines=[];view.root.traverse(o=>{if(o.name==='Pickup item outline')lines.push(o);});assert.ok(lines.length);let disposed=0;
  for(const l of lines){assert.equal(l.material.depthTest,true);assert.equal(l.material.depthWrite,false);assert.equal(l.material.toneMapped,false);assert.equal(l.material.opacity,1);l.geometry.addEventListener('dispose',()=>disposed++);}
  const identities=lines.map(l=>l.geometry);view.update(100);view.update(0);assert.deepEqual(lines.map(l=>l.geometry),identities);assert.ok(lines.every(l=>l.material.opacity===1));view.dispose();view.dispose();assert.equal(disposed,lines.length);assert.equal(view.root.children.length,0);
 }
});
