import {validateAreaWater} from './area-water.js';
import {validateAreaLighting} from './area-lighting.js';
import {createGeometry} from '../world-geometry.js';
import {validateAreaEntries} from '../area-registry.js';
import {creatureCatalogue} from './creature-catalogue.js';
import {DRONE_KEYS} from '../drone-mechanics.js';
import {ATMOSPHERE_PRESETS} from '../atmosphere-areas.js';
const fail=()=>{throw Error('Invalid registered area content');};
const object=x=>x&&Object.getPrototypeOf(x)===Object.prototype;
const key=x=>typeof x==='string'&&/^[a-z][a-z0-9-]*$/.test(x);
export function closed(x,fields,optional=[]){if(!object(x)||Object.keys(x).some(k=>!fields.includes(k)&&!optional.includes(k))||fields.some(k=>!Object.hasOwn(x,k)))fail();}
function point(p){closed(p,['x','z']);if(!Number.isFinite(p.x)||!Number.isFinite(p.z))fail();}
export function freeze(x){if(x&&typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;}
export function validateResidentPlacements(rows,registry,layouts,{visibility='public'}={}){
 if(!object(rows)||!object(layouts))fail();const residents=structuredClone(rows),keys=new Set(),geometry=new Map();
 for(const id of registry.ids){const ref=registry.get(id).layoutRef;if(!geometry.has(ref)){if(!Object.hasOwn(layouts,ref))fail();geometry.set(ref,createGeometry(layouts[ref]));}}
 validateAreaEntries(registry,geometry);
 for(const [area,placements]of Object.entries(residents)){
  if(!registry.has(area)||registry.get(area).visibility!==visibility||!Array.isArray(placements))fail();const g=geometry.get(registry.get(area).layoutRef);
  for(const row of placements){
   closed(row,['key','foundationRef','recipeRef','pos','patrol']);if(!key(row.key)||keys.has(row.key)||visibility==='private'&&!row.key.startsWith('fixture-'))fail();keys.add(row.key);
   const foundation=creatureCatalogue.get(row.foundationRef);if(foundation.runtimeIdentity==='low-hover-drone'&&DRONE_KEYS[row.key]!==area)throw Error('Unsupported declared drone death placement');if(creatureCatalogue.forRecipe(row.recipeRef).id!==foundation.id)fail();
   point(row.pos);if(!Array.isArray(row.patrol)||row.patrol.length<2)fail();row.patrol.forEach(point);const radius=foundation.stats.radius;
   if(!g.clear(row.pos,radius)||row.patrol.some(p=>!g.clear(p,radius)))fail();
   for(let i=0;i<row.patrol.length;i++){const a=row.patrol[i],b=row.patrol[(i+1)%row.patrol.length],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.2));for(let n=0;n<=steps;n++)if(!g.clear({x:a.x+(b.x-a.x)*n/steps,z:a.z+(b.z-a.z)*n/steps},radius))fail();}
  }
 }
 return freeze(residents);
}
function validateAtmosphere(rows,registry){
 if(!object(rows))fail();const result=structuredClone(rows),ids=new Set();
 for(const[area,data]of Object.entries(result)){
  if(!registry.has(area)||registry.get(area).visibility!=='public')fail();closed(data,['anchors','budget']);closed(data.budget,['quads','drawCalls','textureBytes']);
  if(!Array.isArray(data.anchors)||!Number.isInteger(data.budget.quads)||data.budget.quads<0||data.budget.quads>28||!Number.isInteger(data.budget.drawCalls)||data.budget.drawCalls<0||data.budget.drawCalls>3||data.budget.textureBytes!==0)fail();let quads=0;
  for(const row of data.anchors){
   closed(row,['id','preset','x','y','foot','depth','seed','scale','intensity','preserve'],['width','rise','smoke','opacity','fireWidth','fireHeight','embers','smokeColor']);
   if(!key(row.id)||ids.has(row.id)||!Object.hasOwn(ATMOSPHERE_PRESETS,row.preset)||row.preserve!==true)fail();ids.add(row.id);
   if(![row.x,row.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!Number.isInteger(row.seed)||row.seed<0||row.seed>4294967295||!Number.isFinite(row.scale)||row.scale<=0||row.scale>2||!Number.isFinite(row.intensity)||row.intensity<0||row.intensity>1)fail();
   if(row.foot){closed(row.foot,['x','y']);if(!Object.values(row.foot).every(n=>Number.isFinite(n)&&n>=0&&n<=1)||row.depth!==null)fail();}else if(!Number.isFinite(row.depth)||row.depth<=0)fail();
   const p={...ATMOSPHERE_PRESETS[row.preset],...row};for(const field of ['width','rise','opacity','fireWidth','fireHeight'])if(!Number.isFinite(p[field])||p[field]<0||p[field]>(field==='opacity'?1:.15))fail();
   if(!Number.isInteger(p.smoke)||p.smoke<0||p.smoke>4||!Number.isInteger(p.embers)||p.embers<0||p.embers>2||p.smokeColor&&(!Array.isArray(p.smokeColor)||p.smokeColor.length!==3||!p.smokeColor.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))fail();quads+=p.smoke+(p.fireHeight>0?1:0)+p.embers;
  }
  if(quads>data.budget.quads||quads>0&&data.budget.drawCalls<3)fail();
 }
 return freeze(result);
}
export function validateAreaContent(content,registry,layouts){closed(content,['residents','atmosphere'],['lighting','water']);return Object.freeze({water:validateAreaWater(content.water,registry),lighting:validateAreaLighting(content.lighting,registry),residents:validateResidentPlacements(content.residents,registry,layouts),atmosphere:validateAtmosphere(content.atmosphere,registry),layouts:freeze(structuredClone(layouts))});}
