// Owned original rat/dog appearance only. No stats, motion, placement or damage.
export const ANIMAL_APPEARANCES = Object.freeze([
  {id:'rat-sewer',foundation:'original-rat',name:'Sewer Rat',width:1,tint:[1,1,1],patch:0},
  {id:'rat-ash',foundation:'original-rat',name:'Ash Rat',width:1,tint:[1.60,1.65,1.66],patch:0},
  {id:'rat-soot',foundation:'original-rat',name:'Soot Rat',width:1,tint:[.49,.51,.53],patch:0},
  {id:'rat-mangy',foundation:'original-rat',name:'Mangy Rat',width:1,tint:[1.08,.85,.72],patch:.57},
  {id:'rat-heavy',foundation:'original-rat',name:'Heavy Rat',width:1.60,tint:[.88,.79,.70],patch:0},
  {id:'rat-nest-defender',foundation:'original-rat',name:'Nest Defender',width:1,tint:[1.13,.97,.71],patch:.18},
  {id:'dog-street-mongrel',foundation:'original-dog',name:'Street Mongrel',width:1,tint:[1,1,1],patch:0},
  {id:'dog-gaunt-hound',foundation:'original-dog',name:'Gaunt Hound',width:.62,tint:[.88,.84,.76],patch:.22},
  {id:'dog-stocky-yard',foundation:'original-dog',name:'Stocky Yard Dog',width:1.60,tint:[.70,.68,.66],patch:0},
  {id:'dog-ash-coated',foundation:'original-dog',name:'Ash-coated Hound',width:1,tint:[1.60,2.30,3.20],patch:0},
  {id:'dog-mangy-stray',foundation:'original-dog',name:'Mangy Stray',width:1,tint:[1.02,.79,.65],patch:.60},
  {id:'dog-pack-chaser',foundation:'original-dog',name:'Pack Chaser',width:1,tint:[.72,.78,.86],patch:.12}
].map(Object.freeze));
const coatNames={'original-rat':'Ash and soot worn fur','original-dog':'Weathered brindle coat'};
const torso=new Set(['pelvis','spine','chest']);
// Apply to SkeletonUtils.clone(foundation.scene). Cache once per loaded foundation,
// dispose after its last actor is removed. Originals and clips remain immutable.
export function createAnimalAppearanceLibrary(THREE) {
  const geometryCache=new WeakMap(),materialCache=new WeakMap(),ownedG=new Set(),ownedM=new Set();
  let disposed=false;
  function geometry(mesh,recipe){
    if(recipe.width===1 && recipe.patch===0)return mesh.geometry;
    let cache=geometryCache.get(mesh.geometry);if(!cache)geometryCache.set(mesh.geometry,cache=new Map());
    if(cache.has(recipe.id))return cache.get(recipe.id);
    const g=mesh.geometry.clone(),p=g.attributes.position,ix=g.attributes.skinIndex,w=g.attributes.skinWeight;
    const colors=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      let body=0;for(let k=0;k<4;k++)if(torso.has(mesh.skeleton.bones[ix.getComponent(i,k)]?.name))body+=w.getComponent(i,k);
      // Smooth influence taper; head/neck/teeth/legs/paws/tail stay exact.
      const mask=Math.max(0,Math.min(1,(body-.90)/.10));
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      p.setX(i,x*(1+(recipe.width-1)*mask));
      // Broad worn patches modulate the existing atlas; no replacement texture.
      const field=Math.sin(z*43+Math.cos(y*37)*1.7)+Math.sin(x*51-y*19);
      const patch=Math.max(0,Math.min(1,(field-.1)/1.2));
      const value=1-recipe.patch*patch;
      colors[i*3]=value;colors[i*3+1]=value;colors[i*3+2]=value;
    }
    if(recipe.patch>0)g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    if(recipe.width!==1)g.computeVertexNormals();
    g.computeBoundingBox();g.computeBoundingSphere();cache.set(recipe.id,g);ownedG.add(g);return g;
  }
  function material(source,recipe){
    let cache=materialCache.get(source);if(!cache)materialCache.set(source,cache=new Map());
    if(cache.has(recipe.id))return cache.get(recipe.id);
    const m=source.clone();m.color.multiply(new THREE.Color().setRGB(...recipe.tint));
    m.vertexColors=recipe.patch>0;m.needsUpdate=true;cache.set(recipe.id,m);ownedM.add(m);return m;
  }
  return {
    apply(model,id,foundation){
      if(disposed)throw Error('Animal appearance library disposed');
      const recipe=ANIMAL_APPEARANCES.find(r=>r.id===id);
      if(!recipe||recipe.foundation!==foundation)throw Error('Incompatible animal recipe '+id);
      let count=0;
      model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const coat=mats.filter(m=>m.name===coatNames[foundation]);if(!coat.length)return;
        if(mats.length!==1)throw Error('Expected accepted one-material coat primitive');
        mesh.geometry=geometry(mesh,recipe);mesh.material=material(coat[0],recipe);count++;
      });
      if(count!==1)throw Error('Accepted coat primitive missing/ambiguous '+id);
      return recipe;
    },
    costs(){return {cachedGeometries:ownedG.size,cachedMaterials:ownedM.size,extraGeometryBytes:[...ownedG].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength??0),0),newTextures:0,extraDraws:0}},
    dispose(){for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();ownedG.clear();ownedM.clear();disposed=true;}
  };
}
