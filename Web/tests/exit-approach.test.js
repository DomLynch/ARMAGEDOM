import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {createAreaRegistry} from '../src/area-registry.js';
import {LondonWorld} from '../src/world.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base))),registry=createAreaRegistry({manifest});
const world=id=>Object.assign(Object.create(LondonWorld.prototype),{areaId:id,registry,geometry:createGeometry(JSON.parse(fs.readFileSync(new URL(id+'/layout.json',base))))});
for(const [from,to,x,ys] of [['east','east-bridge',.8575,[.28,.25]],['east-bridge','elephant-and-castle',.99,[.245,.215]],['elephant-and-castle','lambeth',.99,[.275,.24]]])test(`${from}: ordinary registered-road approach reaches ${to} without precision lane`,()=>{
 const w=world(from),g=w.geometry,start=g.ground({x,y:ys[0]}),end=g.ground({x,y:ys[1]});assert(g.clear(start,.4));assert(g.clear(end,.4));let p=start,hit=false;
 for(let i=0;i<200;i++){const dx=end.x-p.x,dz=end.z-p.z,n=Math.hypot(dx,dz);if(n<.025)break;p=g.move(p,{x:dx/n*.04,z:dz/n*.04},.4);assert(g.clear(p,.4));if(w.travelAt(p)?.areaId===to)hit=true;}
 assert(hit,'Full-radius outer road misses exit');assert(w.exitHint(start).includes(to.replaceAll('-',' ').toUpperCase()));
});
test('all registered arrivals stay outside every return trigger',()=>{
 for(const link of manifest.links){const w=world(link.to),p=w.geometry.ground(link.entry);assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p),null,`${link.from}→${link.to} bounces back`);}
});
test('exit cue stays absent on clear road away from all eight-area entrances',()=>{const w=world('east'),p=w.geometry.ground({x:.5,y:.42});assert(w.geometry.clear(p,.4));assert.equal(w.exitHint(p),'');});
test('the new southern Area7 entrance shows its destination cue on the existing East road',()=>{const w=world('east'),p=w.geometry.ground({x:.45,y:.545});assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p)?.areaId,'area7');assert.equal(w.exitHint(p),'EXIT → AREA7');});

test('direct East/South shortcut cues match both actual destinations',()=>{
 for(const [id,point,target,cue]of [['east',{x:.755,y:.3785},'south','EXIT → SOUTH'],['south',{x:.635,y:.285},'east','EXIT → EAST']]){const w=world(id),p=w.geometry.ground(point);assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p)?.areaId,target);assert.equal(w.exitHint(p),cue);}
});
test('relocated rear exit does not leave the old far-right trigger active',()=>{const w=world('east'),p=w.geometry.ground({x:.98,y:.33});assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p),null);});
