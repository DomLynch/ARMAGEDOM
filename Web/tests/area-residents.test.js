import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,spawnWave,stepGame,receiveHit} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
function fixture(){
 const w={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,
  async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
 return createGame(w,{pilot:'donor-knife',encounter,pistol:true,areaResidents:true});
}
const ticks=(g,count=1,intent={})=>{for(let i=0;i<count;i++)stepGame(g,intent);};
const shoot=(g,e)=>{
 g.player.pos={x:e.pos.x,z:e.pos.z-10};g.player.facing={x:0,z:1};
 Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,nextFireAt:g.time});
 stepGame(g,{actions:['fire'],manualPistolAim:true,aim:{x:0,z:1}});
};
test('opening remains atomic and West extras cannot suppress its three actors',()=>{
 const g=fixture();assert.equal(g.enemies.length,0);assert.equal(g.areaInitialized,false);
 assert.equal(spawnWave(g),true);assert.equal(g.enemies.length,9);
 assert.equal(g.enemies.filter(e=>!e.home).length,3);assert.equal(g.enemies.filter(e=>e.home).length,6);
 assert.equal(spawnWave(g),false);assert.equal(g.enemies.length,9);
 assert.deepEqual(Object.values(AREA_MOB_SPAWNS).map(a=>a.length),[6,9,9]);
 assert.ok(g.enemies.every(e=>e.hp===40&&e.moveSpeed===2.1&&e.recoveryDelay===.55));
});
test('failed opening geometry retries without allocating residents',()=>{
 const g=fixture();g.world.clear=()=>false;
 assert.equal(spawnWave(g),false);assert.equal(g.enemies.length,0);assert.equal(g.areaInitialized,false);
 g.world.clear=()=>true;assert.equal(spawnWave(g),true);assert.equal(g.enemies.length,9);
});
test('all side areas initialize nine once and retain numeric IDs across returns',async()=>{
 const g=fixture();spawnWave(g);const west=g.enemies.map(e=>e.id);
 await travelTo(g,{areaId:'east'});const east=g.enemies.map(e=>e.id);assert.equal(east.length,9);
 await travelTo(g,{areaId:'south'});const south=g.enemies.map(e=>e.id);assert.equal(south.length,9);
 await travelTo(g,{areaId:'east'});assert.deepEqual(g.enemies.map(e=>e.id),east);
 await travelTo(g,{areaId:'westminster'});assert.deepEqual(g.enemies.map(e=>e.id),west);
 assert.equal(new Set([...west,...east,...south]).size,27);
});
test('distant West residents patrol without joining the opening fight',()=>{
 const g=fixture();spawnWave(g);const residents=g.enemies.filter(e=>e.home),before=residents.map(e=>({...e.pos}));
 ticks(g,120);assert.ok(residents.every(e=>!e.alerted&&!e.swing));
 assert.ok(residents.some((e,i)=>Math.hypot(e.pos.x-before[i].x,e.pos.z-before[i].z)>.2));
});
test('resident wake requires nearby LOS or its own positive hit',()=>{
 const g=fixture();spawnWave(g);const e=g.enemies.find(e=>e.home),other=g.enemies.find(e=>e.home&&e!==g.enemies.find(e=>e.home));
 g.player.pos={x:e.pos.x,z:e.pos.z-5};g.world.lineClear=()=>false;stepGame(g);assert.equal(e.alerted,false);
 g.world.lineClear=()=>true;stepGame(g);assert.equal(e.alerted,true);assert.equal(other.alerted,false);
 e.alerted=false;shoot(g,e);assert.equal(e.hp,15);assert.equal(e.alerted,true);assert.equal(other.alerted,false);
});
test('missed/dry pistol input cannot wake a distant resident',()=>{
 const g=fixture();spawnWave(g);const e=g.enemies.find(e=>e.home);
 g.player.pos={x:e.pos.x,z:e.pos.z-10};Object.assign(g.pistol,{collected:true,equipped:true,magazine:0});
 stepGame(g,{actions:['fire'],manualPistolAim:true,aim:{x:0,z:1}});assert.equal(e.hp,40);assert.equal(e.alerted,false);
 g.pistol.magazine=6;g.pistol.nextFireAt=g.time;stepGame(g,{actions:['fire'],manualPistolAim:true,aim:{x:0,z:-1}});assert.equal(e.hp,40);assert.equal(e.alerted,false);
});
test('leash returns by ordinary movement without healing or skipping recovery',()=>{
 const g=fixture();spawnWave(g);const e=g.enemies.find(e=>e.home);e.alerted=true;e.pos={x:e.home.x+4,z:e.home.z};e.hp=15;e.recoverUntil=1;
 const start={...e.pos};g.player.pos={x:e.home.x+20,z:e.home.z};ticks(g,30);assert.deepEqual(e.pos,start);
 ticks(g,120);assert.equal(e.alerted,false);assert.equal(e.hp,15);assert.ok(Math.hypot(e.pos.x-e.home.x,e.pos.z-e.home.z)<4);
});
test('parking preserves each area admission, response, flash, HP, stamina, position and patrol',async()=>{
 const g=fixture();spawnWave(g);const e=g.enemies[3];Object.assign(e,{hp:15,pos:{x:18,z:9},patrolIndex:0,ready:4,recoverUntil:5,staggerUntil:3,guardRecoverAt:6,flashUntil:2,response:{start:1,clip:'Hit'}});e.stamina=37;g.nextEnemyAttackAt=7;
 const remaining={ready:4,recoverUntil:5,staggerUntil:3,guardRecoverAt:6,flashUntil:2};
 await travelTo(g,{areaId:'east'});const east=g.enemies[0];east.hp=31;g.nextEnemyAttackAt=19;
 ticks(g,60);await travelTo(g,{areaId:'south'});g.nextEnemyAttackAt=99;ticks(g,60);
 await travelTo(g,{areaId:'east'});assert.equal(g.enemies[0],east);assert.equal(east.hp,31);assert.ok(Math.abs(g.nextEnemyAttackAt-20)<1e-8);
 await travelTo(g,{areaId:'westminster'});assert.equal(g.enemies[3],e);assert.equal(e.hp,15);assert.equal(e.stamina,37);assert.deepEqual(e.pos,{x:18,z:9});assert.equal(e.patrolIndex,0);
 for(const [field,value] of Object.entries(remaining))assert.ok(Math.abs(e[field]-g.time-value)<1e-8,field);
 assert.ok(Math.abs(e.response.start-g.time-1)<1e-8);assert.ok(Math.abs(g.nextEnemyAttackAt-g.time-7)<1e-8);
});
test('last local kill clears without ending/reward; corpses and consumed ammo survive return',async()=>{
 const g=fixture();spawnWave(g);const last=g.enemies[0];g.enemies=[last];last.hp=1;g.player.hp=41;
 shoot(g,last);assert.equal(g.enemies.length,0);assert.equal(g.corpses[0],last);assert.equal(g.finished,false);assert.equal(g.won,false);assert.equal(g.encounterCleared,true);assert.equal(g.encounterActive,false);assert.equal(g.player.hp,41);assert.equal(g.pistol.magazine,5);
 const pos={...g.player.pos};ticks(g,10,{move:{x:1,z:0}});assert.notDeepEqual(g.player.pos,pos);
 await travelTo(g,{areaId:'east'});assert.equal(g.enemies.length,9);assert.equal(g.encounterCleared,false);
 await travelTo(g,{areaId:'westminster'});assert.equal(g.enemies.length,0);assert.equal(g.corpses[0],last);assert.equal(g.encounterCleared,true);ticks(g,200);assert.equal(g.enemies.length,0);assert.equal(g.player.hp,41);assert.equal(g.pistol.magazine,5);assert.equal(g.pistol.collected,true);
});
test('three opening kills do not clear West while residents remain',()=>{
 const g=fixture();spawnWave(g);for(const e of g.enemies.filter(e=>!e.home)){e.hp=1;shoot(g,e);}
 assert.equal(g.enemies.filter(e=>!e.home).length,0);assert.equal(g.enemies.length,6);assert.equal(g.finished,false);assert.notEqual(g.encounterCleared,true);
});
test('failed area load preserves all state; only Retry creates fresh population',async()=>{
 const g=fixture();spawnWave(g);const old=g.enemies;g.world.loadArea=async()=>{throw Error('503')};await assert.rejects(travelTo(g,{areaId:'east'}),/503/);assert.equal(g.enemies,old);assert.deepEqual(g.areaFights,{});
 const retry=fixture();spawnWave(retry);assert.equal(retry.enemies.length,9);assert.ok(retry.enemies.every(e=>e.hp===40));assert.equal(retry.pistol.collected,false);
});
test('player death still finishes and stops movement',()=>{
 const g=fixture();spawnWave(g);receiveHit(g,{amount:1000,origin:{x:0,z:0},block:false,parry:false});assert.equal(g.player.hp,0);assert.equal(g.finished,true);assert.equal(g.won,false);const pos={...g.player.pos};ticks(g,10,{move:{x:1,z:0}});assert.deepEqual(g.player.pos,pos);
});
test('positive melee contact wakes its struck recovering resident',()=>{
 const g=fixture();spawnWave(g);const e=g.enemies[3];g.enemies=[e];g.player.pos={x:0,z:0};e.pos={x:0,z:1.2};e.home={...e.pos};e.recoverUntil=100;
 ticks(g,50,{actions:['slash'],aim:{x:0,z:1}});assert.ok(e.hp<40);assert.equal(e.alerted,true);
});
test('corpse animation and projectile lifetimes retain remaining duration while parked',async()=>{
 const g=fixture();spawnWave(g);const corpse=g.enemies.pop();corpse.hp=0;corpse.response={clip:'Death',start:.5};corpse.flashUntil=.8;g.corpses.push(corpse);g.bolts=[{id:99,pos:{x:0,z:0},dir:{x:1,z:0},expires:5}];
 await travelTo(g,{areaId:'east'});ticks(g,120);await travelTo(g,{areaId:'westminster'});assert.equal(g.corpses[0],corpse);assert.ok(Math.abs(corpse.response.start-g.time-.5)<1e-8);assert.ok(Math.abs(corpse.flashUntil-g.time-.8)<1e-8);assert.ok(Math.abs(g.bolts[0].expires-g.time-5)<1e-8);
});
