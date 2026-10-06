import * as T from 'three';
const ROLES=new Set(['Weathered brindle coat','Worn muzzle ear paw','Nose eyes mouth','Old ivory canine teeth']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function coatSampler(texture){
 const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height).data,width=canvas.width,height=canvas.height;canvas.width=canvas.height=0;
 const linear=v=>texture.colorSpace===T.SRGBColorSpace?(v<=.04045?v/12.92:((v+.055)/1.055)**2.4):v;
 return(u,v)=>{const x=clamp(Math.floor(u*width),0,width-1),y=clamp(Math.floor(v*height),0,height-1),i=(y*width+x)*4;return[0,1,2].map(k=>Math.max(.005,linear(data[i+k]/255)));};
}

function bald(x,y,z){return(x<-.025&&z>-.27&&z<-.08&&y>.29&&Math.sin(z*53+y*41)>.05)||(x>.025&&z>-.005&&z<.14&&y>.29&&y<.42&&Math.sin(y*64+z*33)>.15);}
// ONE feral finish on the original canine foundation. No rig/clip/root-scale change.
export function createFeralDogLibrary(source){
 const cache=new Map(),ownedG=new Set(),ownedM=new Set();let users=0,disposed=false;
 source.traverse(m=>{
  if(!m.isSkinnedMesh||!ROLES.has(m.material?.name))return;
  const original=m.geometry,role=m.material.name,g=role==='Old ivory canine teeth'?original:original.clone(),material=m.material.clone();
  const p=g.attributes.position,c=g.attributes.color,ix=g.attributes.skinIndex,w=g.attributes.skinWeight;const texel=role==='Weathered brindle coat'?coatSampler(material.map):null,uv=g.attributes.uv;
  if(!p||!c||!ix||!w)throw Error('Original dog attributes missing');
  let removedTufts=0,raisedTufts=0;
  if(role==='Weathered brindle coat'){
   const indices=g.index,uses=new Uint16Array(p.count);for(let i=0;i<indices.count;i++)uses[indices.getX(i)]++;
   const kept=[];
   for(let f=0;f<indices.count;f+=3){const ids=[0,1,2].map(k=>indices.getX(f+k));let isTuft=ids.every(i=>uses[i]===1),body=true;
    for(const i of ids){let s=0;for(let k=0;k<4;k++)if(['pelvis','spine','chest'].includes(m.skeleton.bones[ix.getComponent(i,k)]?.name))s+=w.getComponent(i,k);body&&=s>.95;}
    isTuft&&=body;
    if(isTuft){const x=ids.reduce((s,i)=>s+p.getX(i),0)/3,y=ids.reduce((s,i)=>s+p.getY(i),0)/3,z=ids.reduce((s,i)=>s+p.getZ(i),0)/3;
     if(bald(x,y,z)){removedTufts++;continue;}
     if(z>-.11&&z<.21&&y>.32){const tip=ids.reduce((a,b)=>p.getY(a)>p.getY(b)?a:b);p.setY(tip,p.getY(tip)+.012+.010*(.5+.5*Math.sin(z*37+x*59)));raisedTufts++;}
    }
    kept.push(...ids);
   }
   g.setIndex(new T.BufferAttribute(new original.index.array.constructor(kept),1));
  }
  if(role!=='Old ivory canine teeth')for(let i=0;i<p.count;i++){
   let torso=0,chest=0,head=0,jaw=0,paw=0,earR=0;
   for(let k=0;k<4;k++){const n=m.skeleton.bones[ix.getComponent(i,k)]?.name,v=w.getComponent(i,k);if(['pelvis','spine'].includes(n))torso+=v;if(n==='chest')chest+=v;if(n==='head')head+=v;if(n==='jaw')jaw+=v;if(n?.startsWith('paw_'))paw+=v;if(n==='ear_R')earR+=v;}
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   if(role==='Weathered brindle coat'){
    const lean=clamp((torso-.9)/.1,0,1),shoulder=clamp((chest-.9)/.1,0,1);p.setX(i,x*(1-.27*lean+.10*shoulder));if(earR>.95&&y>.46){p.setX(i,x+.018);p.setZ(i,z-.010);}
    // Pull only the upper lip skin away from the unchanged original canines.
    if(head>.95&&z>.360&&z<.410&&Math.abs(x)>.018&&y<.353&&y>.322)p.setY(i,y+.010);
    if(head>.95&&z>.270&&z<.325&&y>.420){p.setY(i,y-.006);p.setX(i,p.getX(i)*.96);}const patch=bald(x,y,z),dust=.5+.5*Math.sin(z*45+Math.sin(y*35)*1.8+x*39);let target;
    if(paw>.95)target=[.075,.065,.052];
    else if(patch)target=[.30,.225,.18];
    else{const grey=.060+.155*clamp((dust-.40)*2.0,0,1);target=[grey,grey*.97,grey*.91];}
    const scar=(Math.abs(x)>.040&&z>-.17&&z<.15&&Math.abs(y-(.34+z*.20))<.010)||(head>.95&&z>.275&&z<.33&&Math.abs(y-(.399+x*.3))<.006);
    if(scar)target=[.28,.085,.060];
    // Compensate only the brown pigment at existing UV vertices; preserve the
    // original atlas/UVs and its fine strand/stain variation between vertices.
    const rgb=texel(uv.getX(i),uv.getY(i));c.setXYZ(i,...target.map((v,k)=>Math.min(32,v/rgb[k])));
   }else if(role==='Worn muzzle ear paw'){
    if(jaw>.95&&z>.36&&z<.408&&Math.abs(x)>.018&&y>.326)p.setY(i,y-.006);
    if(earR>.95&&y>.46){p.setX(i,x+.018);p.setZ(i,z-.010);}
    if(paw>.95)c.setXYZ(i,.17,.145,.12);else c.setXYZ(i,.40,.31,.28);
    if((jaw>.9&&z>.385)||(earR>.5&&y>.445))c.setXYZ(i,.62,.39,.32);
   }else{
    // Irritated natural eye rim; no emission, cartoon glow or added ornament.
    if(y>.398&&y<.423&&z>.290&&z<.325&&Math.abs(x)>.039)c.setXYZ(i,.105,.060,.035);
   }
  }
  if(role!=='Old ivory canine teeth'){g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();ownedG.add(g);}
  material.roughness=role==='Nose eyes mouth'?.55:role==='Old ivory canine teeth'?.83:1;
  if(role==='Old ivory canine teeth')material.color.multiplyScalar(1.10);
  ownedM.add(material);
  const active=new Set(g.index?g.index.array:Array.from({length:p.count},(_,i)=>i)),changed=[];for(const i of active)if(Math.abs(p.getX(i)-original.attributes.position.getX(i))+Math.abs(p.getY(i)-original.attributes.position.getY(i))+Math.abs(p.getZ(i)-original.attributes.position.getZ(i))>1e-8)changed.push(i);
  cache.set(original,{geometry:g,material,role,changed,removedTufts,raisedTufts});
 });
 if(cache.size!==4){for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();throw Error('Original four-part dog foundation required');}
 return{
  apply(model){if(disposed||model===source)throw Error('Private original dog clone required');const meshes=[];model.traverse(m=>{if(m.isSkinnedMesh&&cache.has(m.geometry))meshes.push(m)});if(meshes.length!==4)throw Error('Unmodified original dog geometry required before feral finish');const records=meshes.map(mesh=>({mesh,original:mesh.geometry,entry:cache.get(mesh.geometry)}));for(const r of records){r.mesh.geometry=r.entry.geometry;r.mesh.material=r.entry.material;}users++;let released=false;return{records,dispose(){if(released)return;released=true;for(const r of records)if(r.mesh.geometry===r.entry.geometry)r.mesh.geometry=r.original;users--;}};},
  stats(){return{users,ownedGeometries:ownedG.size,ownedMaterialTemplates:ownedM.size,geometryBytes:[...ownedG].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength??0),0),changedVertices:[...cache.values()].reduce((n,e)=>n+e.changed.length,0),removedTuftTriangles:[...cache.values()].reduce((n,e)=>n+e.removedTufts,0),raisedTufts:[...cache.values()].reduce((n,e)=>n+e.raisedTufts,0),newTextures:0,newPrimitives:0}},
  dispose(){if(disposed)return;if(users)throw Error('Release feral dog actors before library');disposed=true;for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();}
 };
}
