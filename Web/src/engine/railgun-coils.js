import * as T from'three';
// Existing rigid Rifle root/hand/pose stays owner; two bounded decorative draws, no lights/colliders.
export function createRailgunCoils(root){
 const group=new T.Group();group.name='Thundercoil amber coils';root.add(group);const geometry=new T.TorusGeometry(.062,.012,5,16),material=new T.MeshStandardMaterial({color:0x80542e,metalness:.8,roughness:.35,emissive:0xff9a28,emissiveIntensity:.2}),rings=new T.InstancedMesh(geometry,material,3),pose=new T.Object3D();rings.name='Thundercoil three rings';rings.frustumCulled=false;
 for(let i=0;i<3;i++){pose.position.set(0,.09,.37+i*.085);pose.updateMatrix();rings.setMatrixAt(i,pose.matrix);}group.add(rings);
 const arcGeometry=new T.BufferGeometry().setFromPoints([new T.Vector3(-.04,.13,.35),new T.Vector3(.035,.16,.4),new T.Vector3(-.03,.14,.46),new T.Vector3(.04,.13,.52),new T.Vector3(0,.09,.61)]),arcMaterial=new T.LineBasicMaterial({color:0xffd584,transparent:true,opacity:0,depthWrite:false}),arc=new T.Line(arcGeometry,arcMaterial);arc.name='Thundercoil finite charge arc';group.add(arc);let disposed=false;
 return{root:group,update({charging=false,progress=0,time=0,visible=true}={}){if(disposed)return;group.visible=visible;const n=Math.max(0,Math.min(1,progress));material.emissiveIntensity=charging?.25+n*2:.2;arc.visible=charging;arcMaterial.opacity=charging?.25+.4*n+.2*Math.sin(time*31)**2:0;},dispose(){if(disposed)return;disposed=true;group.removeFromParent();geometry.dispose();material.dispose();arcGeometry.dispose();arcMaterial.dispose();}};
}
