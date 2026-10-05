import * as T from 'three';

const TARGETS=['Torn_modern_canvas_jacket','Hollow_body_and_worn_trousers'];
const SHAPE={pelvis:['spine_01',.82],spine_01:['spine_02',.66],spine_02:['spine_03',.68],spine_03:['neck_01',.82],
 upperarm_l:['lowerarm_l',.66],upperarm_r:['lowerarm_r',.66],lowerarm_l:['hand_l',.78],lowerarm_r:['hand_r',.78],
 thigh_l:['calf_l',.72],thigh_r:['calf_r',.72],calf_l:['foot_l',.82],calf_r:['foot_r',.82]};
function bodyPart(mesh){for(let node=mesh;node;node=node.parent)if(TARGETS.includes(node.name))return true;return false;}

// One cache per original foundation. Radial changes around original bind-bone
// segments keep joint centres, bone lengths, grips and native clips unchanged.
export function createGauntShapeLibrary(sourceModel){
 const shapes=new Map();let disposed=false,users=0;
 try{sourceModel.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!bodyPart(mesh))return;
  const source=mesh.geometry;if(shapes.has(source))return;
  const position=source.attributes.position, indices=source.attributes.skinIndex, weights=source.attributes.skinWeight;
  if(!position||!indices||!weights||mesh.morphTargetInfluences?.some(v=>v!==0))throw Error('Unsupported gaunt body geometry');
  const skeleton=mesh.skeleton, frames=skeleton.bones.map((bone,i)=>{
   const preset=SHAPE[bone.name];if(!preset)return null;
   const child=skeleton.bones.findIndex(b=>b.name===preset[0]);if(child<0)throw Error('Missing gaunt bind joint '+preset[0]);
   const origin=new T.Vector3().setFromMatrixPosition(skeleton.boneInverses[i].clone().invert());
   const axis=new T.Vector3().setFromMatrixPosition(skeleton.boneInverses[child].clone().invert()).sub(origin),length=axis.length();
   if(length<1e-6)throw Error('Invalid gaunt bind segment');return{origin,axis:axis.divideScalar(length),length,factor:preset[1],limb:/arm|thigh|calf/.test(bone.name)};
  });
  const geometry=source.clone(), output=geometry.attributes.position, unbind=mesh.bindMatrix.clone().invert();
  const point=new T.Vector3(), sum=new T.Vector3(), delta=new T.Vector3(), shaped=new T.Vector3();
  for(let vertex=0;vertex<position.count;vertex++){
   point.fromBufferAttribute(position,vertex).applyMatrix4(mesh.bindMatrix);sum.set(0,0,0);
   for(let slot=0;slot<4;slot++){
    const weight=weights.getComponent(vertex,slot);if(!weight)continue;
    const frame=frames[indices.getComponent(vertex,slot)];shaped.copy(point);
    if(frame){
     delta.copy(point).sub(frame.origin);const along=delta.dot(frame.axis);
     // Preserve limb joint envelopes; the muscle belly narrows between them.
     const envelope=frame.limb?Math.sin(Math.PI*T.MathUtils.clamp(along/frame.length,0,1)):1;
     const factor=1-(1-frame.factor)*envelope;
     delta.addScaledVector(frame.axis,-along);shaped.addScaledVector(delta,factor-1);
    }
    sum.addScaledVector(shaped,weight);
   }
   sum.applyMatrix4(unbind);output.setXYZ(vertex,sum.x,sum.y,sum.z);
  }
  geometry.computeVertexNormals();if(geometry.attributes.tangent&&geometry.index&&geometry.attributes.uv)geometry.computeTangents();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();shapes.set(source,geometry);
 });}catch(error){for(const shape of shapes.values())shape.dispose();throw error;}
 if(!shapes.size)throw Error('Gaunt foundation has no supported garments/body');
 return {
  apply(model){
   if(disposed)throw Error('Gaunt library disposed');const changed=[];
   model.traverse(mesh=>{const shape=bodyPart(mesh)&&shapes.get(mesh.geometry);if(shape){changed.push([mesh,mesh.geometry]);mesh.geometry=shape;}});
   if(!changed.length)throw Error('Gaunt actor does not share the original foundation');users++;let released=false;
   return{dispose(){if(released)return;released=true;for(const[mesh,source]of changed)if(mesh.geometry===shapes.get(source))mesh.geometry=source;users--;}};
  },
  stats(){return{geometries:shapes.size,users,bytes:[...shapes.values()].reduce((n,g)=>n+(g.index?.array.byteLength??0)+Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,0),0)};},
  dispose(){if(disposed)return;if(users)throw Error('Remove gaunt appearances before disposing their library');disposed=true;for(const shape of shapes.values())shape.dispose();shapes.clear();},
 };
}
