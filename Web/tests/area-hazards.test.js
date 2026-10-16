import test from'node:test';import assert from'node:assert/strict';import{createAreaHazard,stepAreaHazards}from'../src/engine/area-hazards.js';
const config={warning:.65,radius:1.1,duration:3,interval:.6,damage:3};
const patch=()=>createAreaHazard({ownerId:2,areaId:'lambeth',position:{x:0,z:0},time:10,config});
const context=(time,extra={})=>({time,areaId:'lambeth',owners:[{id:2,hp:100}],player:{hp:150,pos:{x:0,z:0}},lineClear:()=>true,...extra});
test('visible warning has no damage; cadence produces at most one hit per owner without catch-up bursts',()=>{
 const original=patch();let rows=[original];for(const time of[10,10.2,10.6499]){const result=stepAreaHazards(rows,context(time));assert.equal(result.hits.length,0);rows=result.hazards;}
 let result=stepAreaHazards(rows,context(10.65));assert.deepEqual(result.hits,[{ownerId:2,damage:3,position:{x:0,z:0}}]);rows=result.hazards;
 for(const time of[10.65,10.7,11.249]){result=stepAreaHazards(rows,context(time));assert.equal(result.hits.length,0);rows=result.hazards;}
 result=stepAreaHazards(rows,context(12.5));assert.equal(result.hits.length,1);assert.equal(result.hazards[0].nextTickAt,13.1);assert.equal(original.nextTickAt,10.65,'pure input retained');
});
test('same simulation time while paused is inert; duplicate source patches cannot stack',()=>{
 const h=patch();assert.equal(createAreaHazard({ownerId:2,areaId:'lambeth',position:{x:1,z:1},time:11,config},[h]),null);const first=stepAreaHazards([h,h],context(10.65));assert.equal(first.hazards.length,1);assert.equal(first.hits.length,1);assert.equal(stepAreaHazards(first.hazards,context(10.65)).hits.length,0);
});
test('leaving radius or blocked LOS avoids damage; expiry/owner death/player death/travel clears patches',()=>{
 for(const extra of[{player:{hp:150,pos:{x:1.2,z:0}}},{lineClear:()=>false}])assert.equal(stepAreaHazards([patch()],context(11,extra)).hits.length,0);
 for(const extra of[{owners:[{id:2,hp:0}]},{player:{hp:0,pos:{x:0,z:0}}},{areaId:'westminster'}])assert.deepEqual(stepAreaHazards([patch()],context(11,extra)),{hazards:[],hits:[]});
 assert.deepEqual(stepAreaHazards([patch()],context(13.65)),{hazards:[],hits:[]});assert.deepEqual(stepAreaHazards([],context(11)),{hazards:[],hits:[]});
});
