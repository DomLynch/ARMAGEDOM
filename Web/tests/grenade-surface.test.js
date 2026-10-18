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
function weightedBody(id,z){
 const geometry=new T.BoxGeometry(1,2,.2,2,2,1),count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 for(let i=0;i<count;i++){indices[i*4+1]=1;weights[i*4]=.25;weights[i*4+1]=.75;}
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({side:T.DoubleSide})),base=new T.Bone(),tip=new T.Bone();base.add(tip);mesh.add(base);mesh.bind(new T.Skeleton([base,tip]));mesh.boundingBox=new T.Box3();
 const root=new T.Group();root.add(mesh);root.position.set(0,1,z);return{enemy:{id,hp:40},view:{root,model:root},mesh,tip};
}
function ordinaryRay(rows,from,to){
 const start=new T.Vector3(from.x,from.y,from.z),delta=new T.Vector3(to.x,to.y,to.z).sub(start),ray=new T.Raycaster(start,delta.clone().normalize(),0,delta.length());
 for(const r of rows){r.view.root.updateWorldMatrix(true,true);r.mesh.skeleton.update();r.mesh.computeBoundingSphere();r.mesh.computeBoundingBox();}
 return ray.intersectObjects(rows.map(r=>r.mesh),false)[0];
}
test('memoized queries exactly match ordinary posed Three rays across weighted motion and nonuniform transforms',()=>{
 const rows=[weightedBody(2,-2),weightedBody(1,-1)],views=new Map(rows.map(r=>[r.enemy.id,r.view])),enemies=rows.map(r=>r.enemy);
 for(let frame=0;frame<8;frame++){
  for(const r of rows){r.tip.position.x=frame*.025;r.tip.rotation.z=frame*.025;r.view.root.rotation.y=frame*.02;r.view.root.scale.set(1+frame*.02,1-frame*.01,1.2);}
  for(const x of [-.6,0,.3]){const from={x,y:1,z:0},to={x,y:1,z:-3},reference=ordinaryRay(rows,from,to),result=traceGrenadeSurface(views,enemies,from,to);assert.equal(!!result,!!reference);if(result){assert.equal(result.anchor.mesh,reference.object);assert.deepEqual(result.anchor.indices,[reference.face.a,reference.face.b,reference.face.c]);assert(new T.Vector3(result.position.x,result.position.y,result.position.z).distanceTo(reference.point)<1e-12);}}
 }
});
test('one query skins each vertex once across bounds/triangles and restores the original method and geometry',t=>{
 const r=weightedBody(1,-1),mesh=r.mesh,original=mesh.getVertexPosition,position=mesh.geometry.attributes.position.array.slice(),from={x:0,y:1,z:0},to={x:0,y:1,z:-3};let calls=0;
 const counted=function(...args){calls++;return original.apply(this,args);};mesh.getVertexPosition=counted;
 ordinaryRay([r],from,to);const baseline=calls;calls=0;
 const hit=traceGrenadeSurface(new Map([[1,r.view]]),[r.enemy],from,to);assert(hit);assert.equal(calls,mesh.geometry.attributes.position.count+3);assert(calls<baseline);t.diagnostic('exact skin evaluations baseline='+baseline+' memoized='+calls);assert.equal(mesh.getVertexPosition,counted);assert.deepEqual(mesh.geometry.attributes.position.array,position);
 mesh.getVertexPosition=function(){throw Error('skin failure');};const failing=mesh.getVertexPosition;assert.throws(()=>traceGrenadeSurface(new Map([[1,r.view]]),[r.enemy],from,to),/skin failure/);assert.equal(mesh.getVertexPosition,failing);
});
