import fs from 'node:fs';
import {createGeometry} from '/Users/domininclynch/Developer/armagedom/.claude/worktrees/agent-ac38ca45493deaff1/Web/src/world-geometry.js';
const R='/Users/domininclynch/Developer/armagedom/.claude/worktrees/agent-ac38ca45493deaff1/Web/';
const areas=JSON.parse(fs.readFileSync(R+'src/data/areas.json')).areas;
const out={};
for(const a of areas){
  if(a.id==='central-hub')continue;
  let layout;try{layout=JSON.parse(fs.readFileSync(R+'public/world/'+a.id+'/layout.json'))}catch(e){console.log('nolayout',a.id);continue}
  const g=createGeometry(layout);
  const pts=[a.entry];
  const gates=[];
  for(const x of a.exits){const c=x.condition;gates.push({x:c.xMin!==undefined&&c.xMax!==undefined?(c.xMin+c.xMax)/2:(c.xMin??c.xMax??0.5),y:c.yMin!==undefined&&c.yMax!==undefined?(c.yMin+c.yMax)/2:(c.yMin??c.yMax??0.5)});}
  for(const b of areas)for(const x of b.exits)if(x.target===a.id)pts.push(x.entry);
  const avoid=[...pts,...gates].map(p=>g.ground(p));
  const step=0.4;const start=g.ground(a.entry);
  const key=(i,j)=>i+','+j;
  const dist=new Map();const q=[[Math.round(start.x/step),Math.round(start.z/step)]];dist.set(key(...q[0]),0);
  while(q.length){const [i,j]=q.shift();const d=dist.get(key(i,j));for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const ni=i+di,nj=j+dj,k=key(ni,nj);if(dist.has(k))continue;const p={x:ni*step,z:nj*step},o={x:i*step,z:j*step};if(!g.clear(p,0.5))continue;if(!g.lineClear(o,p))continue;dist.set(k,d+Math.hypot(di,dj));q.push([ni,nj]);}}
  let best=null;
  for(const [k,d] of dist){const [i,j]=k.split(',').map(Number);const p={x:i*step,z:j*step};
    if(!g.clear(p,1.0))continue;
    if(avoid.some(v=>Math.hypot(v.x-p.x,v.z-p.z)<6))continue;
    const art=g.point(p);if(art.x<0.06||art.x>0.94||art.y<0.06||art.y>0.94)continue;
    if(!best||d>best.d)best={d,p,art};}
  console.log(a.id,dist.size,best&&{d:best.d.toFixed(1),art:{x:+best.art.x.toFixed(3),y:+best.art.y.toFixed(3)}});
  if(best)out[a.id]={x:+best.art.x.toFixed(3),y:+best.art.y.toFixed(3)};
}
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
