import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {createAreaRegistry} from '../src/area-registry.js';
import {LondonWorld} from '../src/world.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base))),registry=createAreaRegistry({manifest});
const world=id=>Object.assign(Object.create(LondonWorld.prototype),{areaId:id,registry,geometry:createGeometry(JSON.parse(fs.readFileSync(new URL(id+'/layout.json',base))))});
for(const [from,to,a,b] of [['east','east-bridge',{x:.8575,y:.28},{x:.8575,y:.25}],['east-bridge','east',{x:.045,y:.862},{x:.027,y:.888}],['elephant-and-castle','east',{x:.958,y:.225},{x:.968,y:.209}],['elephant-and-castle','south',{x:.074,y:.824},{x:.04,y:.832}]])test(`${from}: ordinary registered-road approach reaches ${to} without precision lane`,()=>{
 const w=world(from),g=w.geometry,start=g.ground(a),end=g.ground(b);assert(g.clear(start,.4));assert(g.clear(end,.4));let p=start,hit=false;
 for(let i=0;i<200;i++){const dx=end.x-p.x,dz=end.z-p.z,n=Math.hypot(dx,dz);if(n<.025)break;p=g.move(p,{x:dx/n*.04,z:dz/n*.04},.4);assert(g.clear(p,.4));if(w.travelAt(p)?.areaId===to)hit=true;}
 assert(hit,'Full-radius outer road misses exit');assert(w.exitHint(start).includes(to.replaceAll('-',' ').toUpperCase()));
});
test('all registered arrivals stay outside every return trigger',()=>{
 for(const link of manifest.links){const w=world(link.to),p=w.geometry.ground(link.entry);assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p),null,`${link.from}→${link.to} bounces back`);}
});
test('exit cue stays absent on clear road away from all eight-area entrances',()=>{const w=world('east'),p=w.geometry.ground({x:.5,y:.42});assert(w.geometry.clear(p,.4));assert.equal(w.exitHint(p),'');});
test('the East side entrance shows its destination cue on the existing East road',()=>{const w=world('east'),p=w.geometry.ground({x:.04,y:.62});assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p)?.areaId,'central-hub');assert.equal(w.exitHint(p),'EXIT → CENTRAL SAFEHOUSE');});

test('grid exits on the same road show cues that match their actual destinations',()=>{
 for(const [id,point,target,cue]of [['east',{x:.055,y:.78},'elephant-and-castle','EXIT → ELEPHANT AND CASTLE'],['south',{x:.21,y:.73},'lambeth','EXIT → LAMBETH'],['south',{x:.865,y:.64},'elephant-and-castle','EXIT → ELEPHANT AND CASTLE']]){const w=world(id),p=w.geometry.ground(point);assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p)?.areaId,target);assert.equal(w.exitHint(p),cue);}
});
test('relocated rear exit does not leave the old far-right trigger active',()=>{const w=world('east'),p=w.geometry.ground({x:.98,y:.33});assert(w.geometry.clear(p,.4));assert.equal(w.travelAt(p),null);});
