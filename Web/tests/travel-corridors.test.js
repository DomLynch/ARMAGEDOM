import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
for(const link of manifest.links)test(`${link.from} to ${link.to}: actual circle reaches trigger and destination entry is safe`,()=>{
 const g=createGeometry(JSON.parse(readFileSync(new URL(`${link.from}/layout.json`,base))));
 const entry=manifest.entries[link.from],start=g.ground(entry);
 assert.ok(g.clear(start,.4),'source entry blocked');
 const n=160,cells=new Map();
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){const p=g.ground({x:x/n,y:y/n});if(g.clear(p,.46))cells.set(y*(n+1)+x,p);}
 let first,best=Infinity;
 for(const [key,p] of cells){const d=Math.hypot(p.x-start.x,p.z-start.z);if(d<best&&g.lineClear(start,p)){best=d;first=key;}}
 assert.notEqual(first,undefined);const parents=new Map([[first,null]]),queue=[first];let goal;
 const triggered=p=>Object.entries(link.condition).every(([k,v])=>k==='xMin'?p.x>v:k==='xMax'?p.x<v:k==='yMin'?p.y>v:p.y<v);
 for(let i=0;i<queue.length;i++){
  const key=queue[i],x=key%(n+1),y=Math.floor(key/(n+1));
  if(triggered(g.point(cells.get(key)))){goal=key;break;}
  for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
   if(nx<0||nx>n||ny<0||ny>n)continue;const next=ny*(n+1)+nx;
   if(cells.has(next)&&!parents.has(next)&&g.lineClear(cells.get(key),cells.get(next))){parents.set(next,key);queue.push(next);}
  }
 }
 assert.notEqual(goal,undefined,'exit trigger disconnected');const path=[];
 for(let k=goal;k!==null;k=parents.get(k))path.push(cells.get(k));path.reverse();let p=start;
 for(const target of path){p=g.move(p,{x:target.x-p.x,z:target.z-p.z},.4);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<1e-6,'actual movement stuck');}
 assert.ok(triggered(g.point(p)));
 const destination=createGeometry(JSON.parse(readFileSync(new URL(`${link.to}/layout.json`,base))));
 assert.ok(destination.clear(destination.ground(link.entry),.4),'destination entry blocked');
 assert.ok(!manifest.links.filter(x=>x.from===link.to).some(x=>Object.entries(x.condition).every(([k,v])=>k==='xMin'?link.entry.x>v:k==='xMax'?link.entry.x<v:k==='yMin'?link.entry.y>v:link.entry.y<v)),'entry triggers immediate return');
});
