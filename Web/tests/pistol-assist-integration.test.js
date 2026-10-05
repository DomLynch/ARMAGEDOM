import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGame,stepGame,enemy} from '../src/combat.js';
import {createEffects} from '../src/effects.js';
const tick=(g,i={})=>stepGame(g,i,1/60);
function fixture(){
 const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,toRender:(p,h=0)=>new THREE.Vector3(p.x,h,-p.z)};
 const g=createGame(world,{pilot:'donor-knife',pistol:true});tick(g,{actions:['pickup']});
 const e=Object.assign(enemy(0,{x:2,z:-2}),{staggerUntil:100});g.enemies=[e];g.wave=1;return {g,e,world};
}
test('accepted near-aligned Fire nudges barrel; read-only cue uses unassisted intent and mutes cooldown',()=>{
 const {g,e,world}=fixture();e.pos={x:.5,z:-2};
 const scene=new THREE.Scene(),fx=createEffects(scene,world);fx.update(g,{visibleIds:[e.id]});
 const marker=scene.children.find(o=>o.name==='Pistol aim marker');assert.equal(marker.visible,true);assert.equal(marker.userData.targetId,e.id);assert.equal(marker.userData.ready,true);assert.deepEqual(marker.position.toArray(),[e.pos.x,1.15,-e.pos.z]);assert.equal(g.pistolTargetId,null);
 tick(g,{actions:['fire'],aim:{x:0,z:1},combatVisibleIds:[e.id]});const shot=g.events.find(e=>e.type==='shot');
 assert.equal(shot.targetId,e.id);assert.equal(e.hp,30);assert.equal(g.pistolTargetId,null);
 assert.deepEqual(g.player.facing,shot.direction);assert.equal(g.pistol.magazine,5);
 fx.update(g);assert.equal(marker.userData.targetId,null);assert.equal(marker.userData.ready,false);assert.deepEqual(marker.position.toArray(),[g.player.pos.x,1.05,-(g.player.pos.z+4)]);
 tick(g);fx.update(g);assert.equal(g.pistolTargetId,null);assert.equal(g.pistol.magazine,5);fx.dispose();assert.equal(scene.children.length,0);
});
test('each actual shot uses deliberate intent; behind target and manual override cannot retain a lock',()=>{
 const {g,e}=fixture();tick(g,{held:['fire'],manualPistolAim:true,aim:{x:2,z:4}});e.pos={x:0,z:-8};tick(g,{held:['fire'],manualPistolAim:true,aim:{x:0,z:1}});
 assert.equal(g.pistolTargetId,null);assert.deepEqual(g.player.facing,{x:0,z:1});assert.equal(e.hp,30);
 e.pos={x:2,z:-2};while(g.time<=g.pistol.nextFireAt)tick(g);
 tick(g,{actions:['fire'],aim:{x:-1,z:0},manualPistolAim:true});const shot=g.events.find(e=>e.type==='shot');
 assert.equal(g.pistolTargetId,null);assert.deepEqual(shot.direction,{x:-1,z:0});assert.equal(shot.targetId,null);assert.equal(e.hp,30);
 tick(g,{held:['fire'],cancel:true});assert.equal(g.pistolTargetId,null);assert.ok(!g.events.some(e=>e.type==='shot'));
});

test('gradual deliberate steering wins without tracking a target during cooldown',()=>{
 const {g,e}=fixture();e.pos={x:0,z:-1};e.hp=e.maxHP=1000;
 const angle=15*Math.PI/180,other=Object.assign(enemy(0,{x:Math.sin(angle)*5,z:-6+Math.cos(angle)*5}),{hp:1000,maxHP:1000,staggerUntil:100});g.enemies.push(other);
 tick(g,{held:['fire'],manualPistolAim:true,aim:{x:0,z:1}});assert.equal(g.pistolTargetId,null);
 for(let degrees=1;degrees<=15;degrees++){const a=degrees*Math.PI/180;tick(g,{held:['fire'],manualPistolAim:true,aim:{x:Math.sin(a),z:Math.cos(a)}});}
 assert.equal(g.pistolTargetId,null);assert.ok(Math.abs(Math.atan2(g.player.facing.x,g.player.facing.z)*180/Math.PI-15)<1e-8);assert.equal(g.pistol.magazine,5);assert.equal(other.hp,1000);
});

test('no-drag fire stays on current direction without wide acquisition',()=>{const {g,e}=fixture();tick(g,{actions:['fire']});const shot=g.events.find(e=>e.type==='shot');assert.equal(shot.targetId,null);assert.equal(g.pistolTargetId,null);assert.deepEqual(shot.direction,{x:0,z:1});assert.equal(e.hp,55);assert.equal(g.pistol.magazine,5);});
test('loaded cooldown rejects input without restarting actual-shot recoil or queuing a shot',()=>{
 const {g,e,world}=fixture();e.pos={x:0,z:-1};const scene=new THREE.Scene(),fx=createEffects(scene,world);
 tick(g,{actions:['fire'],aim:{x:0,z:1},manualPistolAim:true});fx.events(g);const first=g.time,deadline=g.pistol.nextFireAt,hold=fx.snapshot().hold;assert.equal(g.pistol.magazine,5);assert.equal(fx.pistolRecoil(g),1);
 for(let i=0;i<18;i++){fx.advance(1/60);tick(g,{actions:['fire'],manualPistolAim:true,aim:{x:0,z:1}});assert.equal(g.events.some(e=>e.type==='shot'),false);fx.events(g);assert.equal(g.pistol.magazine,5);assert.equal(g.pistol.nextFireAt,deadline);assert.ok(Math.abs(fx.pistolRecoil(g)-Math.exp(-Math.max(0,g.time-first-hold)*12))<1e-8);}
 while(g.time<=deadline){fx.advance(1/60);tick(g);fx.events(g);assert.equal(g.events.some(e=>e.type==='shot'),false);}
 assert.equal(g.pistol.magazine,5);assert.equal(fx.pistolRecoil(g),0);
 tick(g,{actions:['fire'],manualPistolAim:true,aim:{x:0,z:1}});assert.equal(g.events.filter(e=>e.type==='shot').length,1);fx.events(g);assert.equal(g.pistol.magazine,4);assert.equal(fx.pistolRecoil(g),1);fx.dispose();
});
