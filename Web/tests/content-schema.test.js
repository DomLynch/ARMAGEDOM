import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {closed,freeze} from '../src/engine/content-schema.js';
import {closed as publicClosed,freeze as publicFreeze} from '../src/engine/area-content.js';

test('shared schema preserves closed fields, plain objects and compatibility exports',()=>{
 assert.equal(publicClosed,closed);assert.equal(publicFreeze,freeze);
 assert.doesNotThrow(()=>closed({id:1,optional:2},['id'],['optional']));
 for(const invalid of [null,[],Object.create(null),{}, {id:1,extra:2}])assert.throws(()=>closed(invalid,['id']),/Invalid registered area content/);
 const data={rows:[{id:1}]};assert.equal(freeze(data),data);
 assert(Object.isFrozen(data)&&Object.isFrozen(data.rows)&&Object.isFrozen(data.rows[0]));
 assert.throws(()=>{data.rows[0].id=2;},TypeError);
});

test('validator dependency graph has no cycle through shared schema helpers',()=>{
 const visiting=new Set(),visited=new Set();
 function visit(url){
  assert(!visiting.has(url.href),`Circular validator dependency: ${url.pathname}`);
  if(visited.has(url.href))return;
  visiting.add(url.href);
  const source=readFileSync(url,'utf8');
  for(const match of source.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/g))visit(new URL(match[1],url));
  visiting.delete(url.href);visited.add(url.href);
 }
 visit(new URL('../src/engine/area-content.js',import.meta.url));
});
