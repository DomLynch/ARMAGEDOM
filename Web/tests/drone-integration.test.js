import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,attack} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
import {droneHoverHeight} from '../src/drone-mechanics.js';
import {encodeRun,restoreRun,applySavedRun} from '../src/pistol-save.js';
const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
function fixture(area='westminster'){
 const world={areaId:area,layout:{characterScale:1.265},spawn:{x:0,z:-6},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
 return createGame(world,{pilot:'donor-knife',encounter,pistol:true,supplies:true,vest:true,drone:true,areaResidents:true,openingGroup:false});
}
const ticks=(g,n,intent={})=>{for(let i=0;i<n;i++)stepGame(g,intent);};
const drone=g=>g.enemies.find(e=>e.rig==='low-hover-drone');
function solo(g){const e=drone(g);g.enemies=[e];g.player.pos={x:e.pos.x,z:e.pos.z-2};return e;}
test('adds one drone per area, preserves ground keys and parked warning duration',async()=>{
 const g=fixture();assert.equal(g.enemies.length,7);const e=solo(g);ticks(g,1);assert.equal(e.droneState.phase,'warning');
 const remaining=e.droneState.warning.releaseAt-g.time;await travelTo(g,{areaId:'east'});assert.equal(g.enemies.length,10);ticks(g,60);await travelTo(g,{areaId:'south'});assert.equal(g.enemies.length,10);await travelTo(g,{areaId:'westminster'});
 assert.equal(drone(g),e);assert.ok(Math.abs(e.droneState.warning.releaseAt-g.time-remaining)<1e-8);
});
test('warning freezes on pause, commits one real bolt after .6s and damages once through projectile authority',()=>{
 const g=fixture(),e=solo(g);ticks(g,1);const origin={...e.pos},clock=g.time;const release=e.droneState.warning.releaseAt;
 ticks(g,100,{paused:true});assert.equal(g.time,clock);assert.equal(g.bolts.length,0);assert.equal(e.droneState.warning.releaseAt,release);
 ticks(g,35);assert.equal(g.bolts.length,0);assert.deepEqual(e.pos,origin);ticks(g,1);assert.equal(g.bolts.length,1);assert.equal(g.bolts[0].amount,6);assert.equal(g.bolts[0].height,droneHoverHeight(g.time));
 ticks(g,14);assert.equal(g.player.hp,144);assert.equal(g.bolts.length,0);assert.equal(e.droneState.phase,'recover');ticks(g,30);assert.equal(g.player.hp,144);
});
test('cover cancels the committed bolt and hurt resets warning without a catchup burst',()=>{
 const g=fixture(),e=solo(g);ticks(g,1);g.world.lineClear=()=>false;ticks(g,36);assert.equal(g.bolts.length,0);assert.equal(e.droneState.phase,'recover');assert.equal(g.player.hp,150);
 g.world.lineClear=()=>true;ticks(g,84);ticks(g,1);assert.equal(e.droneState.phase,'warning');e.staggerUntil=g.time+.2;ticks(g,1);assert.equal(e.droneState.warning,null);assert.equal(g.bolts.length,0);
});
test('pistol death credits once, persists all three area keys, filters cold restore, Retry clears ledger',async()=>{
 for(const area of ['westminster','east','south']){
  const g=fixture(area),e=solo(g);g.player.pos={x:e.pos.x,z:e.pos.z-5};Object.assign(g.pistol,{collected:true,equipped:true,magazine:6});stepGame(g,{actions:['fire'],aim:{x:0,z:1}});
  assert.equal(e.hp,0);assert.equal(g.kills,1);assert.deepEqual(g.droneDeaths,[e.placementKey]);assert.equal(e.response.clip,'drone_death');assert.equal(e.finisher,undefined);assert.deepEqual(g.supplies.issued,[]);ticks(g,2);assert.equal(g.kills,1);
  const fresh=fixture(area),saved=restoreRun(fresh,encodeRun(g));applySavedRun(fresh,saved);assert.equal(drone(fresh),undefined);assert.equal(fresh.kills,1);assert.deepEqual(fixture(area).droneDeaths,[]);
 }
 const g=fixture(),old=JSON.parse(encodeRun(g));delete old.droneDeaths;assert.deepEqual(restoreRun(g,JSON.stringify(old)).droneDeaths,[]);
 for(const keys of [['unknown'],['east-drone-1','east-drone-1'],null]){old.droneDeaths=keys;assert.equal(restoreRun(g,JSON.stringify(old)),null);}
});
test('ordinary Slash selects native Mid once for the drone and never grants a hit without actual contact',()=>{
 const g=fixture(),e=solo(g);g.player.pos={x:e.pos.x,z:e.pos.z-.95};e.recoverUntil=100;
 assert.equal(attack(g,'slash',{x:0,z:1}),true);assert.equal(g.player.swing.moveId,'drone_low');assert.equal(g.player.swing.lowTargetId,e.id);assert.equal(g.player.swing.clip,'DogMidSlash');ticks(g,54);assert.equal(e.hp,20);
});
