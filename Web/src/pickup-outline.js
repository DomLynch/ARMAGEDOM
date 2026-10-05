import * as T from 'three';
// Static shape edges, including each cartridge instance. Borrow no ownership.
export function addPickupOutline(mesh){
 let geometry=new T.EdgesGeometry(mesh.geometry);
 if(mesh.isInstancedMesh){
  const edge=geometry.attributes.position,positions=new Float32Array(edge.count*mesh.count*3),matrix=new T.Matrix4(),point=new T.Vector3();
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);for(let j=0;j<edge.count;j++)point.fromBufferAttribute(edge,j).applyMatrix4(matrix).toArray(positions,(i*edge.count+j)*3);}
  geometry.dispose();geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(positions,3));
 }
 const material=new T.LineBasicMaterial({color:0xffcf55,toneMapped:false,depthTest:true,depthWrite:false}),outline=new T.LineSegments(geometry,material);outline.name='Pickup item outline';mesh.add(outline);
 let disposed=false;
 return {outline,dispose(){if(disposed)return;disposed=true;outline.removeFromParent();geometry.dispose();material.dispose();}};
}
