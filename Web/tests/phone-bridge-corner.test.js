import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createGeometry} from '../src/world-geometry.js';
const layout=JSON.parse(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))),radius=.4,phone={x:17.40,z:4.34};
test('actual Safari phone stop advances with its measured forward-right input at full radius',()=>{
 const g=createGeometry(layout),old=structuredClone(layout);old.road[12]={x:.82,y:.50};const before=createGeometry(old),step={x:.029,z:.041};
 for(const dx of [-.005,0,.005])for(const dz of [-.005,0,.005]){
  const start={x:phone.x+dx,z:phone.z+dz};assert.deepEqual(before.move(start,step,radius),start,'109 must reproduce the rounded phone stop');
  let p={...start};for(let i=0;i<120;i++){p=g.move(p,step,radius);assert(g.clear(p,radius));}assert(Math.hypot(p.x-start.x,p.z-start.z)>5.9);
 }
});
test('reported corner has a continuous full-capsule route through the painted bridge to the real gate',()=>{
 const g=createGeometry(layout),path=[phone,g.ground({x:.86,y:.44}),g.ground({x:.97,y:.34})];
 for(let n=0;n<path.length-1;n++){const a=path[n],b=path[n+1];assert(g.lineClear(a,b));const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.04);for(let i=0;i<=steps;i++)assert(g.clear({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps},radius));}
 assert(g.point(path.at(-1)).x>.955);for(const d of [{x:0,z:.2},{x:.2,z:0},{x:-.14,z:.14},{x:-.14,z:-.14}])assert(Math.hypot(...Object.values(d))-.001<=Math.hypot(g.move(phone,d,radius).x-phone.x,g.move(phone,d,radius).z-phone.z));
});
test('pedestal, right lamp shoulder and existing prop blockers remain inaccessible',()=>{
 const g=createGeometry(layout),old=structuredClone(layout);old.road[12]={x:.82,y:.50};const previous=createGeometry(old);
 for(const point of [{x:.89,y:.53},{x:.92,y:.50},{x:.88,y:.58}]){assert.equal(previous.clear(previous.ground(point),radius),false);assert.equal(g.clear(g.ground(point),radius),false);}
 for(const b of layout.blockers){const p={x:b.points.reduce((v,p)=>v+p.x,0)/b.points.length,y:b.points.reduce((v,p)=>v+p.y,0)/b.points.length};assert.equal(g.clear(g.ground(p),radius),false,b.name);}
});
