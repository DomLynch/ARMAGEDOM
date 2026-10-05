import * as T from 'three';
import {FACE_HEADS,FACE_SKINS,ORIGINAL_FACE_ID,faceRecipeFor} from './face-recipes.js';

const CHEEK=[.2961382707983211,.1589608350608804,.09989872824711388];
const HEAD_NAMES=['Photo','PhotoEyes','PhotoTeeth'];
const SKIN_NAMES=new Set(['Ash-grey affected skin','Photo-matched exposed lower neck']);
function field(p,head){const u=T.MathUtils.clamp((p.y-1.59)/.07,0,1),t=u*u*(3-2*u);return new T.Vector3(p.x*(1+(head.width-1)*t),p.y+(p.y-1.6)*(head.height-1)*t,p.z*(1+(head.width-1)*.35*t));}
function fieldNormal(p,n,h){const u=T.MathUtils.clamp((p.y-1.59)/.07,0,1),t=u*u*(3-2*u),dt=6*u*(1-u)/.07,sx=1+(h.width-1)*t,sz=1+(h.width-1)*.35*t,dy=1+(h.height-1)*(t+(p.y-1.6)*dt),x=n.x/sx,z=n.z/sz;return new T.Vector3(x,(n.y-p.x*(h.width-1)*dt*x-p.z*(h.width-1)*.35*dt*z)/dy,z).normalize();}
function weather(p,id){
  const noise=.5+.5*Math.sin(p.x*139+p.y*173+p.z*97),front=p.z>.075;
  if(id==='stubble'&&front&&p.y<1.65)return [.78+.09*noise,.76+.09*noise,.74+.09*noise];
  if(id==='scar'&&front&&p.x>.02&&p.x<.085&&Math.abs(p.y-(1.682+p.x*.27))<.007)return [.58,.42,.35];
  if(id==='ash'&&front&&p.y>1.64&&noise>.65)return [.68,.73,.75];
  if(id==='grime'&&front&&noise>.53)return [.67+.15*noise,.64+.15*noise,.60+.15*noise];
  if(id==='dust'&&front)return [.91+.07*noise,.90+.07*noise,.86+.08*noise];
  return [1,1,1];
}
function changedGeometry(source,h,weathering=null){
  const g=source.clone(),pos=source.getAttribute('position'),norm=source.getAttribute('normal'),out=new Float32Array(pos.count*3),ns=new Float32Array(pos.count*3),cs=weathering?new Float32Array(pos.count*3):null;
  for(let i=0;i<pos.count;i++){const p=new T.Vector3().fromBufferAttribute(pos,i);field(p,h).toArray(out,i*3);fieldNormal(p,new T.Vector3().fromBufferAttribute(norm,i),h).toArray(ns,i*3);if(cs)cs.set(weather(p,weathering),i*3);}
  g.setAttribute('position',new T.BufferAttribute(out,3));g.setAttribute('normal',new T.BufferAttribute(ns,3));if(cs)g.setAttribute('color',new T.BufferAttribute(cs,3));g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function hairGeometry(source,h,style){
  const pos=source.getAttribute('position'),joints=source.getAttribute('skinIndex'),weights=source.getAttribute('skinWeight'),uv=source.getAttribute('uv'),ids=source.index.array,selected=[];
  function keep(i){const p=new T.Vector3().fromBufferAttribute(pos,i);return p.y>(style==='messy'?1.742:1.750)&&(style!=='crest'||Math.abs(p.x)<.046)&&(style!=='back-crop'||p.z<.045);}
  for(let i=0;i<ids.length;i+=3)if(keep(ids[i])&&keep(ids[i+1])&&keep(ids[i+2]))selected.push(ids[i],ids[i+1],ids[i+2]);
  if(!selected.length)throw Error('Empty authored hair ingredient: '+style);
  // Weld coincident crown seam copies before generating smooth normals/walls.
  // Include joint/weight data in the key so independent skin boundaries stay apart.
  const used=[],keys=new Map(),map=new Map();
  for(const id of new Set(selected)){const p=new T.Vector3().fromBufferAttribute(pos,id),key=[...p.toArray(),...Array.from({length:4},(_,k)=>joints.array[id*4+k]),...Array.from({length:4},(_,k)=>weights.array[id*4+k])].map(v=>Math.round(v*1e6)).join('/');if(!keys.has(key)){keys.set(key,used.length);used.push(id);}map.set(id,keys.get(key));}
  const triangles=selected.map(i=>map.get(i)),ps=[],js=[],ws=[],uvs=[],count=used.length;
  for(const bottom of [false,true])for(const id of used){const p=field(new T.Vector3().fromBufferAttribute(pos,id),h),wave=.5+.5*Math.sin(p.x*32+p.z*39);
    if(!bottom){const raise=style==='crest'?.045*(.35+.65*Math.cos(p.z*12)**2)*Math.max(.1,1-Math.abs(p.x)/.06):style==='back-crop'?.018:style==='messy'?.022+.019*wave:.008+.010*wave;p.y+=raise;p.x*=style==='messy'?1.04:1.02;p.z*=style==='messy'?1.035:1.02;}else{p.y-=.001;p.x*=.999;p.z*=.999;}
    ps.push(...p.toArray());uvs.push(uv.getX(id),uv.getY(id));for(let k=0;k<4;k++){js.push(joints.array[id*4+k]);ws.push(weights.array[id*4+k]);}}
  const edges=new Map();for(let i=0;i<triangles.length;i+=3)for(const[a,b]of[[triangles[i],triangles[i+1]],[triangles[i+1],triangles[i+2]],[triangles[i+2],triangles[i]]]){const key=Math.min(a,b)+'/'+Math.max(a,b),old=edges.get(key);edges.set(key,old?{...old,count:old.count+1}:{a,b,count:1});}
  const indices=[...triangles];for(const{a,b,count:n}of edges.values())if(n===1)indices.push(a,b,b+count,a,b+count,a+count);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(js,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(ws,4));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}

// One kit per loaded repaired Hollow source. Cached geometry belongs to the kit,
// actor materials/bones belong to actors. Dispose actors before disposing the kit.
export function createFaceAppearanceLibrary(source){
  const sourceHeads=HEAD_NAMES.map(name=>{const n=source.getObjectByName(name);if(!n?.isSkinnedMesh)throw Error('Hollow head missing: '+name);return n;});
  const neck=source.getObjectByName(T.PropertyBinding.sanitizeNodeName('Recovered donor lower neck'));if(!neck?.isSkinnedMesh)throw Error('Repaired Hollow lower neck required');
  const sourceMaterials=new Set();source.traverse(n=>{if(n.isMesh)for(const m of(Array.isArray(n.material)?n.material:[n.material]))sourceMaterials.add(m);});
  const cache=new Map();let active=0,disposed=false;
  function cached(key,build){if(!cache.has(key))cache.set(key,build());return cache.get(key);}
  return {
    apply(model,id){
      if(disposed)throw Error('Face library disposed');const recipe=faceRecipeFor(id);if(model===source)throw Error('Face recipes require a private actor clone');
      if(id===ORIGINAL_FACE_ID)return {id,extraMaterials:[],dispose(){}};
      const nodes=HEAD_NAMES.map(name=>model.getObjectByName(name)),ownNeck=model.getObjectByName(neck.name),changes=[],materialChanges=[];
      if(nodes.some(n=>!n?.isSkinnedMesh)||!ownNeck?.isSkinnedMesh)throw Error('Private repaired Hollow head required');
      const affected=[];model.traverse(n=>{if(n.isMesh)for(const m of(Array.isArray(n.material)?n.material:[n.material]))if(m.name==='Photo'||SKIN_NAMES.has(m.name))affected.push(m);});
      if(affected.some(m=>sourceMaterials.has(m)))throw Error('Clone actor materials before applying a face recipe');
      const head=FACE_HEADS.find(h=>h.id===recipe.headPreset),skin=FACE_SKINS.find(s=>s.id===recipe.skinPreset);
      for(let i=0;i<nodes.length;i++){const node=nodes[i],geometry=cached(`${head.id}/${i}/${i===0?recipe.weatheringPreset:'plain'}`,()=>changedGeometry(sourceHeads[i].geometry,head,i===0?recipe.weatheringPreset:null));changes.push({node,geometry:node.geometry});node.geometry=geometry;}
      for(const m of new Set(affected)){materialChanges.push({material:m,color:m.color.clone(),vertexColors:m.vertexColors});if(m.name==='Photo'){m.color.setRGB(...skin.photo,T.LinearSRGBColorSpace);m.vertexColors=true;m.needsUpdate=true;}else{const body=m.name==='Ash-grey affected skin';m.color.setRGB(...CHEEK.map((v,k)=>v*skin.photo[k]/(body ? .84 : 1)),T.LinearSRGBColorSpace);}}
      let hair=null,hairMaterial=null;
      if(recipe.hairPreset!=='buzz'){
        const geometry=cached(`${head.id}/hair/${recipe.hairPreset}`,()=>hairGeometry(sourceHeads[0].geometry,head,recipe.hairPreset));
        hairMaterial=new T.MeshStandardMaterial({name:'Private scavenger hair',color:0x6b6154,map:nodes[0].material.map,roughness:.98,metalness:0,side:T.DoubleSide});
        const photo=nodes[0];hair=new T.SkinnedMesh(geometry,hairMaterial);hair.name='Scavenger hair';hair.position.copy(photo.position);hair.quaternion.copy(photo.quaternion);hair.scale.copy(photo.scale);hair.frustumCulled=false;hair.bindMode=photo.bindMode;hair.bind(photo.skeleton,photo.bindMatrix.clone());photo.parent.add(hair);
      }
      active++;let removed=false;
      return {id,extraMaterials:hairMaterial?[hairMaterial]:[],dispose(){if(removed)return;removed=true;active--;hair?.removeFromParent();hairMaterial?.dispose();for(const c of changes)c.node.geometry=c.geometry;for(const c of materialChanges){c.material.color.copy(c.color);c.material.vertexColors=c.vertexColors;c.material.needsUpdate=true;}}};
    },
    stats(){return {activeActors:active,cachedGeometries:cache.size,geometryBytes:[...cache.values()].reduce((sum,g)=>sum+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0),0)};},
    dispose(){if(disposed)return;if(active)throw Error('Dispose actor appearances before face library');disposed=true;for(const g of cache.values())g.dispose();cache.clear();},
  };
}
