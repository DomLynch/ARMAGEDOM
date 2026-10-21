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

test('pose-local skin matrices exactly retain native floors for morphs, nonunit weights, binds and moved roots',()=>{
 const root=new T.Group(),model=new T.Group(),geometry=new T.BoxGeometry(.4,.4,.4),a=new T.Bone(),b=new T.Bone();a.name='Hip';b.name='Foot';a.add(b);b.position.y=.3;
 const count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 for(let i=0;i<count;i++){indices.set([0,1,0,1],i*4);weights.set(i%3===0?[0,0,0,0]:i%3===1?[.2,.3,.1,.1]:[.1,.2,.3,.4],i*4);}
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const morph=geometry.attributes.position.clone();for(let i=0;i<count;i++)morph.setY(i,morph.getY(i)-.2);geometry.morphAttributes.position=[morph];
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());root.add(model);model.add(mesh,a);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([a,b]),new T.Matrix4().makeTranslation(.15,-.1,.05));mesh.morphTargetInfluences[0]=.7;
 root.position.set(17,-.2,-3);root.scale.set(1.7,.8,1.2);root.rotation.set(.2,.7,-.15);model.rotation.z=.2;
 const clip=new T.AnimationClip('Death_RunThrough',1,[new T.VectorKeyframeTrack('Hip.position',[0,1],[0,0,0,.1,-.8,.2]),new T.QuaternionKeyframeTrack('Foot.quaternion',[0,1],[0,0,0,1,0,0,Math.sin(.3),Math.cos(.3)])]);
 const options={root,model,clip},actual=prepareVictimGrounding(options),native=mesh.getVertexPosition;let nativeCalls=0;
 mesh.getVertexPosition=function(...args){nativeCalls++;return native.apply(this,args);};
 const expected=prepareVictimGrounding(options);assert(nativeCalls>0,'custom vertex methods retain native dispatch');delete mesh.getVertexPosition;
 for(let i=0;i<=240;i++)assert.equal(actual.lift(i/240),expected.lift(i/240));assert.equal(actual.stats().worstLocalFloor,expected.stats().worstLocalFloor);
 const apply=mesh.applyBoneTransform;let customCalls=0;mesh.applyBoneTransform=function(...args){customCalls++;return apply.apply(this,args);};const custom=prepareVictimGrounding(options);assert(customCalls>0,'custom skin transforms retain native dispatch');for(let i=0;i<=240;i++)assert.equal(custom.lift(i/240),expected.lift(i/240));
 geometry.dispose();mesh.material.dispose();
});

test('cancellation after a skinned pose update and nonfinite skin failure restore pose without partial cache',()=>{
 const root=new T.Group(),model=new T.Group(),bone=new T.Bone(),geometry=new T.BoxGeometry(.4,.4,.4,8,8,8);bone.name='Hip';bone.position.y=.3;
 const count=geometry.attributes.position.count,weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());root.add(model);model.add(mesh,bone);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([bone]));
 const clip=new T.AnimationClip('Death_RunThrough',1,[new T.VectorKeyframeTrack('Hip.position',[0,1],[0,-.2,0,0,-1,0])]),cache=new WeakMap(),original=globalThis.performance,pose=bone.position.toArray();let clock=0;
 try{
  globalThis.performance={now:()=>clock+=5};const steps=prepareVictimGroundingSteps({root,model,clip,cache});let updated=false;
  for(let i=0;i<1000;i++){const step=steps.next();assert(!step.done);if(step.value==='victim-floor'||step.value==='victim-pose'){updated=true;break;}}
  assert(updated);assert.notDeepEqual(bone.position.toArray(),pose);steps.return();assert.deepEqual(bone.position.toArray(),pose);assert.equal(cache.has(geometry),false);
 }finally{globalThis.performance=original;}
 mesh.skeleton.boneInverses[0].elements[0]=NaN;assert.throws(()=>prepareVictimGrounding({root,model,clip,cache}),/Nonfinite victim floor/);assert.deepEqual(bone.position.toArray(),pose);assert.equal(cache.has(geometry),false);
 geometry.dispose();mesh.material.dispose();
});

