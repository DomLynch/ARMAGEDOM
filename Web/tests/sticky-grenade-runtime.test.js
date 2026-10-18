import test from 'node:test';import assert from 'node:assert/strict';
import {startStickyGrenade,stepStickyGrenade,grenadeFlightPoint} from '../src/engine/sticky-grenade-runtime.js';
function setup(){const enemy={id:1,placementKey:'east-roamer-3',pos:{x:3,z:0},facing:{x:0,z:1},hp:40},g={time:10,world:{areaId:'east',registry:{ids:['east','west']},lineClear:()=>true},player:{pos:{x:0,z:0}},enemies:[enemy],events:[]},row={intent:{id:'grenade:10:1',areaId:'east',position:{x:5,z:0},detonateAt:11},origin:{x:0,z:0}},services={grenadeSource:()=>({x:0,y:1,z:0}),grenadeTrace:()=>null};assert(startStickyGrenade(g,row,services));return{g,row,services,enemy};}
test('unchanged arc lands at valid ground, keeps original fuse and cannot acquire a later nearby target',()=>{
 const{g,row,services,enemy}=setup();assert.deepEqual(grenadeFlightPoint(row,10),{x:0,y:1,z:0});g.time=10.35;assert(stepStickyGrenade(g,row,services));assert.equal(row.sticky.attachment,null);assert.deepEqual(row.intent.position,{x:5,z:0});assert(Math.abs(row.surfacePosition.y-.05)<1e-7);
 services.grenadeTrace=()=>{throw Error('Must not query again after landing');};enemy.pos.x=5;g.time=10.8;assert(stepStickyGrenade(g,row,services));assert.deepEqual(row.intent.position,{x:5,z:0});assert.equal(row.intent.detonateAt,11);
});
test('blocked launch rejects before payment; removal detaches while invalid live anchor and foreign area discard',()=>{
 const{g,row,services,enemy}=setup();g.world.lineClear=()=>false;assert.equal(startStickyGrenade(g,{...row},services),false);g.world.lineClear=()=>true;
 services.grenadeTrace=()=>({enemy,anchor:{},position:{x:3,y:.8,z:0}});g.time=10.1;assert(stepStickyGrenade(g,row,services));assert(row.sticky.attachment);
 const invalid={...row};services.grenadeFollow=()=>null;assert.equal(stepStickyGrenade(g,invalid,services),false);
 g.enemies=[];assert(stepStickyGrenade(g,row,services));assert.equal(row.sticky.attachment,null);assert.deepEqual(row.surfacePosition,{x:3,y:.8,z:0});g.world.areaId='west';assert.equal(stepStickyGrenade(g,row,services),false);
});
