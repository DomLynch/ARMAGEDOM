// Original ground insect shell recipes; Combat supplies rhythm and role.
export const ROACH_APPEARANCES=Object.freeze([
 {id:'roach-sewer',name:'Sewer Roach',width:1,shellTint:[1,1,1],patch:0},
 {id:'roach-ash',name:'Ash Roach',width:1,shellTint:[2.4,6.0,24.0],patch:.15},
 {id:'roach-rust-shell',name:'Rust-shell Roach',width:1,shellTint:[1.30,.76,.56],patch:.22},
 {id:'roach-heavy-shell',name:'Heavy-shell Roach',width:1.50,shellTint:[.76,.80,.88],patch:.10},
 {id:'roach-skitter',name:'Skitter Roach',width:.68,shellTint:[1.08,.92,.76],patch:.15},
 {id:'roach-nest-guard',name:'Nest Guard',width:1,shellTint:[.85,.74,.60],patch:.36}
].map(Object.freeze));
const SHELL=new Set(['abdomen','thorax']);
export function createRoachAppearanceLibrary(T){
 const caches=new WeakMap(),ownedG=new Set(),ownedM=new Set();let disposed=false;
 return{
  apply(model,id){
   if(disposed)throw Error('Roach appearance library disposed');
   const r=ROACH_APPEARANCES.find(r=>r.id===id);if(!r)throw Error('Unknown roach appearance '+id);
   const meshes=[];model.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m)});
   if(meshes.length!==1||meshes[0].name!=='ARM_Original_Infected_Ground_Roach')throw Error('Original roach foundation required');
   const m=meshes[0];if(Array.isArray(m.material)||m.material.name!=='Worn rust-brown chitin')throw Error('Original roach material required');
   let cache=caches.get(m.geometry);if(!cache)caches.set(m.geometry,cache=new Map());
   let entry=cache.get(id);
   if(!entry){
    const g=r.id==='roach-sewer'?m.geometry:m.geometry.clone(),mat=m.material.clone();
    if(r.id!=='roach-sewer'){
     const p=g.attributes.position,ix=g.attributes.skinIndex,w=g.attributes.skinWeight,c=new Float32Array(p.count*3),original=m.geometry.attributes.color;
     for(let i=0;i<p.count;i++){
      let shell=0;for(let k=0;k<4;k++)if(SHELL.has(m.skeleton.bones[ix.getComponent(i,k)]?.name))shell+=w.getComponent(i,k);
      const mask=Math.max(0,Math.min(1,(shell-.9)/.1)),x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      p.setX(i,x*(1+(r.width-1)*mask));
      const field=Math.sin(z*63+Math.cos(x*45)*1.6)+Math.sin(y*99+z*24),wear=1-r.patch*Math.max(0,Math.min(1,(field-.25)/1.4))*mask;
      for(let k=0;k<3;k++)c[i*3+k]=(original?original.getComponent(i,k):1)*(1+(r.shellTint[k]-1)*mask)*wear;
     }
     g.setAttribute('color',new T.BufferAttribute(c,3));mat.vertexColors=true;
     if(r.width!==1)g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();ownedG.add(g);
    }
    ownedM.add(mat);entry={geometry:g,material:mat};cache.set(id,entry);
   }
   m.geometry=entry.geometry;m.material=entry.material;return r;
  },
  costs(){return{cachedGeometries:ownedG.size,cachedMaterialTemplates:ownedM.size,extraGeometryBytes:[...ownedG].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength??0),0),extraTextures:0,extraPrimitives:0}},
  dispose(){if(disposed)return;disposed=true;for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();ownedG.clear();ownedM.clear();}
 };
}
