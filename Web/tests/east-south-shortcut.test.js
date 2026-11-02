import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {publicAreaRegistry} from '../src/area-registry.js';

const root=new URL('../public/world/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
const geometry=id=>createGeometry(JSON.parse(fs.readFileSync(new URL(`${id}/layout.json`,root))));
const matches=(p,c)=>Object.entries(c).every(([key,value])=>key==='xMin'?p.x>value:key==='xMax'?p.x<value:key==='yMin'?p.y>value:p.y<value);
const neighbours=['central-hub','east-bridge','elephant-and-castle'];
const affected=manifest.links.filter(l=>(l.from==='east'&&neighbours.includes(l.to))||(l.to==='east'&&neighbours.includes(l.from)));

test('East keeps exactly its three grid neighbours in the shared adjacency',()=>{
  assert.equal(manifest.links.length,24);
  assert.deepEqual(publicAreaRegistry.links('east').map(l=>l.to).sort(),neighbours);
  for(const [from,to] of [['east','central-hub'],['central-hub','east'],['east','east-bridge'],['east-bridge','east'],['east','elephant-and-castle'],['elephant-and-castle','east']]){
    const link=manifest.links.find(l=>l.from===from&&l.to===to);
    assert(link,`${from}>${to}`);
    const {id,...registered}=publicAreaRegistry.links(from).find(l=>l.to===to);
    assert.deepEqual(registered,link);
  }
});

for(const link of affected)test(`${link.from}>${link.to}: full-radius gate, safe arrival and no immediate retrigger`,()=>{
  const source=geometry(link.from),target=geometry(link.to),c=link.condition;
  // A zone on the picture's edge has open bounds; sample the part inside the picture and require standing room somewhere in it.
  const clearPoints=[];
  for(const i of [.05,.5,.95])for(const j of [.05,.5,.95]){
    const x0=c.xMin??0,x1=c.xMax??1,y0=c.yMin??0,y1=c.yMax??1,p={x:x0+(x1-x0)*i,y:y0+(y1-y0)*j};
    if(!source.clear(source.ground(p),.4))continue;
    clearPoints.push(p);
    assert(!manifest.links.some(other=>other.from===link.from&&other!==link&&matches(p,other.condition)),'Gates must not overlap');
  }
  if(link.from==='east')assert(clearPoints.length>0,`${link.from}>${link.to}: no fully clear standing room in the gate`);
  assert(target.clear(target.ground(link.entry),.4),'Arrival must be clear at full player radius');
  assert(!manifest.links.some(l=>l.from===link.to&&matches(link.entry,l.condition)),'Arrival must not trigger any exit');
  const start=target.ground(link.entry);
  for(const delta of [{x:.15,z:0},{x:-.15,z:0},{x:0,z:.15},{x:0,z:-.15}]){
    const end=target.move(start,delta,.4);
    assert(Math.hypot(end.x-start.x,end.z-start.z)>.14,'Arrival permits ordinary movement');
  }
});
