import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {prepareVictimGrounding,prepareVictimGroundingSteps} from '../src/finisher-grounding.js';
test('native victim floor table lifts affected indexed surfaces and restores all source transforms',()=>{
 const root=new T.Group(),model=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.4,.4,.4),new T.MeshBasicMaterial());root.add(model);model.add(mesh);root.position.set(3,0,2);root.scale.setScalar(1.15);model.position.set(.2,.3,.1);mesh.position.y=.5;const original=model.position.toArray(),vertices=mesh.geometry.attributes.position.array.slice();
 const clip=new T.AnimationClip('Death_RunThrough',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,0,0,0,-1,0])]);const floor=prepareVictimGrounding({model,root,clip});assert.deepEqual(model.position.toArray(),original);assert.deepEqual(mesh.geometry.attributes.position.array,vertices);assert.equal(floor.stats().samples,121);assert.equal(floor.stats().bytes,484);assert.equal(floor.stats().vertices,24);
 for(const phase of [.05,.25,.7,1]){const sampled=Math.min(.999999,phase),nativeFloor=.3-sampled;assert(nativeFloor+floor.lift(phase)>=.0039999);}assert(floor.stats().worstLocalFloor<-.69);mesh.geometry.dispose();mesh.material.dispose();
});
test('unsupported victim grounding fails before mutating actor or source geometry',()=>{const model=new T.Group(),root=new T.Group();root.add(model);assert.throws(()=>prepareVictimGrounding({model,root,clip:null}),/Invalid/);assert.throws(()=>prepareVictimGrounding({model,root,clip:new T.AnimationClip('Death_RunThrough',1,[])}),/vertex budget/);assert.deepEqual(model.position.toArray(),[0,0,0]);});
test('stepped sampling and compatible draw reuse retain the original lift table; changed pose and clip miss',()=>{
 const root=new T.Group(),model=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.4,.4,.4),new T.MeshBasicMaterial());root.add(model);model.add(mesh);mesh.position.y=.5;
 const clip=new T.AnimationClip('Death_RunThrough',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,0,0,0,-1,0])]),cache=new WeakMap(),options={root,model,clip,cache};
 const expected=prepareVictimGrounding({...options,cache:null}),first=prepareVictimGrounding(options),second=prepareVictimGrounding(options);
 assert.equal(first.stats().cacheHits,0);assert.equal(second.stats().cacheHits,1);
 for(let i=0;i<=240;i++)assert.equal(second.lift(i/240),expected.lift(i/240));
 root.position.set(17,0,-3);root.scale.setScalar(1.7);root.rotation.set(.1,.7,0);const moved=prepareVictimGrounding(options),movedUncached=prepareVictimGrounding({...options,cache:null});assert.equal(moved.stats().cacheHits,1);for(let i=0;i<=240;i++)assert.equal(moved.lift(i/240),movedUncached.lift(i/240));
 mesh.position.y=.7;const changed=prepareVictimGrounding(options);assert.equal(changed.stats().cacheHits,0);assert(changed.lift(1)<expected.lift(1));
 clip.tracks[0].values[4]=-2;assert.equal(prepareVictimGrounding(options).stats().cacheHits,0);
 mesh.geometry.dispose();mesh.material.dispose();
});
test('cancelling a yielded native sampling pass restores its actor and never installs partial cache',()=>{
 const root=new T.Group(),model=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.4,.4,.4,8,8,8),new T.MeshBasicMaterial());root.add(model);model.add(mesh);model.position.y=.3;
 const clip=new T.AnimationClip('Death_RunThrough',1,[new T.VectorKeyframeTrack('.position',[0,1],[0,0,0,0,-1,0])]),cache=new WeakMap(),original=globalThis.performance;let clock=0;
 try{globalThis.performance={now:()=>clock+=5};const steps=prepareVictimGroundingSteps({root,model,clip,cache});assert.equal(steps.next().done,false);steps.return();assert.equal(model.position.y,.3);assert.equal(cache.has(mesh.geometry),false);}
 finally{globalThis.performance=original;mesh.geometry.dispose();mesh.material.dispose();}
});
