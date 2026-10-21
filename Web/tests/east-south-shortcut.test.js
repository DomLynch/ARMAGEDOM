import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {publicAreaRegistry} from '../src/area-registry.js';

const root=new URL('../public/world/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
const geometry=id=>createGeometry(JSON.parse(fs.readFileSync(new URL(`${id}/layout.json`,root))));
const matches=(p,c)=>Object.entries(c).every(([key,value])=>key==='xMin'?p.x>value:key==='xMax'?p.x<value:key==='yMin'?p.y>value:p.y<value);
const affected=manifest.links.filter(l=>(l.from==='east'&&['south','east-bridge'].includes(l.to))||(l.to==='east'&&['south','east-bridge'].includes(l.from)));

test('Direct East/South shortcut extends shared adjacency and retains the Area7 route',()=>{
  assert.equal(manifest.links.length,30);
  for(const [from,to] of [['east','south'],['south','east'],['east','area7'],['area7','east']]){
    const link=manifest.links.find(l=>l.from===from&&l.to===to);
    assert(link,`${from}>${to}`);
    const {id,...registered}=publicAreaRegistry.links(from).find(l=>l.to===to);
    assert.deepEqual(registered,link);
  }
});

for(const link of affected)test(`${link.from}>${link.to}: full-radius gate, safe arrival and no immediate retrigger`,()=>{
  const source=geometry(link.from),target=geometry(link.to),c=link.condition;
  if(['east','south'].includes(link.from))for(const i of [.05,.5,.95])for(const j of [.05,.5,.95]){
    const p={x:c.xMin+(c.xMax-c.xMin)*i,y:c.yMin+(c.yMax-c.yMin)*j};
    assert(source.clear(source.ground(p),.4),`Gate point ${JSON.stringify(p)} must be fully clear`);
    assert(!manifest.links.some(other=>other.from===link.from&&other!==link&&matches(p,other.condition)),'Gates must not overlap');
  }
  assert(target.clear(target.ground(link.entry),.4),'Arrival must be clear at full player radius');
  assert(!manifest.links.some(l=>l.from===link.to&&matches(link.entry,l.condition)),'Arrival must not trigger any exit');
  const start=target.ground(link.entry);
  for(const delta of [{x:.15,z:0},{x:-.15,z:0},{x:0,z:.15},{x:0,z:-.15}]){
    const end=target.move(start,delta,.4);
    assert(Math.hypot(end.x-start.x,end.z-start.z)>.14,'Arrival permits ordinary movement');
  }
});
