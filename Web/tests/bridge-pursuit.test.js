import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {createBridgeSteering,bodyLineClear} from '../src/bridge-steering.js';
import {createGame,spawnWave,stepGame} from '../src/combat.js';
const east=createGeometry(JSON.parse(fs.readFileSync(new URL('../public/world/east/layout.json',import.meta.url))));
function fixture(){
 const world={geometry:east,areaId:'east',spawn:east.ground({x:.44,y:.36}),layout:{characterScale:1.265},move:east.move,lineClear:east.lineClear};
 const g=createGame(world,{pilot:'donor-knife',encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}},areaResidents:true,openingGroup:false});spawnWave(g);
 const e=g.enemies.find(e=>e.placementKey==='east-roamer-5');g.enemies=[e];e.pos={x:-9.732636282636586,z:7.016003192049032};e.alerted=true;e.facing={x:0,z:1};return{g,e};
}
test('real resident pursuit rounds the statue snag without crossing static boundaries',()=>{
 const {g,e}=fixture();let arrived=false;
 for(let i=0;i<1800;i++){const previous={...e.pos};stepGame(g);assert(east.clear(e.pos,e.radius));assert(Math.hypot(e.pos.x-previous.x,e.pos.z-previous.z)<=e.moveSpeed/60+1e-8);if(Math.hypot(e.pos.x-g.player.pos.x,e.pos.z-g.player.pos.z)<2.4){arrived=true;break;}}
 assert(arrived,'resident remained snagged');assert(e.alerted);
});
test('recovery and leash still precede routed pursuit',()=>{
 const {g,e}=fixture();e.recoverUntil=1;const start={...e.pos};for(let i=0;i<30;i++)stepGame(g);assert.deepEqual(e.pos,start);
 g.player.pos={x:e.home.x+20,z:e.home.z};for(let i=0;i<60;i++)stepGame(g);assert.equal(e.alerted,false);assert.equal(e.returning,true);assert.equal(e.hp,e.maxHP);
});
test('direct body-clear goals retain identity; changed area and leash discard detours',()=>{
 const s=createBridgeSteering(),actor={pos:east.ground({x:.3259258437,y:.478034667}),home:{x:-9.67637,z:6},radius:.4},world={areaId:'east',geometry:east},goal=east.ground({x:.44,y:.36});
 assert.notEqual(s.steer({world,actor,goal,time:0}),goal);
 assert.equal(s.steer({world:{...world,areaId:'south'},actor,goal,time:.1}),goal);
 assert.equal(s.steer({world,actor,goal,time:.2,leash:1}),goal);
 const direct={x:actor.pos.x,z:actor.pos.z-.1};assert(bodyLineClear(east,actor.pos,direct,.4));assert.equal(s.steer({world,actor,goal:direct,time:.3}),direct);
});
test('fourfold roach gets no detour through a corridor narrower than its body',()=>{
 const west=createGeometry(JSON.parse(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))));
 const s=createBridgeSteering(),goal=west.ground({x:.97,y:.34}),actor={pos:west.ground({x:.52,y:.78}),radius:2.12};
 assert.equal(s.steer({world:{areaId:'westminster',geometry:west},actor,goal,time:0}),goal);assert.equal(bodyLineClear(west,actor.pos,goal,actor.radius),false);
});
