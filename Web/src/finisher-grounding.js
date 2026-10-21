import * as T from 'three';
const attributeIds=new WeakMap();let nextAttributeId=1;
const vertexIds=new WeakMap();
function attributeKey(attribute){if(!attribute)return null;if(!attributeIds.has(attribute))attributeIds.set(attribute,nextAttributeId++);return[attributeIds.get(attribute),attribute.version,attribute.count];}
function underRoot(node,root){for(let p=node;p;p=p.parent)if(p===root)return true;return false;}

// Native Three.js skinning multiplies these same two matrices for every
// weighted vertex. A sampled pose is immutable until the next mixer update.
// Keep its double-precision matrices private to this draw and this invocation;
// retain the native morph, bind and weighted-vector arithmetic unchanged.
function poseSkinSampler(node){
 if(!node.isSkinnedMesh||node.getVertexPosition!==T.SkinnedMesh.prototype.getVertexPosition||node.applyBoneTransform!==T.SkinnedMesh.prototype.applyBoneTransform)return null;
 const skeleton=node.skeleton,matrices=skeleton.bones.map(()=>new T.Matrix4());
 const indices=new T.Vector4(),weights=new T.Vector4(),base=new T.Vector3(),weighted=new T.Vector3();
 return {
  update(){for(let i=0;i<matrices.length;i++)matrices[i].multiplyMatrices(skeleton.bones[i].matrixWorld,skeleton.boneInverses[i]);},
  vertex(id,target){
   T.Mesh.prototype.getVertexPosition.call(node,id,target);
   indices.fromBufferAttribute(node.geometry.attributes.skinIndex,id);
   weights.fromBufferAttribute(node.geometry.attributes.skinWeight,id);
   base.copy(target).applyMatrix4(node.bindMatrix);target.set(0,0,0);
   for(let i=0;i<4;i++){const weight=weights.getComponent(i);if(weight!==0)target.addScaledVector(weighted.copy(base).applyMatrix4(matrices[indices.getComponent(i)]),weight);}
   return target.applyMatrix4(node.bindMatrixInverse);
  },
 };
}

