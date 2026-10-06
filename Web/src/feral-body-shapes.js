// Feral-compatible torso shapes. Apply after accepted feral before private materials.
export const FERAL_BODY_SHAPES=Object.freeze([{id:'dog-gaunt-hound',width:.62},{id:'dog-stocky-yard',width:1.60}].map(Object.freeze));
const TORSO=new Set(['pelvis','spine','chest']);
export function createFeralBodyShapeLibrary(){
 const cache=new WeakMap(),owned=new Set();let users=0,disposed=false;
 return{
  apply(model,id){
   if(disposed)throw Error('Feral body shape library disposed');const recipe=FERAL_BODY_SHAPES.find(r=>r.id===id);if(!recipe)throw Error('Unknown feral body shape '+id);
   const meshes=[];model.traverse(m=>{if(m.isSkinnedMesh&&m.material?.name==='Weathered brindle coat')meshes.push(m)});if(meshes.length!==1||!meshes[0].material.vertexColors||!meshes[0].geometry.attributes.color)throw Error('Accepted feral geometry required first');
   const mesh=meshes[0],original=mesh.geometry;let rows=cache.get(original);if(!rows)cache.set(original,rows=new Map());
   if(!rows.has(id)){const g=original.clone(),p=g.attributes.position,ix=g.attributes.skinIndex,w=g.attributes.skinWeight;for(let i=0;i<p.count;i++){let influence=0;for(let k=0;k<4;k++)if(TORSO.has(mesh.skeleton.bones[ix.getComponent(i,k)]?.name))influence+=w.getComponent(i,k);const mask=Math.max(0,Math.min(1,(influence-.9)/.1));p.setX(i,p.getX(i)*(1+(recipe.width-1)*mask))}g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();rows.set(id,g);owned.add(g)}
   const geometry=rows.get(id);mesh.geometry=geometry;users++;let released=false;return{recipe,dispose(){if(released)return;released=true;if(mesh.geometry===geometry)mesh.geometry=original;users--}};
  },
  stats(){return{users,ownedGeometries:owned.size,geometryBytes:[...owned].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength??0),0),newMaterials:0,newTextures:0,newDraws:0}},
  dispose(){if(disposed)return;if(users)throw Error('Release shape handles before library');disposed=true;for(const g of owned)g.dispose();owned.clear()}
 };
}
