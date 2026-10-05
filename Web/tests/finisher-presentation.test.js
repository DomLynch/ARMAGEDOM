import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createFinisherPresentation} from '../src/finisher-presentation.js';
const clips=[new T.AnimationClip('Death',2.4,[]),new T.AnimationClip('Hit',1/3,[]),new T.AnimationClip('Death_SplitCrown',1,[])];
function fixture(){const scene=new T.Scene(),root=new T.Group(),model=new T.Group(),bone=new T.Bone();bone.name='Head';model.add(bone);root.add(model);scene.add(root);return{scene,root,model};}
test('native pistol sequence advances at1x, directional recoil is bounded and ordinary fallback remains',()=>{
 const f=fixture(),p=createFinisherPresentation({...f,clips,isBlocked:()=>false});
 assert.equal(p.support.length,1);assert.equal(p.support[0].seconds,1/3+2.4);
 const recipe=p.start({recipeId:'pistol-directional',damageType:'bullet',direction:{x:3,z:4}});
 assert.equal(recipe.id,'pistol-directional');let pose=p.pose(1/6);assert.equal(pose.clip,'Hit');assert.equal(pose.phase,.5);assert.ok(Math.abs(Math.hypot(pose.offset.x,pose.offset.z)-.1)<1e-12);
 pose=p.pose(1/3+.6);assert.equal(pose.clip,'Death');assert.ok(Math.abs(pose.phase-.25)<1e-12);
 assert.equal(p.start({recipeId:'decapitation'}),recipe); // one presentation per corpse
 assert.equal(p.pose(10).phase,.999999);p.dispose();p.dispose();
 const q=createFinisherPresentation({...fixture(),clips,isBlocked:()=>true});q.start({recipeId:'pistol-directional',damageType:'bullet',direction:{x:1,z:0}});assert.deepEqual(q.pose(1/6).offset,{x:0,z:0});q.dispose();
});
test('player/missing anatomy/missing direction/ineligible pistol cut never detach',()=>{
 const f=fixture(),p=createFinisherPresentation({...f,clips,isPlayer:true});assert.deepEqual(p.support,[]);assert.equal(p.start({recipeId:'decapitation',damageType:'bullet',direction:{x:1,z:0}}).id,'ordinary');p.dispose();
 for(const direction of [null,{x:0,z:0},{x:NaN,z:1}]){const q=createFinisherPresentation({...fixture(),clips});assert.equal(q.start({recipeId:'pistol-directional',damageType:'bullet',direction}).id,'ordinary');assert.equal(q.stats().detached,false);q.dispose();}
 assert.throws(()=>createFinisherPresentation({...fixture(),clips:[]}),TypeError);
});

for(const recipeId of ['decapitation','pistol-decapitation'])test(`${recipeId} uses refreshed world binds, owned snapshots and bounded elapsed motion`,()=>{
 const f=fixture(),bone=f.model.getObjectByName('Head');bone.position.y=1.7;
 const geometry=new T.CylinderGeometry(.08,.08,.3,12);geometry.translate(0,1.7,0);
 const count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 for(let i=0;i<count;i++)weights[i*4]=1;
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const texture=new T.Texture(),material=new T.MeshStandardMaterial({map:texture,color:0x805a3a}),skeleton=new T.Skeleton([bone]);
 for(const name of ['Photo','PhotoEyes','PhotoTeeth']){const mesh=new T.SkinnedMesh(geometry,material);mesh.name=name;f.model.add(mesh);mesh.bind(skeleton);}
 const neck=new T.Group();neck.name='Recovered_donor_lower_neck';f.model.add(neck);
 f.root.position.set(1,0,6);f.root.scale.setScalar(1.9);
 let borrowedDisposed=0,calls=0;for(const r of [geometry,material,texture])r.addEventListener('dispose',()=>borrowedDisposed++);
 const disposeSkeleton=skeleton.dispose.bind(skeleton);skeleton.dispose=()=>{borrowedDisposed++;disposeSkeleton();};
 const preparedClips=recipeId==='pistol-decapitation'?clips.filter(c=>c.name!=='Death_SplitCrown'):clips;
 const p=createFinisherPresentation({...f,clips:preparedClips,isBlocked:()=>{calls++;return false;}});
 assert.ok(p.support.some(s=>s.id===recipeId));
 if(recipeId==='pistol-decapitation')assert.ok(!p.support.some(s=>s.id==='decapitation'));
 p.start({recipeId,damageType:recipeId==='pistol-decapitation'?'bullet':'cutting',impactDirection:{x:1,z:0}});
 if(recipeId==='pistol-decapitation'){assert.equal(p.pose(1/6).clip,'Hit');assert.equal(p.pose(1/6).phase,.5);assert.ok(Math.abs(p.pose(1/3+.6).phase-.25)<1e-12);assert.equal(p.pose(1/3+.6).clip,'Death');}
 const part=f.scene.children.find(o=>o.name==='Prepared detached Hollow head');assert.ok(part);part.updateMatrixWorld(true);
 const source=f.model.getObjectByName('Photo'),copied=part.getObjectByName('Photo');
 assert.notEqual(copied.geometry,geometry);assert.notEqual(copied.material,material);assert.equal(copied.material.map,texture);
 const a=new T.Vector3().fromBufferAttribute(copied.geometry.attributes.position,0).applyMatrix4(copied.matrixWorld),b=new T.Vector3().fromBufferAttribute(geometry.attributes.position,0);source.applyBoneTransform(0,b).applyMatrix4(source.matrixWorld);
 assert.ok(a.distanceTo(b)<1e-5);assert.equal(source.visible,false);
 let ownedDisposed=0;copied.geometry.addEventListener('dispose',()=>ownedDisposed++);copied.material.addEventListener('dispose',()=>ownedDisposed++);
 calls=0;p.update(.5,.5);assert.ok(calls<=6);assert.ok(part.position.x>1.3); // full .5s impulse, not clamped .1s slowdown
 p.update(6,5.5);assert.equal(part.parent,null);assert.equal(p.stats().expired,true);
 p.dispose();p.dispose();assert.equal(source.visible,true);assert.equal(ownedDisposed,2);assert.equal(borrowedDisposed,0);
 geometry.dispose();material.dispose();texture.dispose();skeleton.dispose();
});