// Only the affected native victim clip. Prepare during loading, restore the
// complete actor pose, then use a small LUT instead of a lethal-frame skin scan.
export function prepareVictimGrounding(options){
 const steps=prepareVictimGroundingSteps(options);for(;;){const step=steps.next();if(step.done)return step.value;}
}
// Dormant rigs can prepare the identical table between frames. Returning the
// iterator early restores their pose through the same cleanup as normal loading.
export function* prepareVictimGroundingSteps({model,root,clip,samples=120,maxVertices=150000,cache=null}){
 if(!clip||!(clip.duration>0)||!Number.isSafeInteger(samples)||samples<1)throw Error('Invalid victim grounding clip');
 const transforms=[],draws=[];let vertices=0;
 model.traverse(node=>{transforms.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]);if(!node.isMesh||!node.geometry.attributes.position)return;for(let p=node;p;p=p.parent)if(!p.visible)return;draws.push({node});});
 let indexSince=performance.now();
 for(const draw of draws){const g=draw.node.geometry,cached=vertexIds.get(g),index=g.index,position=g.attributes.position;
  if(cached&&cached.index===index&&cached.indexVersion===index?.version&&cached.position===position&&cached.count===position.count)draw.ids=cached.ids;
  else{const unique=new Set(),count=index?.count??position.count;for(let i=0;i<count;i++){unique.add(index?index.getX(i):i);if((i&255)===0&&performance.now()-indexSince>=4){yield 'victim-index';indexSince=performance.now();}}draw.ids=Array.from(unique);vertexIds.set(g,{index,indexVersion:index?.version,position,count:position.count,ids:draw.ids});}
  vertices+=draw.ids.length;
 }
 if(!draws.length||vertices>maxVertices)throw Error('Victim grounding vertex budget exceeded');
 // This optional cache belongs to the actor library. A draw's immutable geometry,
 // native clip and exact bind/rest transforms must match; face/material choices
 // on other draws do not alter its local floor. Store doubles until the original
 // combined Float32 lift table is made, preserving its rounding.
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 const clipSignature=JSON.stringify([clip.duration,clip.blendMode,clip.tracks.map(t=>[t.name,t.ValueTypeName,t.getInterpolation(),Array.from(t.times),Array.from(t.values)])]);
 let cacheHits=0,cacheHitsSkinned=0;
 for(const draw of draws){const {node}=draw,g=node.geometry;
  const chain=[],local=new T.Matrix4();for(let p=node;p&&p!==root;p=p.parent){chain.push([p.name,p.position.toArray(),p.quaternion.toArray(),p.scale.toArray()]);local.premultiply(new T.Matrix4().compose(p.position,p.quaternion,p.scale));}
  // Attached skin inverses include actor world placement. Reconstruct their
  // root-local inverse from unchanged local transforms, without rounding keys.
  const inverseBind=node.isSkinnedMesh&&node.bindMode===T.AttachedBindMode?local.invert().elements:node.bindMatrixInverse?.elements;
  draw.key=JSON.stringify([samples,chain,Object.entries(g.attributes).map(([name,a])=>[name,attributeKey(a)]),attributeKey(g.index),Object.entries(g.morphAttributes).map(([name,attrs])=>[name,attrs.map(attributeKey)]),node.morphTargetInfluences??[],node.bindMode,node.bindMatrix?.elements,inverseBind,node.skeleton?.bones.map(b=>[b.name,b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]),node.skeleton?.boneInverses.map(m=>m.elements)]);
  draw.cacheable=underRoot(node,root)&&(!node.isSkinnedMesh||node.bindMode===T.AttachedBindMode&&node.skeleton.bones.every(b=>underRoot(b,root)));
  const entry=draw.cacheable?cache?.get(g)?.get(clip):null;draw.bucket=entry?.signature===clipSignature?entry.rows:null;draw.cached=draw.bucket?.get(draw.key);draw.floors=draw.cached??new Float64Array(samples+1);if(draw.cached){cacheHits++;if(node.isSkinnedMesh)cacheHitsSkinned++;}
 }
 for(const draw of draws)if(!draw.cached)draw.sampler=poseSkinSampler(draw.node);
 const table=new Float32Array(samples+1),mixer=new T.AnimationMixer(model),point=new T.Vector3(),inverse=new T.Matrix4();let worstFloor=Infinity;
 let since=performance.now(),prepMilliseconds=0;
 try{const action=mixer.clipAction(clip);action.play();action.paused=true;for(let i=0;i<=samples;i++){
  action.time=Math.min(.999999,i/samples)*clip.duration;mixer.update(0);root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);model.traverse(n=>{if(n.skeleton)n.skeleton.update();});inverse.copy(root.matrixWorld).invert();let floor=Infinity;
  let reads=0;
  for(const draw of draws){let localFloor=draw.cached?draw.floors[i]:Infinity;if(!draw.cached){draw.sampler?.update();for(const id of draw.ids){(draw.sampler?draw.sampler.vertex(id,point):draw.node.getVertexPosition(id,point)).applyMatrix4(draw.node.matrixWorld).applyMatrix4(inverse);if(!Number.isFinite(point.y))throw Error('Nonfinite victim floor');localFloor=Math.min(localFloor,point.y);if((++reads&127)===0&&performance.now()-since>=4){prepMilliseconds+=performance.now()-since;yield 'victim-floor';since=performance.now();}}}draw.floors[i]=localFloor;floor=Math.min(floor,localFloor);}
  worstFloor=Math.min(worstFloor,floor);table[i]=Math.max(0,.004-floor);
  if(performance.now()-since>=4){prepMilliseconds+=performance.now()-since;yield 'victim-pose';since=performance.now();}
 }}finally{mixer.stopAllAction();mixer.uncacheRoot(model);for(const[n,p,q,s]of transforms){n.position.copy(p);n.quaternion.copy(q);n.scale.copy(s);}root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);model.traverse(n=>{if(n.skeleton)n.skeleton.update();});}
 prepMilliseconds+=performance.now()-since;
 if(cache)for(const draw of draws)if(draw.cacheable&&!draw.cached){let clips=cache.get(draw.node.geometry);if(!clips)cache.set(draw.node.geometry,clips=new WeakMap());let entry=clips.get(clip);if(!entry||entry.signature!==clipSignature)clips.set(clip,entry={signature:clipSignature,rows:new Map()});entry.rows.set(draw.key,draw.floors);}
 return{lift(phase){const t=T.MathUtils.clamp(phase,0,1)*samples,i=Math.min(samples-1,Math.floor(t));return Math.max(table[i],table[i+1]);},stats(){return{clip:clip.name,samples:samples+1,vertices,bytes:table.byteLength,worstLocalFloor:worstFloor,maxLocalLift:Math.max(...table),prepMilliseconds,cacheHits,cacheHitsSkinned,draws:draws.length};}};
}
