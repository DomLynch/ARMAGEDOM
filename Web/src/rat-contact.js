import * as T from 'three';

// Native pose snapshots only: this receiver never samples/advances animation.
// Chunk bone bounds cull first; skin only vertices needed by an active query.
export function createRatBiteReceiver(model, bindings) {
 const groups=[];
 for(const binding of bindings){
  const mesh=model.getObjectByName(binding.runtimeName),g=mesh?.geometry;
  if(!mesh?.isSkinnedMesh||!g?.index||!g.attributes.skinIndex||!g.attributes.skinWeight)throw Error('Unsupported lower-leg mesh '+binding.runtimeName);
  const p=g.attributes.position,ix=g.attributes.skinIndex,w=g.attributes.skinWeight,vertices=new Map();
  for(const face of binding.faceBindings)for(let k=0;k<3;k++){
   const i=face.vertices[k];if(g.index.getX(face.face*3+k)!==i)throw Error('Lower-leg topology mismatch');
   if(vertices.has(i))continue;const source=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.bindMatrix),terms=[];let sum=0;
   for(let j=0;j<4;j++){const weight=w.getComponent(i,j);if(!weight)continue;const bone=ix.getComponent(i,j);if(weight<0||!mesh.skeleton.bones[bone])throw Error('Invalid receiver weights');sum+=weight;terms.push({bone,weight,point:source.clone().applyMatrix4(mesh.skeleton.boneInverses[bone])});}
   if(Math.abs(sum-1)>1e-5)throw Error('Receiver weights not normalized');vertices.set(i,terms);
  }
  for(let n=0;n<binding.faceBindings.length;n+=64){
   const faces=binding.faceBindings.slice(n,n+64),bounds=new Map();
   for(const f of faces)for(const i of f.vertices)for(const t of vertices.get(i)){if(!bounds.has(t.bone))bounds.set(t.bone,new T.Box3());bounds.get(t.bone).expandByPoint(t.point);}
   groups.push({mesh,geometry:g,faces,vertices,bounds});
  }
 }
 let disposed=false;
 return {
  capture(){
   if(disposed)throw Error('Receiver disposed');model.updateMatrixWorld(true);const matrices=new Map(),cache=new Map();
   for(const{mesh}of groups)if(!matrices.has(mesh)){mesh.skeleton.update();const transform=mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse);matrices.set(mesh,mesh.skeleton.bones.map(b=>transform.clone().multiply(b.matrixWorld)));}
   return {owner:groups,matrices,cache,groups:groups.map(g=>{
    if(g.mesh.geometry!==g.geometry)throw Error('Receiver geometry changed');let visible=true;for(let n=g.mesh;n;n=n.parent)visible&&=n.visible;
    const box=new T.Box3();for(const[bone,b]of g.bounds)box.union(b.clone().applyMatrix4(matrices.get(g.mesh)[bone]));return{visible,box};
   })};
  },
  sweep(before,after,from,to){
   if(disposed||before?.owner!==groups||after?.owner!==groups)throw Error('Wrong receiver snapshot');
   if(![from,to].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw Error('Invalid tooth segment');
   const query=new T.Box3().setFromPoints([new T.Vector3(...from),new T.Vector3(...to)]),stats={groups:groups.length,candidates:0,triangles:0,skinnedVertices:0};let hit=null;
   const vertex=(snapshot,g,i)=>{let cache=snapshot.cache.get(g.mesh);if(!cache){cache=new Map();snapshot.cache.set(g.mesh,cache);}if(!cache.has(i)){const v=new T.Vector3();for(const t of g.vertices.get(i))v.addScaledVector(t.point.clone().applyMatrix4(snapshot.matrices.get(g.mesh)[t.bone]),t.weight);cache.set(i,v.toArray());stats.skinnedVertices++;}return cache.get(i);};
   for(let i=0;i<groups.length;i++){
    if(!before.groups[i].visible||!after.groups[i].visible||!before.groups[i].box.clone().union(after.groups[i].box).intersectsBox(query))continue;
    stats.candidates++;const g=groups[i];for(const f of g.faces){stats.triangles++;const a=f.vertices.map(i=>vertex(before,g,i)),b=f.vertices.map(i=>vertex(after,g,i)),time=sweptToothTriangle(from,to,a,b);if(time!==null&&(!hit||time<hit.time))hit={mesh:g.mesh.name,face:f.face,time};}
   }
   return {hit,stats};
  },
  dispose(){disposed=true;groups.length=0;},
 };
}

const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const EPS=1e-10;
function roots(c){
 const scale=Math.max(...c.map(Math.abs));if(scale>0)c=c.map(v=>v/scale);
 const value=t=>((c[3]*t+c[2])*t+c[1])*t+c[0],cuts=[0,1],a=3*c[3],b=2*c[2],d=c[1];
 if(Math.abs(a)<EPS){if(Math.abs(b)>EPS)cuts.push(-d/b);}else{const q=b*b-4*a*d;if(q>=0){cuts.push((-b-Math.sqrt(q))/(2*a),(-b+Math.sqrt(q))/(2*a));}}
 const sorted=cuts.filter(t=>t>=0&&t<=1).sort((a,b)=>a-b),found=sorted.filter(t=>Math.abs(value(t))<EPS);
 for(let i=1;i<sorted.length;i++){let l=sorted[i-1],r=sorted[i];if(value(l)*value(r)>=0)continue;for(let n=0;n<48;n++){const m=(l+r)/2;if(value(l)*value(m)<=0)r=m;else l=m;}found.push((l+r)/2);}
 return found.sort((a,b)=>a-b);
}
// Exact plane crossings for linearly moving point/triangle within one tick.
// Coplanar interior travel is deliberately fail-closed except endpoint contact.
export function sweptToothTriangle(from,to,before,after){
 const u=sub(from,before[0]),du=sub(sub(to,after[0]),u),v=sub(before[1],before[0]),dv=sub(sub(after[1],after[0]),v),w=sub(before[2],before[0]),dw=sub(sub(after[2],after[0]),w);
 const n=cross(v,w),dn=cross(dv,w).map((x,i)=>x+cross(v,dw)[i]),ddn=cross(dv,dw);
 const c=[dot(u,n),dot(du,n)+dot(u,dn),dot(du,dn)+dot(u,ddn),dot(du,ddn)];
 for(const t of roots(c)){
  const triangle=before.map((p,i)=>mix(p,after[i],t)),point=mix(from,to,t),ab=sub(triangle[1],triangle[0]),ac=sub(triangle[2],triangle[0]),ap=sub(point,triangle[0]),normal=cross(ab,ac),area=dot(normal,normal);
  if(area<EPS*EPS)continue;const b=dot(cross(ap,ac),normal)/area,c=dot(cross(ab,ap),normal)/area;
  if(b>=-EPS&&c>=-EPS&&b+c<=1+EPS)return t;
 }
 return null;
}

// Actor-root-local bake includes inner asset root; this matrix is ONLY the
// displayed actor root, in renderer coordinates. No combatScale substitution.
export function ratLowBlade(path,age,displayRootMatrix){
 if(!Number.isFinite(age)||age<0||path.hz!==60||path.frames.length!==55)throw Error('Invalid low-strike age/path');
 const frame=Math.min(54,age*60),i=Math.floor(frame),a=path.frames[i],b=path.frames[Math.min(i+1,54)],t=frame-i;
 return ['from','to'].map(key=>new T.Vector3(...mix(a[key],b[key],t)).applyMatrix4(displayRootMatrix).toArray());
}
