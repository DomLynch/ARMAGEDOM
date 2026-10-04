import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame} from '../src/combat.js';
const tick=(g,input)=>stepGame(g,input,1/60);
function equipped(){
 const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
 const g=createGame(world,{pilot:'donor-knife',pistol:true});g.enemies=[];tick(g,{actions:['pickup']});return g;
}
for(const move of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}])test(`equipped pistol turns with movement ${move.x},${move.z} without Fire drag`,()=>{
 const g=equipped(),start={...g.player.pos};tick(g,{move});
 assert.deepEqual(g.player.facing,move);assert.ok(Math.hypot(g.player.pos.x-start.x,g.player.pos.z-start.z)>0);assert.equal(g.pistol.magazine,6);assert.equal(g.events.some(e=>e.type==='shot'),false);
});
test('explicit right aim wins over opposite movement, while a later tap uses the new movement facing',()=>{
 const g=equipped();tick(g,{move:{x:1,z:0},manualPistolAim:true,aim:{x:-1,z:0}});assert.deepEqual(g.player.facing,{x:-1,z:0});
 tick(g,{move:{x:0,z:-1}});assert.deepEqual(g.player.facing,{x:0,z:-1});tick(g,{actions:['fire']});const shot=g.events.find(e=>e.type==='shot');assert.deepEqual(shot.direction,{x:0,z:-1});assert.equal(g.pistol.magazine,5);
});
test('melee cardinals still turn after ordinary holster',()=>{
 for(const move of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){const g=equipped();tick(g,{actions:['heavy']});for(let i=0;i<20;i++)tick(g,{move});assert.equal(g.player.weapon,'knife');assert.ok(Math.hypot(g.player.facing.x-move.x,g.player.facing.z-move.z)<1e-8);assert.equal(g.pistol.magazine,6);}
});
