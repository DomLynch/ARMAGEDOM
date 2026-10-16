import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeometry,insidePolygon} from '../src/world-geometry.js';
const {SEVER_BLOOD_DATA,groundPoolPlacement}=await import(process.env.SEVER_BLOOD_DATA_URL??new URL('../src/engine/sever-blood-data.js',import.meta.url).href);
const layout=area=>JSON.parse(readFileSync(new URL('../public/world/'+area+'/layout.json',import.meta.url)));
const west=layout('westminster'),westGeometry=createGeometry(west),roadPoint=westGeometry.ground({x:.52,y:.78});
function paintedRectangle(x1,x2,z1,z2){return{name:'Test painted silhouette on real road',points:[{x:x1,z:z1},{x:x2,z:z1},{x:x2,z:z2},{x:x1,z:z2}].map(p=>{const q=westGeometry.point(p);return{x:q.x,y:q.y};})};}
test('approved finite presentation profile is deeply frozen, with no lifecycle or clock state',()=>{
 assert.deepEqual(SEVER_BLOOD_DATA,{jet:{capacity:2,duration:.5,length:1.2,radius:.075},pool:{settleSeconds:.1,capacity:4,lifetime:4,spreadSeconds:.4,radius:.5,opacity:.7},headDropletLifetime:1.25,headDropletGravity:4});
 for(const value of[SEVER_BLOOD_DATA,SEVER_BLOOD_DATA.jet,SEVER_BLOOD_DATA.pool])assert.equal(Object.isFrozen(value),true);
 assert.throws(()=>{SEVER_BLOOD_DATA.pool.capacity=999;},TypeError);
});
test('actual Westminster clear ordinary road permits bounded pool and copies input position',()=>{
 assert.equal(westGeometry.clear(roadPoint,.5),true);const p={...roadPoint},before=JSON.stringify(west);
 const placed=groundPoolPlacement({layout:west,geometry:westGeometry,position:p});assert.deepEqual(placed,{position:p,radius:.5});assert.notEqual(placed.position,p);placed.position.x++;assert.deepEqual(p,roadPoint);assert.equal(JSON.stringify(west),before);
});
test('actual Westminster blocker and road boundary reject full footprint',()=>{
 const polygon=west.blockers[0].points.map(westGeometry.ground),p={x:polygon.reduce((n,p)=>n+p.x,0)/polygon.length,z:polygon.reduce((n,p)=>n+p.z,0)/polygon.length};assert.equal(westGeometry.clear(p,.5),false);assert.equal(groundPoolPlacement({layout:west,geometry:westGeometry,position:p}),null);
 assert.equal(groundPoolPlacement({layout:west,geometry:westGeometry,position:westGeometry.road[0]}),null);
});
test('actual Area7 staircase and facade mask footprints are never accepted',()=>{
 const l=layout('area7'),g=createGeometry(l),masks=l.masks.filter(m=>/stair|facade/i.test(m.name));assert.equal(masks.length,2);
 for(const mask of masks){const polygon=mask.points.map(g.ground),p={x:polygon.reduce((n,p)=>n+p.x,0)/polygon.length,z:polygon.reduce((n,p)=>n+p.z,0)/polygon.length};assert.equal(insidePolygon(p,polygon),true);assert.equal(groundPoolPlacement({layout:l,geometry:g,position:p}),null,mask.name);}
});
test('painted overlap rejects circle edge even when centre and collision footprint are clear',()=>{
 const p=roadPoint,mask=paintedRectangle(p.x+.25,p.x+.65,p.z-.2,p.z+.2),polygon=mask.points.map(westGeometry.ground);assert.equal(insidePolygon(p,polygon),false);assert.equal(westGeometry.clear(p,.5),true);
 assert.equal(groundPoolPlacement({layout:{...west,masks:[...west.masks,mask]},geometry:westGeometry,position:p}),null);
});
test('painted centre, tangent edge and diagonal corner reject; separated footprint permits',()=>{
 const p=roadPoint,cases=[paintedRectangle(p.x-.1,p.x+.1,p.z-.1,p.z+.1),paintedRectangle(p.x+.5,p.x+.9,p.z-.1,p.z+.1),paintedRectangle(p.x+.3,p.x+.6,p.z+.3,p.z+.6)];
 for(const mask of cases)assert.equal(groundPoolPlacement({layout:{...west,masks:[mask]},geometry:westGeometry,position:p}),null);
 const clear=paintedRectangle(p.x+.5001,p.x+.9,p.z-.1,p.z+.1);assert.deepEqual(groundPoolPlacement({layout:{...west,masks:[clear]},geometry:westGeometry,position:p}),{position:p,radius:.5});
});
test('invalid finite/radius/callback inputs fail closed without touching caller data',()=>{
 for(const radius of[0,-1,NaN,Infinity,.500001,'0.5'])assert.equal(groundPoolPlacement({layout:west,geometry:westGeometry,position:roadPoint,radius}),null);
 for(const position of[null,{x:NaN,z:0},{x:0,z:Infinity}])assert.equal(groundPoolPlacement({layout:west,geometry:westGeometry,position}),null);
 assert.equal(groundPoolPlacement(),null);assert.equal(groundPoolPlacement({layout:west,geometry:{},position:roadPoint}),null);
 const throwing={...westGeometry,clear(){throw Error('unavailable geometry');}};assert.equal(groundPoolPlacement({layout:west,geometry:throwing,position:roadPoint}),null);
});
test('unknown, broken and unprojectable mask data fail closed; explicitly empty masks use real road guard',()=>{
 for(const masks of[undefined,{},[{}],[{points:[]}],[{points:[{x:0,y:0},{x:1,y:1},{x:NaN,y:.5}]}]])assert.equal(groundPoolPlacement({layout:{...west,masks},geometry:westGeometry,position:roadPoint}),null);
 const broken={...westGeometry,ground(){throw Error('above horizon');}};assert.equal(groundPoolPlacement({layout:west,geometry:broken,position:roadPoint}),null);
 assert.deepEqual(groundPoolPlacement({layout:{...west,masks:[]},geometry:westGeometry,position:roadPoint}),{position:roadPoint,radius:.5});
});
