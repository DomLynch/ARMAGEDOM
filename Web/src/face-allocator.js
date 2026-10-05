// Run once using FULL registered keys (including corpses), never survivors only.
// Characters owns the ordered appearance recipes and their actual ingredients.
const text=value=>typeof value==='string'&&value.trim().length>0;
const compare=(a,b)=>a<b?-1:a>b?1:0;
function hash(value){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return h>>>0;}
export function allocateFaceRecipes(areaId,residentKeys,library){
 if(!text(areaId)||!Array.isArray(residentKeys))throw Error('Faces require an area and full stable resident keys');
 const keys=Array.from(residentKeys);
 if(keys.some(key=>!text(key))||new Set(keys).size!==keys.length)throw Error('Face resident keys must be nonempty unique strings');
 if(!library||!text(library.version)||!Array.isArray(library.recipes)||!library.recipes.length||library.recipes.length>50)throw Error('Faces require a versioned 1–50 recipe library');
 const ids=Array.from(library.recipes,recipe=>recipe?.id);
 if(ids.some(id=>!text(id))||new Set(ids).size!==ids.length)throw Error('Face recipes require nonempty unique identifiers');
 // Seed only resident priority, preserving the authored visual-contrast order.
 // Hash collisions resolve by full key, never by recipe-index modulo or retries.
 const score=new Map(keys.map(key=>[key,hash(JSON.stringify([areaId,library.version,key]))]));
 keys.sort((a,b)=>score.get(a)-score.get(b)||compare(a,b));
 const result=new Map();
 // All unused recipes first; above capacity repeat their finite ordered cycle.
 // This cannot promise unique appearances for more residents than recipe IDs.
 keys.forEach((key,index)=>result.set(key,ids[index%ids.length]));
 return result;
}
