import{bodyLineClear}from'../../src/bridge-steering.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function segmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,k=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*k,p.z-a.z-dz*k);}
// QA geometry probe only. Existing .4 capsule/.061 safety and registered gates; no runtime navigation.
export function probeOptionalPocket({geometry:g,registry,areaId,center,avoidRadius,grid=120}){
 const links=registry.links(areaId),gate=p=>{const n=g.point(p);return links.filter(l=>Object.entries(l.condition).every(([k,v])=>k==='xMin'?n.x>v:k==='xMax'?n.x<v:k==='yMin'?n.y>v:n.y<v)).map(l=>l.to);},points=new Map(),gateIds=new Map(),stride=grid+1;
 for(let y=0;y<=grid;y++)for(let x=0;x<=grid;x++){const p=g.ground({x:x/grid,y:y/grid});if(g.clear(p,.4)&&distance(p,center)>avoidRadius){const key=y*stride+x;points.set(key,p);gateIds.set(key,gate(p));}}
 const legal=(a,b)=>segmentDistance(center,a,b)>avoidRadius&&bodyLineClear(g,a,b,.4),entryRows=[{from:'initial',entry:registry.get(areaId).entry},...registry.ids.flatMap(from=>registry.links(from).filter(l=>l.to===areaId).map(l=>({from,entry:l.entry})))];
 return entryRows.map(({from,entry})=>{const start=g.ground(entry);let nearest=null,gap=Infinity;for(const[key,p]of points){const d=distance(p,start);if(d<gap&&!gateIds.get(key).length&&legal(start,p)){gap=d;nearest=key;}}
  const seen=new Set(nearest===null?[]:[nearest]),queue=nearest===null?[]:[nearest],reached=new Set();
  for(let i=0;i<queue.length;i++){const key=queue[i],x=key%stride,y=Math.floor(key/stride);for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const next=ny*stride+nx;if(nx<0||nx>grid||ny<0||ny>grid||seen.has(next)||!points.has(next)||!legal(points.get(key),points.get(next)))continue;seen.add(next);const gates=gateIds.get(next);if(gates.length)gates.forEach(id=>reached.add(id));else queue.push(next);}}
  return{from,entry,startClear:g.clear(start,.4),entryOutsideBoss:distance(start,center)>avoidRadius,connectedCells:seen.size,reachedExits:[...reached].sort(),requiredExits:links.map(l=>l.to).sort(),missingExits:links.filter(l=>!reached.has(l.to)).map(l=>l.to)};
 });
}
