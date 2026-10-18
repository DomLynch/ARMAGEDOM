import * as T from 'three';
// Actor-owned queries only: visible triangle contact, never an aim-target snap.
const visible=mesh=>{for(let n=mesh;n;n=n.parent)if(!n.visible)return false;return true;};
const vertex=(mesh,index)=>mesh.getVertexPosition(index,new T.Vector3()).applyMatrix4(mesh.matrixWorld);
export function traceGrenadeSurface(views,enemies,start,end){
 const from=new T.Vector3(start.x,start.y,start.z),to=new T.Vector3(end.x,end.y,end.z),delta=to.clone().sub(from),distance=delta.length();if(distance<1e-9)return null;
 const ray=new T.Raycaster(from,delta.normalize(),0,distance),meshes=[],owners=new Map();
 for(const enemy of enemies){if(enemy.hp<=0)continue;const view=views.get(enemy.id);if(!view)continue;view.root.updateWorldMatrix(true,true);
  view.model.traverse(mesh=>{if(!mesh.isMesh||!visible(mesh)||mesh.material?.side===T.BackSide)return;if(mesh.isSkinnedMesh){mesh.skeleton.update();mesh.computeBoundingSphere();if(mesh.boundingBox!==null)mesh.computeBoundingBox();}meshes.push(mesh);owners.set(mesh,enemy);});
 }
 const hit=ray.intersectObjects(meshes,false)[0];if(!hit?.face)return null;
 const mesh=hit.object,indices=[hit.face.a,hit.face.b,hit.face.c],triangle=indices.map(i=>vertex(mesh,i)),bary=T.Triangle.getBarycoord(hit.point,...triangle,new T.Vector3());if(!bary)return null;
 return{enemy:owners.get(mesh),position:{x:hit.point.x,y:hit.point.y,z:hit.point.z},anchor:{mesh,indices,weights:bary.toArray()}};
}
export function followGrenadeSurface(anchor,view){
 if(!anchor?.mesh||!view||!visible(anchor.mesh))return null;
 let inside=false;view.model.traverse(mesh=>{if(mesh===anchor.mesh)inside=true;});if(!inside)return null;
 view.root.updateWorldMatrix(true,true);anchor.mesh.skeleton?.update();const point=new T.Vector3();anchor.indices.forEach((index,i)=>point.addScaledVector(vertex(anchor.mesh,index),anchor.weights[i]));
 return Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z)?{x:point.x,y:point.y,z:point.z}:null;
}
