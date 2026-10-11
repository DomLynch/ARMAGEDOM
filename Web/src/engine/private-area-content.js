import {createAreaRegistry,validateAreaEntries} from '../area-registry.js';
import {createGeometry} from '../world-geometry.js';
import {creatureCatalogue} from './creature-catalogue.js';
const fail=()=>{throw Error('Invalid private area content');};
const object=x=>x&&Object.getPrototypeOf(x)===Object.prototype;
function closed(x,fields){if(!object(x)||Object.keys(x).length!==fields.length||fields.some(k=>!Object.hasOwn(x,k)))fail();}
function point(p){closed(p,['x','z']);if(!Number.isFinite(p.x)||!Number.isFinite(p.z))fail();}
function freeze(x){if(x&&typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;}
// Private entry supplies data separately; public startup has no fixture IDs or assets.
export function preparePrivateAreaContent(content){
 closed(content,['areas','manifest','residents','layouts','namespace','textureBudgetBytes']);
 if(typeof content.namespace!=='string'||!/^armagedom:private:[a-z0-9-]+:$/.test(content.namespace)||!Number.isFinite(content.textureBudgetBytes)||content.textureBudgetBytes<16*1024*1024||content.textureBudgetBytes>48*1024*1024)fail();
 const registry=createAreaRegistry({areas:content.areas,manifest:content.manifest,includePrivate:true});
 if(!registry.ids.some(id=>registry.get(id).visibility==='private')||!object(content.residents)||!object(content.layouts))fail();
 const residents=structuredClone(content.residents),keys=new Set(),geometry=new Map();
 for(const id of registry.ids){const ref=registry.get(id).layoutRef;if(!geometry.has(ref)){if(!Object.hasOwn(content.layouts,ref))fail();geometry.set(ref,createGeometry(content.layouts[ref]));}}
 validateAreaEntries(registry,geometry);
 for(const [area,rows]of Object.entries(residents)){
  if(!registry.has(area)||registry.get(area).visibility!=='private'||!Array.isArray(rows))fail();
  const ref=registry.get(area).layoutRef;if(!geometry.has(ref)){if(!Object.hasOwn(content.layouts,ref))fail();geometry.set(ref,createGeometry(content.layouts[ref]));}
  const g=geometry.get(ref);
  for(const row of rows){
   closed(row,['key','foundationRef','recipeRef','pos','patrol']);
   if(typeof row.key!=='string'||!/^fixture-[a-z0-9-]+$/.test(row.key)||keys.has(row.key))fail();keys.add(row.key);
   const foundation=creatureCatalogue.get(row.foundationRef);
   if(creatureCatalogue.forRecipe(row.recipeRef).id!==foundation.id||foundation.behaviour.controllerRef!=='resident-knife')fail();
   point(row.pos);if(!Array.isArray(row.patrol)||row.patrol.length<2)fail();row.patrol.forEach(point);
   const radius=foundation.stats.radius;
   if(!g.clear(row.pos,radius)||row.patrol.some(p=>!g.clear(p,radius)))fail();
   for(let i=0;i<row.patrol.length;i++){const a=row.patrol[i],b=row.patrol[(i+1)%row.patrol.length],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.2));for(let n=0;n<=steps;n++)if(!g.clear({x:a.x+(b.x-a.x)*n/steps,z:a.z+(b.z-a.z)*n/steps},radius))fail();}
  }
 }
 return Object.freeze({registry,manifest:freeze(structuredClone(content.manifest)),residents:freeze(residents),layouts:freeze(structuredClone(content.layouts)),namespace:content.namespace,textureBudgetBytes:content.textureBudgetBytes});
}
export function namespacedRunStorage(storage,namespace){
 if(!storage)return null;
 return Object.freeze({getItem:key=>storage.getItem(namespace+key),setItem:(key,value)=>storage.setItem(namespace+key,value)});
}
