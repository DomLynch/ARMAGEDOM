import {areaDefinitions,areaAssets} from './area-definitions.js';
export const areaDisplayName=id=>id==='central-hub'?'Central Safehouse':id.replace(/^area(\d+)$/,'Area $1').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
const fail=message=>{throw new TypeError(`Area registry: ${message}`);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function dataOnly(value){
 if(['function','undefined','symbol','bigint'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))fail('definitions must be data only');
 if(value&&typeof value==='object'){
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('definitions must be plain data');
  for(const [key,child]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))fail('unsafe field');dataOnly(child);}
 }
}
function closed(value,fields,required=fields){if(!object(value)||Object.keys(value).some(k=>!fields.includes(k))||required.some(k=>!Object.hasOwn(value,k)))fail('unknown or missing field');}
function point(value){closed(value,['x','y']);if(!Object.values(value).every(n=>Number.isFinite(n)&&n>=0&&n<=1))fail('invalid normalized entry');}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9.-]*$/.test(value);
const canonical=value=>value&&typeof value==='object'?JSON.stringify(Object.fromEntries(Object.entries(value).sort())):JSON.stringify(value);
function equalLink(a,b){return a.from===b.from&&a.to===b.to&&canonical(a.condition)===canonical(b.condition)&&canonical(a.entry)===canonical(b.entry)&&(a.requiresDefeat??null)===(b.requiresDefeat??null)&&(a.requiresVisited??false)===(b.requiresVisited??false);}
export function createAreaRegistry({areas=areaDefinitions,assets=areaAssets,manifest=null,includePrivate=false}={}){
 dataOnly({areas,assets});if(!Array.isArray(areas)||!areas.length||!object(assets))fail('empty definitions');
 const rows=structuredClone(areas),references=structuredClone(assets),byId=new Map(),exitIds=new Set();
 for(const row of rows){
  closed(row,['id','visibility','layoutRef','backdropRef','audioRef','entry','exits']);
  if(!id(row.id)||byId.has(row.id))fail('invalid or duplicate area ID');
  if(!['public','private'].includes(row.visibility)||row.visibility==='private'&&!includePrivate)fail('private area requires explicit fixture opt-in');
  point(row.entry);if(!Array.isArray(row.exits))fail('invalid exits');
  for(const [field,kind]of [['layoutRef','layout'],['backdropRef','backdrop'],['audioRef','wav']]){
   const ref=references[row[field]];
   if(!id(row[field])||!Object.hasOwn(references,row[field])||ref?.kind!==kind)fail('unknown or wrong asset reference');
   if(typeof ref.path!=='string'||!ref.path.startsWith(kind==='wav'?'audio/':'world/')||ref.path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\?#:]/.test(ref.path))fail('invalid asset path');
  }
  byId.set(row.id,row);
 }
 const links=[];
 for(const row of rows)for(const exit of row.exits){
  closed(exit,['id','target','condition','entry','requiresDefeat','requiresVisited'],['id','target','condition','entry']);
  if(exit.requiresVisited!==undefined&&exit.requiresVisited!==true)fail('invalid exit visit requirement');
  if(exit.requiresDefeat!==undefined&&!id(exit.requiresDefeat))fail('invalid exit defeat requirement');
  if(!id(exit.id)||exitIds.has(exit.id))fail('invalid or duplicate exit ID');exitIds.add(exit.id);
  if(!byId.has(exit.target))fail('unknown exit target');point(exit.entry);
  closed(exit.condition,['xMin','xMax','yMin','yMax'],[]);
  if(!Object.keys(exit.condition).length||!Object.values(exit.condition).every(n=>Number.isFinite(n)&&n>=0&&n<=1))fail('invalid exit condition');
  for(const axis of ['x','y'])if(exit.condition[axis+'Min']!==undefined&&exit.condition[axis+'Max']!==undefined&&exit.condition[axis+'Min']>=exit.condition[axis+'Max'])fail('invalid exit bounds');
  links.push({id:exit.id,from:row.id,to:exit.target,condition:exit.condition,entry:exit.entry,...(exit.requiresDefeat===undefined?{}:{requiresDefeat:exit.requiresDefeat}),...(exit.requiresVisited===undefined?{}:{requiresVisited:true})});
 }
 for(const link of links)if(!links.some(back=>back.from===link.to&&back.to===link.from))fail('missing return exit');
 const initialArea=manifest?.initialArea??rows[0].id;if(!byId.has(initialArea))fail('unknown initial area');
 function reachable(from){if(!byId.has(from))fail('unknown area');const found=new Set([from]),queue=[from];for(let i=0;i<queue.length;i++)for(const link of links.filter(x=>x.from===queue[i]))if(!found.has(link.to)){found.add(link.to);queue.push(link.to);}return Object.freeze(queue);}
 if(reachable(initialArea).length!==rows.length)fail('disconnected area');
 if(manifest){
  if(!Array.isArray(manifest.links)||manifest.links.length!==links.length||manifest.links.some(link=>!links.some(row=>equalLink(row,link)))||links.some(row=>!manifest.links.some(link=>equalLink(row,link))))fail('manifest adjacency mismatch');
  if(!object(manifest.entries)||rows.some(row=>canonical(manifest.entries[row.id])!==canonical(row.entry)))fail('manifest entries mismatch');
  const paths=new Set((manifest.files??[]).map(f=>'world/'+f.path));
  for(const row of rows)for(const field of ['layoutRef','backdropRef'])if(!paths.has(references[row[field]].path))fail('manifest asset reference mismatch');
 }
 function nextExit(from,to){
  if(!byId.has(from)||!byId.has(to))fail('unknown route endpoint');if(from===to)return null;
  const seen=new Set([from]),queue=[{area:from,first:null}];
  for(let i=0;i<queue.length;i++)for(const link of links.filter(row=>row.from===queue[i].area)){
   if(seen.has(link.to))continue;const first=queue[i].first??link;if(link.to===to)return first;seen.add(link.to);queue.push({area:link.to,first});
  }
  return null;
 }
 for(const row of rows)freeze(row);freeze(links);freeze(references);
 return Object.freeze({initialArea,ids:Object.freeze(rows.map(row=>row.id)),has:areaId=>byId.has(areaId),get:areaId=>byId.get(areaId),links:areaId=>Object.freeze(links.filter(link=>link.from===areaId)),reachable,nextExit,asset:ref=>references[ref]});
}
export const publicAreaRegistry=createAreaRegistry();
// Authoring/entry adapters supply geometry; content contains no executable callbacks.
export function validateAreaEntries(registry,geometriesByRef,radius=.4){
 if(!Number.isFinite(radius)||radius<=0)fail('invalid clearance radius');
 const geometry=areaId=>{const ref=registry.get(areaId).layoutRef,g=geometriesByRef.get(ref);if(!g||typeof g.ground!=='function'||typeof g.clear!=='function')fail('missing layout geometry');return g;},checks=[];
 for(const areaId of registry.ids){const g=geometry(areaId),entry=g.ground(registry.get(areaId).entry);if(!g.clear(entry,radius))fail('blocked area entry '+areaId);
  for(const exit of registry.links(areaId)){const target=geometry(exit.to),point=target.ground(exit.entry);if(!target.clear(point,radius))fail('blocked exit entry '+exit.id);checks.push({exit:exit.id,target:exit.to,point,clearanceRadius:radius});}
 }
 return freeze(checks);
}
