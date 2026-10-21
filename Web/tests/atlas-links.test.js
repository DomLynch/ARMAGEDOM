import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {atlasConnectionPoints} from '../src/engine/expedition-runtime.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';
const atlas=JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url))).expedition.atlas;
test('all fourteen actual reciprocal atlas pairs avoid every unrelated card, in both directions',()=>{
 const pairs=new Set();let long=0;
 for(const from of registry.ids)for(const link of registry.links(from)){
  pairs.add([from,link.to].sort().join(':'));const a=atlas[from],b=atlas[link.to],points=atlasConnectionPoints(a,b);
  assert.deepEqual(points[0],{x:a.column*100+50,y:a.row*100+50});assert.deepEqual(points.at(-1),{x:b.column*100+50,y:b.row*100+50});
  if(points.length>2)long++;
  for(const id of registry.ids.filter(id=>id!==from&&id!==link.to)){
   const node=atlas[id],cx=node.column*100+50,cy=node.row*100+50;
   // Enclose the actual 3-column card width and mobile min54px height with
   // stroke clearance. Sampling is independent of the routing implementation.
   for(let i=1;i<points.length;i++){const start=points[i-1],end=points[i],steps=Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)*4);for(let n=0;n<=steps;n++){const x=start.x+(end.x-start.x)*n/steps,y=start.y+(end.y-start.y)*n/steps;assert(!(Math.abs(x-cx)<49&&Math.abs(y-cy)<31),`${from}→${link.to} crosses unrelated ${id}`);}}
  }
 }
 assert.equal(pairs.size,14);assert.equal(long,12,'six long reciprocal links use seams');
});
