import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {publicAreaRegistry as r} from '../src/area-registry.js';import {validateAreaWater} from '../src/engine/area-water.js';
test('approved eight-area loop has exactly the existing and five new reciprocal links',()=>{
 const edges=[['westminster','east'],['east','east-bridge'],['east-bridge','elephant-and-castle'],['elephant-and-castle','lambeth'],['westminster','south'],['south','area7'],['area7','area8'],['area8','lambeth'],['east','area7'],['east-bridge','area8']],expected=edges.flatMap(([a,b])=>[a+'>'+b,b+'>'+a]).sort();assert.deepEqual(r.ids.flatMap(id=>r.links(id).map(e=>e.from+'>'+e.to)).sort(),expected);
});
test('all arrivals stay outside every exit in the destination so a fresh commit cannot immediately bounce',()=>{
 const inside=(p,c)=>Object.entries(c).every(([k,v])=>k==='xMin'?p.x>v:k==='xMax'?p.x<v:k==='yMin'?p.y>v:p.y<v);for(const id of r.ids)for(const e of r.links(id))for(const next of r.links(e.to))assert(!inside(e.entry,next.condition),e.id+' arrival hits '+next.id);
});
test('reflective street areas do not acquire river water',()=>{const data=JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url))),water=validateAreaWater(data.water,r);assert.equal(water.area7,undefined);assert.equal(water.area8,undefined);});
