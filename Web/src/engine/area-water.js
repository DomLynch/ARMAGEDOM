import {closed,freeze} from './area-content.js';
import {validateEffectRegion} from './effect-regions.js';
const fail=()=>{throw Error('Invalid area water preset');};
const map=v=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype)fail();};
const key=v=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const bound=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max)fail();};
export function validateAreaWater(input,registry,{privatePilot=false}={}){
 if(input===undefined)return Object.freeze(Object.create(null));closed(input,['regions','profiles','areas']);for(const v of Object.values(input))map(v);
 const regions=Object.create(null),profiles=Object.create(null),result=Object.create(null);
 for(const [id,r]of Object.entries(input.regions)){closed(r,['id','points','holes']);if(!key(id)||r.id!==id)fail();regions[id]=validateEffectRegion({points:r.points,holes:r.holes});}
 for(const [id,p]of Object.entries(input.profiles)){
  closed(p,['id','regionRef','enabled','activationScope','flow','rippleScalePixels','rippleAmplitudePixelsMax','opacityMax','glint','edgeFeatherPixels','seed','budget']);
  if(!key(id)||p.id!==id||!Object.hasOwn(regions,p.regionRef)||typeof p.enabled!=='boolean'||!['private-approved-pilot-only','approved-public-region'].includes(p.activationScope)||p.enabled&&!privatePilot&&p.activationScope!=='approved-public-region')fail();
  closed(p.flow,['coordinateSpace','direction','speedPixelsPerSecond']);closed(p.flow.direction,['x','y']);if(p.flow.coordinateSpace!=='original-image-pixels')fail();for(const v of Object.values(p.flow.direction))bound(v,-1,1);if(Math.abs(Math.hypot(p.flow.direction.x,p.flow.direction.y)-1)>.00001)fail();
  bound(p.flow.speedPixelsPerSecond,0,2);bound(p.rippleScalePixels,4,32);bound(p.rippleAmplitudePixelsMax,0,.5);bound(p.opacityMax,0,.08);bound(p.edgeFeatherPixels,1,8);
  closed(p.glint,['alphaMax','density','tintLinearProposal']);bound(p.glint.alphaMax,0,.04);bound(p.glint.density,.01,.2);if(!Array.isArray(p.glint.tintLinearProposal)||p.glint.tintLinearProposal.length!==3)fail();p.glint.tintLinearProposal.forEach(v=>bound(v,0,1));
  if(!Number.isInteger(p.seed)||p.seed<0||p.seed>4294967295)fail();closed(p.budget,['maxRegions','maxMeshes','maxDrawCalls','maxVertices','maxTriangles','maxMaskPoints','maxNewTextures','originalImageAreaFractionMax']);
  for(const field of ['maxRegions','maxMeshes','maxDrawCalls'])if(p.budget[field]!==1)fail();if(p.budget.maxNewTextures!==0)fail();
  for(const [field,cap]of [['maxVertices',128],['maxTriangles',256],['maxMaskPoints',128]])if(!Number.isInteger(p.budget[field])||p.budget[field]<3||p.budget[field]>cap)fail();bound(p.budget.originalImageAreaFractionMax,.000001,.05);
  const region=regions[p.regionRef],area=r=>Math.abs(r.reduce((n,a,i)=>{const b=r[(i+1)%r.length];return n+a.x*b.y-b.x*a.y;},0))/2;
  const fraction=area(region.points)-region.holes.reduce((n,r)=>n+area(r),0),triangles=region.vertices+2*region.holes.length-2;
  if(region.vertices>p.budget.maxVertices||region.vertices>p.budget.maxMaskPoints||triangles>p.budget.maxTriangles||fraction>p.budget.originalImageAreaFractionMax)fail();
  profiles[id]=freeze({enabled:p.enabled,region,areaFraction:fraction,profile:structuredClone(p)});
 }
 for(const [id,ref]of Object.entries(input.areas)){if(!registry.has(id)||typeof ref!=='string'||!Object.hasOwn(profiles,ref))fail();result[id]=profiles[ref];}
 return Object.freeze(result);
}
