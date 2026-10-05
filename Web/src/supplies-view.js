import * as T from 'three';
// Original primitive-only pickup proxies. No texture/model fetch or scene lights.
export function createSupplyView({kind,count=3}={}){
 if(!['ammo','dressing'].includes(kind)||kind==='ammo'&&![2,3].includes(count))throw Error('Supply visual requires ammo2/3 or dressing');
 const root=new T.Group();root.name='Supply_'+kind;
 const geometries=[],materials=[];
 const geometry=g=>(geometries.push(g),g),material=m=>(materials.push(m),m);
 const cue=material(new T.MeshBasicMaterial({color:0xb48a4c,transparent:true,opacity:.16,depthWrite:false}));
 const ring=new T.Mesh(geometry(new T.RingGeometry(.235,.275,24)),cue);ring.rotation.x=-Math.PI/2;ring.position.y=.012;root.add(ring);
 if(kind==='ammo'){
  const brass=material(new T.MeshStandardMaterial({color:0xb49a65,metalness:.3,roughness:.72})),tip=material(new T.MeshStandardMaterial({color:0x574a39,metalness:.45,roughness:.7}));
  const cases=new T.InstancedMesh(geometry(new T.CylinderGeometry(.018,.019,.11,8)),brass,count),tips=new T.InstancedMesh(geometry(new T.ConeGeometry(.017,.035,8)),tip,count),dummy=new T.Object3D(),axis=new T.Vector3(0,1,0);
  for(let i=0;i<count;i++){
   dummy.position.set((i-1)*.027,.022,(i-1)*.066);dummy.rotation.set(0,[.24,-.28,.10][i],Math.PI/2);dummy.updateMatrix();cases.setMatrixAt(i,dummy.matrix);
   dummy.position.add(axis.clone().applyQuaternion(dummy.quaternion).multiplyScalar(.0725));dummy.updateMatrix();tips.setMatrixAt(i,dummy.matrix);
  }
  cases.instanceMatrix.needsUpdate=tips.instanceMatrix.needsUpdate=true;cases.scale.setScalar(1.6);tips.scale.setScalar(1.6);root.add(cases,tips);
 }else{
  const cloth=material(new T.MeshStandardMaterial({color:0xaaa38b,roughness:1,metalness:0})),dirt=material(new T.MeshStandardMaterial({color:0x514537,roughness:1})),ink=material(new T.MeshStandardMaterial({color:0x633e35,roughness:1}));
  const packet=new T.Mesh(geometry(new T.BoxGeometry(.26,.035,.18)),cloth);packet.position.y=.025;packet.rotation.y=-.16;packet.scale.setScalar(1.35);root.add(packet);
  // Muted printed cross and two dirty seams; surface detail is geometry.
  const detail=geometry(new T.BoxGeometry(1,.002,1)),marks=new T.InstancedMesh(detail,ink,2),seams=new T.InstancedMesh(detail,dirt,2),dummy=new T.Object3D();
  for(let i=0;i<2;i++){dummy.position.set(0,.019,0);dummy.scale.set(i===0?.020:.074,1,i===0?.074:.020);dummy.updateMatrix();marks.setMatrixAt(i,dummy.matrix);dummy.position.set(i===0?-.105:.105,.019,0);dummy.scale.set(.012,1,.16);dummy.updateMatrix();seams.setMatrixAt(i,dummy.matrix);}
  marks.instanceMatrix.needsUpdate=seams.instanceMatrix.needsUpdate=true;packet.add(marks,seams);
 }
 let disposed=false;
 return {root,update(time){if(disposed)return;cue.opacity=.16+.045*Math.sin((Number.isFinite(time)?time:0)*2.3);},dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.clear();}};
}
