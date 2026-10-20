import * as T from 'three';
// Actor-owned queries only: visible triangle contact, never an aim-target snap.
const visible=mesh=>{for(let n=mesh;n;n=n.parent)if(!n.visible)return false;return true;};
const vertex=(mesh,index)=>mesh.getVertexPosition(index,new T.Vector3()).applyMatrix4(mesh.matrixWorld);
// Bounds are a rejection test only. Every admitted hit still uses Three's exact
// posed triangles. Bone-local bind envelopes avoid skinning every distant vertex.
const attributeVersion=attribute=>attribute.isInterleavedBufferAttribute?attribute.data.version:attribute.version;
const envelopes=new WeakMap(),boundPoint=new T.Vector3(),boundMatrix=new T.Matrix4(),boneBox=new T.Box3();
function posedBounds(mesh){
 if(mesh.getVertexPosition!==T.SkinnedMesh.prototype.getVertexPosition||mesh.morphTargetInfluences?.some(value=>value!==0))return null;
 const geometry=mesh.geometry,position=geometry.attributes.position,indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight,skeleton=mesh.skeleton;
 if(!position||!indices||!weights||!skeleton)return null;
 let saved=envelopes.get(mesh);
 const unchanged=saved&&saved.geometry===geometry&&saved.position===position&&saved.indices===indices&&saved.weights===weights&&saved.versions[0]===attributeVersion(position)&&saved.versions[1]===attributeVersion(indices)&&saved.versions[2]===attributeVersion(weights)&&saved.skeleton===skeleton&&saved.bind.equals(mesh.bindMatrix)&&saved.inverses.length===skeleton.boneInverses.length&&saved.inverses.every((matrix,i)=>matrix.equals(skeleton.boneInverses[i]));
 if(!unchanged){
  saved={geometry,position,indices,weights,versions:[attributeVersion(position),attributeVersion(indices),attributeVersion(weights)],skeleton,bind:mesh.bindMatrix.clone(),inverses:skeleton.boneInverses.map(matrix=>matrix.clone()),boxes:new Map(),error:0,result:new T.Box3(),valid:true};
  for(let i=0;i<position.count&&saved.valid;i++){
   let sum=0;
   for(let j=0;j<4;j++){
    const weight=weights.getComponent(i,j),index=indices.getComponent(i,j);sum+=weight;
    if(!Number.isFinite(weight)||weight<0||weight>0&&(!Number.isInteger(index)||!skeleton.bones[index]||!skeleton.boneInverses[index])){saved.valid=false;break;}
    if(weight===0)continue;
    let box=saved.boxes.get(index);if(!box)saved.boxes.set(index,box=new T.Box3());
    boundPoint.fromBufferAttribute(position,i).applyMatrix4(mesh.bindMatrix).applyMatrix4(skeleton.boneInverses[index]);box.expandByPoint(boundPoint);
   }
   const error=Math.abs(sum-1);if(!Number.isFinite(sum)||error>1e-6)saved.valid=false;else saved.error=Math.max(saved.error,error);
  }
  envelopes.set(mesh,saved);
 }
 if(!saved.valid)return null; // Unusual weights/deformation retain the exact old path.
 const result=saved.result.makeEmpty();
 for(const[index,box]of saved.boxes)result.union(boneBox.copy(box).applyMatrix4(skeleton.bones[index].matrixWorld));
 if(result.isEmpty()||![...result.min.toArray(),...result.max.toArray()].every(Number.isFinite))return null;
 // Float weights need not sum to exactly one. Bound that small world-space error
 // before applying the mesh's bind inverse, including translated/nonuniform rigs.
 const extent=Math.max(...result.min.toArray().map(Math.abs),...result.max.toArray().map(Math.abs));
 result.expandByScalar(saved.error*extent+1e-7).applyMatrix4(mesh.bindMatrixInverse);
 return result;
}
// Tap-only selection query. Reuse the cached bone envelopes from projectile
// broad phase; never replace the mesh's collision bounds or skin every frame.
export function posedActorBounds(view){
 if(!view?.model)return null;view.root.updateWorldMatrix(true,false);view.root.updateMatrixWorld(true);
 const result=new T.Box3(),worldBox=new T.Box3();let found=false;
 view.model.traverse(mesh=>{
  if(!mesh.isMesh||!visible(mesh)||mesh.material?.side===T.BackSide)return;
  let bounds;
  if(mesh.isSkinnedMesh){mesh.skeleton.update();bounds=posedBounds(mesh);if(!bounds){mesh.computeBoundingBox();bounds=mesh.boundingBox;}}
  else{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();bounds=mesh.geometry.boundingBox;}
  if(!bounds||bounds.isEmpty())return;worldBox.copy(bounds).applyMatrix4(mesh.matrixWorld);result.union(worldBox);found=true;
 });
 return found?result:null;
}
// Aim is an intent envelope, never a collision or damage result. Derive it from
// the current rendered bones/geometry; low bodies still fall back to ground.
export function surfaceAimHeight(views,enemy,start,end){
 const view=views.get(enemy?.id);if(!view||!(enemy.hp>0))return .05;
 view.root.updateWorldMatrix(true,true);
 const origin=new T.Vector3(start.x,start.y,start.z),delta=new T.Vector3(end.x,end.y,end.z).sub(origin),distance=delta.length();if(distance<1e-9)return .05;
 const ray=new T.Ray(origin,delta.normalize()),local=new T.Ray();let found=false,unknown=false;
 view.model.traverse(mesh=>{
  if(found||!mesh.isMesh||!visible(mesh)||mesh.material?.side===T.BackSide)return;
  let bounds;if(mesh.isSkinnedMesh){mesh.skeleton.update();bounds=posedBounds(mesh);if(!bounds){unknown=true;return;}}
  else{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();bounds=mesh.geometry.boundingBox;}
  const at=local.copy(ray).applyMatrix4(boundMatrix.copy(mesh.matrixWorld).invert()).intersectBox(bounds,boundPoint);
  if(bounds.containsPoint(local.origin)||at&&at.applyMatrix4(mesh.matrixWorld).distanceTo(origin)<=distance+1e-7)found=true;
 });
 return found||unknown&&traceGrenadeSurface(views,[enemy],start,end)?end.y:.05;
}
// Reuse exact posed positions across bounds and indexed triangle tests in one query.
// Float64 preserves JS coordinates; no geometry, skeleton or cross-frame cache changes.
function queryVertices(){
 let positions=new Float64Array(0),seen=new Uint8Array(0);
 return(mesh,query)=>{
  if(!mesh.isSkinnedMesh)return query();
  const count=mesh.geometry.attributes.position.count;
  if(seen.length<count){positions=new Float64Array(count*3);seen=new Uint8Array(count);}else seen.fill(0,0,count);
  const descriptor=Object.getOwnPropertyDescriptor(mesh,'getVertexPosition'),original=mesh.getVertexPosition;
  mesh.getVertexPosition=function(index,target){const offset=index*3;if(!seen[index]){original.call(this,index,target);positions[offset]=target.x;positions[offset+1]=target.y;positions[offset+2]=target.z;seen[index]=1;}return target.set(positions[offset],positions[offset+1],positions[offset+2]);};
  try{return query();}finally{if(descriptor)Object.defineProperty(mesh,'getVertexPosition',descriptor);else delete mesh.getVertexPosition;}
 };
}
export function traceGrenadeSurface(views,enemies,start,end,{pierce=false}={}){
 const from=new T.Vector3(start.x,start.y,start.z),to=new T.Vector3(end.x,end.y,end.z),delta=to.clone().sub(from),distance=delta.length();if(distance<1e-9)return null;
 const ray=new T.Raycaster(from,delta.normalize(),0,distance),meshes=[],owners=new Map();
 for(const enemy of enemies){if(enemy.hp<=0)continue;const view=views.get(enemy.id);if(!view)continue;view.root.updateWorldMatrix(true,true);
  view.model.traverse(mesh=>{if(!mesh.isMesh||!visible(mesh)||mesh.material?.side===T.BackSide)return;meshes.push(mesh);owners.set(mesh,enemy);});
 }
 const memo=queryVertices(),hits=[],localRay=new T.Ray();
 for(const mesh of meshes){
  let bounds=null;if(mesh.isSkinnedMesh){mesh.skeleton.update();bounds=posedBounds(mesh);if(bounds){localRay.copy(ray.ray).applyMatrix4(boundMatrix.copy(mesh.matrixWorld).invert());const at=localRay.intersectBox(bounds,boundPoint);if(!bounds.containsPoint(localRay.origin)&&(!at||at.applyMatrix4(mesh.matrixWorld).distanceTo(from)>distance+1e-7))continue;}}
  memo(mesh,()=>{if(mesh.isSkinnedMesh){if(bounds){mesh.boundingSphere??=new T.Sphere();bounds.getBoundingSphere(mesh.boundingSphere);if(mesh.boundingBox!==null)mesh.boundingBox.copy(bounds);}else{mesh.computeBoundingSphere();if(mesh.boundingBox!==null)mesh.computeBoundingBox();}}ray.intersectObject(mesh,false,hits);});
 }
 hits.sort((a,b)=>a.distance-b.distance);if(pierce){const seen=new Set(),result=[];for(const hit of hits){const enemy=owners.get(hit.object);if(!enemy||seen.has(enemy.id))continue;seen.add(enemy.id);result.push({enemy,position:{x:hit.point.x,y:hit.point.y,z:hit.point.z},distance:hit.distance});if(result.length>=32)break;}return result;}const hit=hits[0];if(!hit?.face)return null;
 const mesh=hit.object,indices=[hit.face.a,hit.face.b,hit.face.c],triangle=indices.map(i=>vertex(mesh,i)),bary=T.Triangle.getBarycoord(hit.point,...triangle,new T.Vector3());if(!bary)return null;
 return{enemy:owners.get(mesh),position:{x:hit.point.x,y:hit.point.y,z:hit.point.z},anchor:{mesh,indices,weights:bary.toArray()}};
}
export function followGrenadeSurface(anchor,view){
 if(!anchor?.mesh||!view||!visible(anchor.mesh))return null;
 let inside=false;view.model.traverse(mesh=>{if(mesh===anchor.mesh)inside=true;});if(!inside)return null;
 view.root.updateWorldMatrix(true,true);anchor.mesh.skeleton?.update();const point=new T.Vector3();anchor.indices.forEach((index,i)=>point.addScaledVector(vertex(anchor.mesh,index),anchor.weights[i]));
 return Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z)?{x:point.x,y:point.y,z:point.z}:null;
}

export function traceRailgunSurface(views,enemies,start,end){return traceGrenadeSurface(views,enemies,start,end,{pierce:true})??[];}
