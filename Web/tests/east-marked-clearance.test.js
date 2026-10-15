import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';

const layout=JSON.parse(fs.readFileSync(new URL('../public/world/east/layout.json',import.meta.url)));
const geometry=createGeometry(layout),radius=.4;

test('Owner-marked foreground supply paving admits full-radius movement and return',()=>{
  const points=[{x:.12,y:.68},{x:.14,y:.685},{x:.16,y:.68}].map(p=>geometry.ground(p));
  for(const point of points)assert(geometry.clear(point,radius),'Removed supply footprint must be walkable');
  for(const [from,to] of [[points[0],points[1]],[points[1],points[2]],[points[2],points[1]],[points[1],points[0]]]){
    const result=geometry.move(from,{x:to.x-from.x,z:to.z-from.z},radius);
    assert(Math.hypot(result.x-to.x,result.z-to.z)<1e-6,'Movement must traverse the cleared supply footprint in both directions');
  }
});

test('Clearing supplies preserves the adjacent statue collision and occlusion',()=>{
  assert(layout.blockers.some(b=>b.name==='Near statue pedestal'));
  assert(layout.masks.some(m=>m.name==='Near statue plinth'));
  for(const point of [{x:.20,y:.68},{x:.24,y:.69}])assert(!geometry.clear(geometry.ground(point),radius),'Statue must remain solid');
});

test('Owner-marked checkpoint fork permits full-radius walking below retained crates',()=>{
  const points=[{x:.72,y:.35},{x:.74,y:.37},{x:.78,y:.37}].map(p=>geometry.ground(p));
  for(const point of points)assert(geometry.clear(point,radius),'Cleared front checkpoint lane must be walkable');
  for(const [from,to] of [[points[0],points[1]],[points[1],points[2]],[points[2],points[1]],[points[1],points[0]]]){
    const result=geometry.move(from,{x:to.x-from.x,z:to.z-from.z},radius);
    assert(Math.hypot(result.x-to.x,result.z-to.z)<1e-6,'Checkpoint fork must admit walking and return');
  }
  assert(!geometry.clear(geometry.ground({x:.85,y:.37}),radius),'Right-hand checkpoint supplies must remain solid');
  assert(layout.masks.some(m=>m.name==='Far road supply crates'));
  assert(layout.masks.some(m=>m.name==='Far checkpoint crates'));
});
