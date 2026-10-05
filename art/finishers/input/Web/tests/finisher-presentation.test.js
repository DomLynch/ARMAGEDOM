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
