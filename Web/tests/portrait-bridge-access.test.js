import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createGeometry} from '../src/world-geometry.js';
const layout=JSON.parse(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))),point={x:.7977915510224932,y:.6215013179739886};
test('reported portrait mouth root can advance up and up-right across visible paving at full player radius',()=>{
 const g=createGeometry(layout),start=g.ground(point);assert(g.clear(start,.4));
 for(const direction of [{x:0,z:1},{x:.707,z:.707}]){let pos={...start};for(let i=0;i<36;i++){pos=g.move(pos,{x:direction.x*.0375,z:direction.z*.0375},.4);assert(g.clear(pos,.4));}assert(Math.hypot(pos.x-start.x,pos.z-start.z)>1.2);}
 const old=structuredClone(layout);old.road[13]={x:.76,y:.56};old.road[14]={x:.79,y:.60};const before=createGeometry(old);let blocked=before.ground(point);for(let i=0;i<36;i++)blocked=before.move(blocked,{x:.707*.0375,z:.707*.0375},.4);assert(Math.hypot(blocked.x-start.x,blocked.z-start.z)<.1,'Regression witness must reproduce old invisible boundary');
});
test('real lamp and wreck bases still reject full-radius entry; entrance and exit stay legal',()=>{
 const g=createGeometry(layout);for(const blocker of layout.blockers){const p={x:blocker.points.reduce((n,p)=>n+p.x,0)/blocker.points.length,y:blocker.points.reduce((n,p)=>n+p.y,0)/blocker.points.length};assert.equal(g.clear(g.ground(p),.4),false,blocker.name);}
 for(const p of [{x:.52,y:.78},{x:.97,y:.34},{x:.75,y:.64}])assert(g.clear(g.ground(p),.4));
});
