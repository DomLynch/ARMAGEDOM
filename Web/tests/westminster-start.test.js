import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,spawnWave,stepGame} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
function fresh(){const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6}}};return createGame(world,{pilot:'donor-knife',encounter,pistol:true,areaResidents:true,openingGroup:false});}
test('resident-only Westminster starts with the same six placements and a clear spawn',()=>{
 const g=fresh();assert.equal(g.enemies.length,6);assert.equal(g.areaInitialized,true);assert.ok(g.enemies.every(e=>e.home&&e.hp===40));
 assert.deepEqual(g.enemies.map(e=>({key:e.placementKey,pos:e.pos,patrol:e.patrol})),AREA_MOB_SPAWNS.westminster.map(p=>({key:p.key,pos:p.pos,patrol:p.patrol})));
 assert.ok(g.enemies.every(e=>Math.hypot(e.pos.x-g.player.pos.x,e.pos.z-g.player.pos.z)>=12));assert.equal(spawnWave(g),false);
 for(let i=0;i<180;i++)stepGame(g);assert.equal(g.enemies.length,6);assert.equal(g.player.hp,150);assert.ok(g.enemies.every(e=>!e.alerted&&!e.swing));
});
test('fresh Retry stays six and returns retain the same resident objects and IDs',async()=>{
 const g=fresh(),west=g.enemies.slice(),ids=west.map(e=>e.id);west[0].hp=15;await travelTo(g,{areaId:'east'});assert.equal(g.enemies.length,9);await travelTo(g,{areaId:'south'});assert.equal(g.enemies.length,9);await travelTo(g,{areaId:'westminster'});
 assert.deepEqual(g.enemies.map(e=>e.id),ids);assert.ok(g.enemies.every((e,i)=>e===west[i]));assert.equal(g.enemies[0].hp,15);assert.equal(spawnWave(g),false);
 const retry=fresh();assert.equal(retry.enemies.length,6);assert.ok(retry.enemies.every(e=>e.hp===40));assert.equal(retry.pistol.collected,false);
});
test('cleared resident-only Westminster never recreates an opening trio or positive ending',async()=>{
 const g=fresh();for(const e of [...g.enemies]){g.player.pos={x:e.pos.x,z:e.pos.z-10};g.player.facing={x:0,z:1};e.hp=1;Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,nextFireAt:g.time});stepGame(g,{actions:['fire'],manualPistolAim:true,aim:{x:0,z:1}});}
 assert.equal(g.enemies.length,0);assert.equal(g.corpses.length,6);assert.equal(g.finished,false);assert.equal(g.encounterCleared,true);assert.equal(spawnWave(g),false);await travelTo(g,{areaId:'east'});await travelTo(g,{areaId:'westminster'});assert.equal(g.enemies.length,0);assert.equal(g.corpses.length,6);assert.equal(g.finished,false);
});
