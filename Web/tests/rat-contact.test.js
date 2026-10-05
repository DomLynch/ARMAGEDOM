import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createRatBiteReceiver,sweptToothTriangle,ratLowBlade} from '../src/rat-contact.js';

test('real moving triangle crossing, miss and degenerate/coplanar fallbacks',()=>{
 const triangle=[[-1,-1,0],[1,-1,0],[0,1,0]];
 assert.ok(Math.abs(sweptToothTriangle([0,0,-1],[0,0,1],triangle,triangle)-.5)<1e-9);
 assert.equal(sweptToothTriangle([2,0,-1],[2,0,1],triangle,triangle),null);
 const moved=triangle.map(v=>[v[0],v[1],1]);
 assert.ok(Math.abs(sweptToothTriangle([0,0,.5],[0,0,.5],triangle,moved)-.5)<1e-9);
 assert.equal(sweptToothTriangle([0,0,-1],[0,0,1],[[0,0,0],[0,0,0],[0,0,0]],[[0,0,0],[0,0,0],[0,0,0]]),null);
 assert.equal(sweptToothTriangle([-2,0,0],[2,0,0],triangle,triangle),null); // Explicit unsupported tangential travel.
 const tiny=triangle.map(p=>p.map(v=>v*1e-5));
 assert.equal(sweptToothTriangle([0,0,1e-6],[0,0,2e-6],tiny,tiny),null,'small surfaces never create plane padding');
});
test('live bone snapshots, lazy vertex cache, visibility and topology fail closed',()=>{
 const model=new T.Group(),bone=new T.Bone();model.add(bone);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,0,1,0],3));geometry.setIndex([0,1,2]);geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(Array(12).fill(0),4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());mesh.name='Foot';model.add(mesh);model.updateMatrixWorld(true);mesh.bind(new T.Skeleton([bone]));
 const bindings=[{runtimeName:'Foot',faceBindings:[{face:0,vertices:[0,1,2]}]}],receiver=createRatBiteReceiver(model,bindings),before=receiver.capture();
 assert.equal(before.cache.size,0);bone.position.z=1;const after=receiver.capture();
 const crossing=receiver.sweep(before,after,[0,0,.5],[0,0,.5]);assert.ok(crossing.hit);assert.equal(crossing.stats.skinnedVertices,6);
 assert.equal(receiver.sweep(before,after,[0,0,.5],[0,0,.5]).stats.skinnedVertices,0);
 mesh.visible=false;const hidden=receiver.capture();assert.equal(receiver.sweep(hidden,hidden,[0,0,0],[0,0,2]).hit,null);
 assert.throws(()=>createRatBiteReceiver(model,[{runtimeName:'Foot',faceBindings:[{face:0,vertices:[0,2,1]}]}]),/topology/);
 receiver.dispose();receiver.dispose();assert.throws(()=>receiver.capture(),/disposed/);
});
test('blade bake uses displayed root once, preserving rotation and reflection',()=>{
 const path={hz:60,frames:Array.from({length:55},(_,i)=>({from:[0,0,i],to:[1,1,i]}))};
 const matrix=new T.Matrix4().makeRotationY(Math.PI).scale(new T.Vector3(2,2,2));matrix.setPosition(3,0,4);
 const [from,to]=ratLowBlade(path,.5/60,matrix);
 assert.ok(Math.abs(from[2]-3)<1e-10);assert.ok(Math.abs(to[0]-1)<1e-10);assert.equal(to[1],2);
 assert.throws(()=>ratLowBlade(path,-1,matrix),/Invalid/);
});
