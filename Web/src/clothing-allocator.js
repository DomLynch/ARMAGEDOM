// Allocate ONCE from the complete registered area roster, including dead keys.
// Never pass only survivors: sorted roster ranks are the stable outfit identity.
const text=value=>typeof value==='string'&&value.trim().length>0;
const compare=(a,b)=>a<b?-1:a>b?1:0;
function hash(value){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return h>>>0;}
function priority(seed,ids){return [...ids].sort((a,b)=>hash(JSON.stringify([seed,a]))-hash(JSON.stringify([seed,b]))||compare(a,b));}
// Linear sRGB -> Oklab, public-domain matrices from Bjorn Ottosson:
// https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
function perceptual([r,g,b]){
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
 const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
 const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}
const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
function colours(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>50)throw Error('Clothing colour pools require 1–50 entries');
 const ids=new Set();for(const entry of entries){
  if(!entry||!text(entry.id)||ids.has(entry.id)||!text(entry.family)||!Array.isArray(entry.linear)||entry.linear.length!==3||!entry.linear.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid or duplicate clothing colour');
  ids.add(entry.id);
 }
 return ids;
}
export function allocateClothing(areaId,residentKeys,library){
 if(!text(areaId)||!Array.isArray(residentKeys)||residentKeys.some(key=>!text(key))||new Set(residentKeys).size!==residentKeys.length)throw Error('Clothing requires an area and unique stable resident keys');
 if(!library||!(text(library.version)||(Number.isSafeInteger(library.version)&&library.version>=0)))throw Error('Clothing library requires a version');
 const tops=colours(library.tops),trousers=colours(library.trousers),pairs=library.pairings;
 if(!pairs||typeof pairs!=='object'||Array.isArray(pairs)||Object.keys(pairs).some(id=>!tops.has(id)))throw Error('Invalid clothing pairings');
 for(const id of tops){const allowed=Object.hasOwn(pairs,id)?pairs[id]:null;
  if(!Array.isArray(allowed)||!allowed.length||new Set(allowed).size!==allowed.length||allowed.some(pant=>!trousers.has(pant)))throw Error('Missing, duplicate or unapproved trouser pairing');
 }
 if(!residentKeys.length)return new Map();
 const seed=JSON.stringify([areaId,library.version]),ranked=priority(seed,tops),lab=new Map(library.tops.map(c=>[c.id,perceptual(c.linear)]));
 const remaining=new Set(ranked),order=[],nearest=new Map(ranked.map(id=>[id,Infinity]));
 // Priority determines the first colour and exact-distance ties only. Every
 // later top maximizes its minimum perceptual distance to already used tops.
 while(remaining.size){let best=null,gap=-1;for(const id of remaining){if(nearest.get(id)>gap){best=id;gap=nearest.get(id);}}
  order.push(best);remaining.delete(best);for(const id of remaining)nearest.set(id,Math.min(nearest.get(id),distance(lab.get(id),lab.get(best))));
 }
 const allowed=new Map(order.map(id=>[id,priority(JSON.stringify([seed,id]),pairs[id])]));
 const result=new Map();[...residentKeys].sort(compare).forEach((key,index)=>{
  // Beyond the pool capacity, repeat its deterministic order, rotating only
  // approved trousers each cycle. Finite arithmetic; no uniqueness retry loop.
  const topId=order[index%order.length],pants=allowed.get(topId),cycle=Math.floor(index/order.length);
  result.set(key,Object.freeze({topId,trouserId:pants[cycle%pants.length]}));
 });
 return result;
}
