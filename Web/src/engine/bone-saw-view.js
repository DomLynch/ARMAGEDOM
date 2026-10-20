import{traceGrenadeSurface}from'./grenade-surface.js';
import * as T from 'three';
// Rigid original geometry, local Y follows the existing Knife hand/contact axis.
export function createBoneSaw(){
 const root=new T.Group();root.name='WeaponDrawn';const steel=new T.MeshStandardMaterial({color:0xadb5bc,metalness:.8,roughness:.33}),body=new T.MeshStandardMaterial({color:0x28494b,metalness:.5,roughness:.5}),grip=new T.MeshStandardMaterial({color:0x141719,roughness:.9});
 const part=(geo,mat,x,y,z)=>{const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 part(new T.BoxGeometry(.085,.24,.075),grip,0,.1,0);part(new T.BoxGeometry(.17,.22,.13),body,0,.3,0);part(new T.CylinderGeometry(.065,.065,.2,10),steel,0,.3,0).rotation.z=Math.PI/2;
 const blade=new T.Group();blade.name='Bone Saw reciprocating blade';root.add(blade);const mesh=new T.Mesh(new T.BoxGeometry(.065,.47,.018),steel);mesh.position.y=.62;blade.add(mesh);const toothGeo=new T.ConeGeometry(.022,.045,3);for(let i=0;i<11;i++){const tooth=new T.Mesh(toothGeo,steel);tooth.position.set(.047,.42+i*.041,0);tooth.rotation.z=-Math.PI/2;blade.add(tooth);}root.userData.sawBlade=blade;root.userData.contact={from:.4,to:.9};root.userData.saw=true;let disposed=false;root.userData.dispose=()=>{if(disposed)return;disposed=true;const geometries=new Set();root.traverse(m=>{if(m.geometry)geometries.add(m.geometry);});for(const g of geometries)g.dispose();for(const m of[steel,body,grip])m.dispose();};return root;
}
export function animateBoneSaw(root,time,active){const blade=root?.userData.sawBlade;if(blade)blade.position.y=active?Math.sin(time*170)*.016:0;}

export function boneSawContact(blade,views,target){if(!blade?.userData.saw)return false;const a=new T.Vector3(),b=new T.Vector3();for(const x of[-.035,0,.035]){blade.localToWorld(a.set(x,.4,0));blade.localToWorld(b.set(x,.9,0));if(traceGrenadeSurface(views,[target],a,b))return true;}return false;}