test('invocation-local native inputs invalidate on generator resume after attribute, interleaved, geometry and bind changes',()=>{
 function run(change,forceNative){
  const root=new T.Group(),model=new T.Group(),bone=new T.Bone(),geometry=new T.BoxGeometry(.4,.4,.4,4,4,4);bone.name='Hip';root.add(model);model.add(bone);
  const count=geometry.attributes.position.count,weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  if(change==='interleaved'){
   const data=new Float32Array(count*4),p=geometry.attributes.position;for(let i=0;i<count;i++)data.set([p.getX(i),p.getY(i),p.getZ(i),0],i*4);
   geometry.setAttribute('position',new T.InterleavedBufferAttribute(new T.InterleavedBuffer(data,4),3,0));
  }
  const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());model.add(mesh);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([bone]));
  if(forceNative){const original=mesh.getVertexPosition;mesh.getVertexPosition=function(...args){return original.apply(this,args);};}
  const clip=new T.AnimationClip('Death_RunThrough',1,[new T.VectorKeyframeTrack('Hip.position',[0,1],[0,0,0,0,-1,0])]),original=globalThis.performance;let clock=0,floors=0,mutated=false,result;
  try{
   globalThis.performance={now:()=>clock+=5};const iterator=prepareVictimGroundingSteps({root,model,clip,samples:3});
   for(;;){const step=iterator.next();if(step.done){result=step.value;break;}
    // First pose fills the input slots; change while the second pose is yielded.
    if(step.value==='victim-floor'&&++floors===2){
     const g=mesh.geometry,p=g.attributes.position;
     if(change==='bind')mesh.bindMatrix.makeTranslation(0,-.2,0);
     else if(change==='weights'){for(let i=0;i<count;i++)g.attributes.skinWeight.setX(i,.3);g.attributes.skinWeight.needsUpdate=true;}
     else if(change==='geometry'){mesh.geometry=g.clone();for(let i=0;i<count;i++)mesh.geometry.attributes.position.setY(i,p.getY(i)-.2);}
     else{for(let i=0;i<count;i++)p.setY(i,p.getY(i)-.2);if(change==='interleaved')p.data.needsUpdate=true;else p.needsUpdate=true;}
     mutated=true;
    }
   }
  }finally{globalThis.performance=original;}
  assert(mutated);geometry.dispose();if(mesh.geometry!==geometry)mesh.geometry.dispose();mesh.material.dispose();return result;
 }
 for(const change of ['position','weights','geometry','bind','interleaved']){
  const actual=run(change,false),expected=run(change,true);for(let i=0;i<=12;i++)assert.equal(actual.lift(i/12),expected.lift(i/12),change+' at-yield native floor');assert.equal(actual.stats().worstLocalFloor,expected.stats().worstLocalFloor,change);
 }
});

test('input reuse allocation is capped by total selected vertices across draws',()=>{
 const root=new T.Group(),model=new T.Group(),bone=new T.Bone(),geometry=new T.BufferGeometry(),count=42000,weights=new Float32Array(count*4);bone.name='Hip';root.add(model);model.add(bone);
 geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(count*3),3));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const material=new T.MeshBasicMaterial();for(let i=0;i<4;i++){const mesh=new T.SkinnedMesh(geometry,material);model.add(mesh);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([bone]));}
 const clip=new T.AnimationClip('Death_RunThrough',1,[]),original=globalThis.Float64Array,lengths=[];
 try{globalThis.Float64Array=class extends original{constructor(size){super(size);lengths.push(size);}};const result=prepareVictimGrounding({root,model,clip,samples:1,maxVertices:200000});assert.equal(result.stats().vertices,168000);assert(lengths.length>0);assert(lengths.every(n=>n===2),'over-total-budget draws keep native input reads, no per-draw input arrays');}
 finally{globalThis.Float64Array=original;geometry.dispose();material.dispose();}
});
