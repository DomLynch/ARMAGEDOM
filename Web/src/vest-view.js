import * as T from 'three';
import {addPickupGlow} from './pickup-glow.js';

// ONE fitted cloth overlay. Reads the original bind geometry/weights; never edits it.
export function createVestView(model){
 const donor=model?.getObjectByName('Gambeson');
 if(!donor?.isSkinnedMesh)throw Error('Worn vest requires original player Gambeson rig');
 const owned=[],own=g=>(owned.push(g),g),root=new T.Group();root.name='WornVest';root.visible=false;
 const skeleton=new T.Skeleton(donor.skeleton.bones,donor.skeleton.boneInverses.map(m=>m.clone())),triangles=[];
 const allowed=new Set(['pelvis','spine_01','spine_02','spine_03','clavicle_l','clavicle_r','neck_01']);
 const targetIndex=new Map(skeleton.bones.map((b,i)=>[b.name,i]));
 model.traverse(o=>{if(!o.isSkinnedMesh||!['Steel','Gambeson','Heraldry','LeatherBody','Skin'].includes(o.name))return;
  const p=o.geometry.attributes.position,si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight,idx=o.geometry.index;
  if(!si||!sw)return;
  const weights=i=>{const out=[];for(let k=0;k<4;k++){const w=sw.getComponent(i,k),bone=o.skeleton.bones[si.getComponent(i,k)]?.name;if(w>0&&targetIndex.has(bone))out.push([targetIndex.get(bone),w]);}return out;};
  for(let i=0;i<(idx?.count??p.count);i+=3){const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k),points=ids.map(n=>new T.Vector3().fromBufferAttribute(p,n));
   if(points.some(v=>Math.abs(v.x)>.29||v.y<.98||v.y>1.57))continue;
   const ws=ids.map(weights);if(ws.some(row=>row.reduce((sum,[n,w])=>sum+(allowed.has(skeleton.bones[n].name)?w:0),0)<.8))continue;
   triangles.push({points,ws});
  }
 });
 if(!triangles.length){skeleton.dispose();throw Error('Original torso fitting surface unavailable');}
 const positions=[],indices=[],skinIndices=[],skinWeights=[],colours=[],ray=new T.Ray(),hit=new T.Vector3(),bary=new T.Vector3(),colour=new T.Color();
 function vertex(origin,direction,offset,shade,bridge=false){
  ray.set(origin,direction);let best=Infinity,selected=null,point=null;
  for(const t of triangles){if(!ray.intersectTriangle(...t.points,false,hit))continue;const distance=hit.distanceTo(origin);if(distance<best){best=distance;selected=t;point=hit.clone();}}
  // The donor has an open collar: a short strap bridges its gap, using the
  // nearest preserved torso weights rather than inventing a new rig influence.
  let bridgePoint=false;
  if(!selected&&bridge){for(const t of triangles){new T.Triangle(...t.points).closestPointToPoint(origin,hit);const distance=hit.distanceTo(origin);if(distance<best){best=distance;selected=t;point=hit.clone();}}bridgePoint=true;}
  if(!selected)throw Error('Vest fitting ray missed original torso at '+origin.toArray()+' direction '+direction.toArray());
  T.Triangle.getBarycoord(point,...selected.points,bary);const weights=new Map();
  selected.ws.forEach((row,i)=>row.forEach(([n,w])=>weights.set(n,(weights.get(n)??0)+w*bary.getComponent(i))));
  const row=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=row.reduce((n,p)=>n+p[1],0);while(row.length<4)row.push([0,0]);
  if(bridgePoint){point.x=origin.x;point.z=origin.z;}
  point.addScaledVector(direction,-offset);positions.push(...point.toArray());skinIndices.push(...row.map(p=>p[0]));skinWeights.push(...row.map(p=>p[1]/sum));colour.setHex(0x6e7770).multiplyScalar(shade);colours.push(...colour.toArray());return positions.length/3-1;
 }
 function grid(rows,cols,make){const start=positions.length/3;for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)make(y/rows,x/cols,y,x);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=start+y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}}
 try{
  // Open neck/arm holes: torso wrap below the shoulders, two short shoulder straps.
  grid(7,32,(v,u,y,x)=>{const angle=u*Math.PI*2,d=new T.Vector3(Math.sin(angle),0,Math.cos(angle)),height=1.06+v*(.335-.07*Math.abs(Math.sin(angle))**4);const shade=y===0||y===7?.52:((x%7===0||y===2&&x%5<2)?.64:.88);vertex(new T.Vector3(d.x*.36,height,d.z*.36),d.negate(),.012,shade);});
  for(const side of [-1,1])grid(12,2,(v,u,y)=>{const x=side*(.095+u*.055),z=-.095+v*.20;vertex(new T.Vector3(x,1.7,z),new T.Vector3(0,-1,0),.009,u===0||u===1?.55:.92,true);});
 }catch(e){skeleton.dispose();throw e;}
 const geometry=own(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));geometry.setAttribute('color',new T.Float32BufferAttribute(colours,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,metalness:0,side:T.DoubleSide});
 const mesh=new T.SkinnedMesh(geometry,material);mesh.name='Worn cloth vest';mesh.frustumCulled=false;mesh.position.copy(donor.position);mesh.quaternion.copy(donor.quaternion);mesh.scale.copy(donor.scale);mesh.bind(skeleton,donor.bindMatrix);root.add(mesh);donor.parent.add(root);
 let disposed=false;
 return {root,setVisible(value){if(!disposed)root.visible=!!value;},update(){if(!disposed&&root.visible){root.updateWorldMatrix(true,true);skeleton.update();}},dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of owned)g.dispose();material.dispose();skeleton.dispose();root.clear();}};
}

// A single original primitive bag, independent of rig/equipment and pickup rules.
export function createVestBagView(){
 const root=new T.Group();root.name='WornVestBag';
 const geometry=new T.BoxGeometry(.34,.18,.24),cloth=new T.MeshStandardMaterial({color:0x706a50,roughness:1}),bag=new T.Mesh(geometry,cloth);bag.position.y=.10;bag.rotation.y=.18;root.add(bag);
 const seamGeometry=new T.BoxGeometry(.36,.025,.065),seamMaterial=new T.MeshStandardMaterial({color:0x383629,roughness:1}),strap=new T.Mesh(seamGeometry,seamMaterial);strap.position.y=.2;strap.rotation.y=.18;root.add(strap);
 const cueGeometry=new T.RingGeometry(.30,.34,24),cueMaterial=new T.MeshBasicMaterial({color:0xb48a4c,transparent:true,opacity:.16,depthWrite:false}),cue=new T.Mesh(cueGeometry,cueMaterial);cue.rotation.x=-Math.PI/2;cue.position.y=.012;root.add(cue);
 const glows=[addPickupGlow(bag),addPickupGlow(strap)];
 let disposed=false;
 return {root,setVisible(value){if(!disposed)root.visible=!!value;},update(time){if(!disposed)cueMaterial.opacity=.16+.045*Math.sin((Number.isFinite(time)?time:0)*2.3);},dispose(){if(disposed)return;disposed=true;for(const o of glows)o.dispose();root.removeFromParent();geometry.dispose();seamGeometry.dispose();cueGeometry.dispose();cloth.dispose();seamMaterial.dispose();cueMaterial.dispose();root.clear();}};
}
