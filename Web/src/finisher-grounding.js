import * as T from 'three';

// Only the affected native victim clip. Prepare during loading, restore the
// complete actor pose, then use a small LUT instead of a lethal-frame skin scan.
export function prepareVictimGrounding({model,root,clip,samples=120,maxVertices=150000}){
 if(!clip||!(clip.duration>0)||!Number.isSafeInteger(samples)||samples<1)throw Error('Invalid victim grounding clip');
 const transforms=[],draws=[];let vertices=0;
 model.traverse(node=>{transforms.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]);if(!node.isMesh||!node.geometry.attributes.position)return;for(let p=node;p;p=p.parent)if(!p.visible)return;const ids=node.geometry.index?Array.from(new Set(node.geometry.index.array)):Array.from({length:node.geometry.attributes.position.count},(_,i)=>i);vertices+=ids.length;draws.push({node,ids});});
 if(!draws.length||vertices>maxVertices)throw Error('Victim grounding vertex budget exceeded');
 const table=new Float32Array(samples+1),mixer=new T.AnimationMixer(model),point=new T.Vector3(),inverse=new T.Matrix4();let worstFloor=Infinity;
 const start=performance.now();
 try{const action=mixer.clipAction(clip);action.play();action.paused=true;for(let i=0;i<=samples;i++){
  action.time=Math.min(.999999,i/samples)*clip.duration;mixer.update(0);root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);model.traverse(n=>{if(n.skeleton)n.skeleton.update();});inverse.copy(root.matrixWorld).invert();let floor=Infinity;
  for(const{node,ids}of draws)for(const id of ids){node.getVertexPosition(id,point).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);if(!Number.isFinite(point.y))throw Error('Nonfinite victim floor');floor=Math.min(floor,point.y);}
  worstFloor=Math.min(worstFloor,floor);table[i]=Math.max(0,.004-floor);
 }}finally{mixer.stopAllAction();mixer.uncacheRoot(model);for(const[n,p,q,s]of transforms){n.position.copy(p);n.quaternion.copy(q);n.scale.copy(s);}root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);model.traverse(n=>{if(n.skeleton)n.skeleton.update();});}
 const prepMilliseconds=performance.now()-start;
 return{lift(phase){const t=T.MathUtils.clamp(phase,0,1)*samples,i=Math.min(samples-1,Math.floor(t));return Math.max(table[i],table[i+1]);},stats(){return{clip:clip.name,samples:samples+1,vertices,bytes:table.byteLength,worstLocalFloor:worstFloor,maxLocalLift:Math.max(...table),prepMilliseconds};}};
}
