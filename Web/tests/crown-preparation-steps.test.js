import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prepareSplitCrown,prepareSplitCrownSteps} from '../src/finisher-crown.js';
function head(){const group=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.2,.3,.2,4,4,4),new T.MeshBasicMaterial());mesh.name='Photo';group.add(mesh);return{group,center:new T.Vector3(0,0,0),mesh};}
test('stepped Crown cuts have identical buffers and cancelled preparation releases owned allocations',()=>{
 const source=head(),expected=prepareSplitCrown(source),iterator=prepareSplitCrownSteps(source);let actual;for(;;){const step=iterator.next();if(step.done){actual=step.value;break;}}
 const buffers=prepared=>{const rows=[];prepared.group.traverse(n=>{if(n.isMesh)rows.push(Object.fromEntries(Object.entries(n.geometry.attributes).map(([name,a])=>[name,Array.from(a.array)])));});return rows;};
 assert.deepEqual(buffers(actual),buffers(expected));assert.deepEqual(actual.stats(),expected.stats());actual.dispose();expected.dispose();
 const original=globalThis.performance,dispose=T.Material.prototype.dispose;let clock=0,released=0;
 try{globalThis.performance={now:()=>clock+=5};T.Material.prototype.dispose=function(){released++;return dispose.call(this);};const pending=prepareSplitCrownSteps(source);assert.equal(pending.next().done,false);pending.return();assert.equal(released,1,'only the owned cut material is released');assert.equal(source.mesh.parent,source.group);}
 finally{globalThis.performance=original;T.Material.prototype.dispose=dispose;source.mesh.geometry.dispose();source.mesh.material.dispose();}
});
test('explicit complete head parts include headgear in both crown halves',()=>{
 const source=head();source.headParts=['Photo','PhotoEyes','PhotoTeeth','Bone','OriginalHead_Steel','OriginalHead_Wrap'];
 for(const name of source.headParts.slice(1)){const mesh=new T.Mesh(new T.BoxGeometry(name==='OriginalHead_Steel'?.8:.2,.2,.2,4,4,4),source.mesh.material);mesh.name=name;source.group.add(mesh);}
 const prepared=prepareSplitCrown(source),bounds=new T.Box3().setFromObject(prepared.group);assert(bounds.max.x>.39,'real cap must be included in the crown');assert(bounds.min.x<-.39);prepared.dispose();source.group.traverse(n=>{if(n.isMesh)n.geometry.dispose()});source.mesh.material.dispose();
});
