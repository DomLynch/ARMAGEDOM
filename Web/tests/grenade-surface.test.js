import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {traceGrenadeSurface,followGrenadeSurface} from '../src/engine/grenade-surface.js';
function body(id,z){const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,2,.2),new T.MeshStandardMaterial());root.add(mesh);root.position.set(0,1,z);root.updateWorldMatrix(true,true);return{enemy:{id,hp:40},view:{root,model:root},mesh};}
test('actual first visible triangle wins, with bone-independent local surface follow and no nearest-target snap',()=>{
 const front=body(1,-1),back=body(2,-2),views=new Map([[1,front.view],[2,back.view]]),enemies=[back.enemy,front.enemy],from={x:0,y:1,z:0},to={x:0,y:1,z:-3};
 const hit=traceGrenadeSurface(views,enemies,from,to);assert.equal(hit.enemy.id,1);assert(Math.abs(hit.position.z+.9)<1e-6);
 front.view.root.position.x=2;front.view.root.rotation.y=Math.PI/2;const moved=followGrenadeSurface(hit.anchor,front.view);assert(Math.abs(moved.x-2.1)<1e-6);assert(Math.abs(moved.z+1)<1e-6);
 front.view.root.visible=false;assert.equal(followGrenadeSurface(hit.anchor,front.view),null);assert.equal(traceGrenadeSurface(views,enemies,from,to).enemy.id,2);
 back.enemy.hp=0;assert.equal(traceGrenadeSurface(views,enemies,from,to),null);
 front.view.root.visible=true;assert.equal(traceGrenadeSurface(views,[front.enemy],{x:1,y:1,z:0},{x:1,y:1,z:-3}),null);
});
test('posed skinned triangle anchor follows current vertices without cloning or rewriting geometry',()=>{
 const geometry=new T.BoxGeometry(1,2,.2),count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial()),bone=new T.Bone();mesh.add(bone);mesh.bind(new T.Skeleton([bone]));const root=new T.Group();root.add(mesh);root.position.set(0,1,-1);const view={root,model:root},enemy={id:1,hp:40},before=geometry.attributes.position.array.slice();
 const hit=traceGrenadeSurface(new Map([[1,view]]),[enemy],{x:0,y:1,z:0},{x:0,y:1,z:-2});assert(hit);bone.position.x=.25;const moved=followGrenadeSurface(hit.anchor,view);assert(Math.abs(moved.x-.25)<1e-6);assert.deepEqual(geometry.attributes.position.array,before);
});
