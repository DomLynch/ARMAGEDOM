import {insidePolygon,segmentsIntersect} from '../world-geometry.js';
// Validate plain authored shapes before allocating any Three geometry/material.
export function validateEffectRegion(input){
 const fail=()=>{throw Error('Invalid effect region');};
 const object=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
 if(!object(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'points')||!Object.hasOwn(input,'holes')||!Array.isArray(input.holes)||input.holes.length>8)fail();
 const rings=[input.points,...input.holes];let count=0;
 for(const ring of rings){
  if(!Array.isArray(ring)||ring.length<3||ring.length>128)fail();count+=ring.length;if(count>128)fail();
  for(const p of ring)if(!object(p)||Object.keys(p).length!==2||!Object.hasOwn(p,'x')||!Object.hasOwn(p,'y')||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))fail();
 }
 const converted=rings.map(r=>r.map(p=>({x:p.x,z:p.y}))),edges=r=>r.map((p,i)=>[p,r[(i+1)%r.length]]);
 for(const ring of converted){
  const e=edges(ring),area=e.reduce((sum,[a,b])=>sum+a.x*b.z-b.x*a.z,0);
  if(Math.abs(area)<1e-8)fail();
  for(let i=0;i<e.length;i++){
   if(Math.hypot(e[i][0].x-e[i][1].x,e[i][0].z-e[i][1].z)<1e-6)fail();
   // Adjacent edges meet at their shared vertex; reversal/overlap is invalid.
   const a=e[i][0],b=e[i][1],c=e[(i+1)%e.length][1];
   if(Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))<1e-12&&(b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z)<=0)fail();
   for(let j=i+1;j<e.length;j++)if(j!==i+1&&!(i===0&&j===e.length-1)&&segmentsIntersect(...e[i],...e[j]))fail();
  }
 }
 for(let i=1;i<converted.length;i++){
  if(!converted[i].every(p=>insidePolygon(p,converted[0])))fail();
  for(let j=0;j<i;j++){
   if(edges(converted[i]).some(a=>edges(converted[j]).some(b=>segmentsIntersect(...a,...b))))fail();
   if(j>0&&(insidePolygon(converted[i][0],converted[j])||insidePolygon(converted[j][0],converted[i])))fail();
  }
 }
 const freezeRing=r=>Object.freeze(r.map(p=>Object.freeze({...p})));
 return Object.freeze({points:freezeRing(input.points),holes:Object.freeze(input.holes.map(freezeRing)),vertices:count});
}
