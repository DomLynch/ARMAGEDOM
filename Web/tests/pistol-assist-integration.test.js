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
test('no-drag Fire targets ahead, marker and shot agree, release clears lock',()=>{
 const {g,e,world}=fixture();tick(g,{actions:['fire']});const shot=g.events.find(e=>e.type==='shot');
 assert.equal(shot.targetId,e.id);assert.equal(e.hp,30);assert.equal(g.pistolTargetId,e.id);
 assert.deepEqual(g.player.facing,shot.direction);assert.equal(g.pistol.magazine,5);
 const scene=new THREE.Scene(),fx=createEffects(scene,world);fx.update(g);
 const marker=scene.children.find(o=>o.name==='Pistol aim marker');assert.equal(marker.visible,true);assert.deepEqual(marker.position.toArray(),[e.pos.x,0,-e.pos.z]);assert.equal(marker.children.find(o=>o.isMesh).visible,true);
 tick(g);fx.update(g);assert.equal(g.pistolTargetId,null);assert.equal(marker.children.find(o=>o.isMesh).visible,false);assert.equal(g.pistol.magazine,5);fx.dispose();assert.equal(scene.children.length,0);
});
test('retained target cannot rotate the reference cone behind player; manual override wins',()=>{
 const {g,e}=fixture();tick(g,{held:['fire']});e.pos={x:0,z:-8};tick(g,{held:['fire']});
 assert.equal(g.pistolTargetId,null);assert.deepEqual(g.player.facing,{x:0,z:1});assert.equal(e.hp,30);
 e.pos={x:2,z:-2};for(let i=0;i<18;i++)tick(g);
 tick(g,{actions:['fire'],aim:{x:-1,z:0},manualPistolAim:true});const shot=g.events.find(e=>e.type==='shot');
 assert.equal(g.pistolTargetId,null);assert.deepEqual(shot.direction,{x:-1,z:0});assert.equal(shot.targetId,null);assert.equal(e.hp,30);
 tick(g,{held:['fire'],cancel:true});assert.equal(g.pistolTargetId,null);assert.ok(!g.events.some(e=>e.type==='shot'));
});
