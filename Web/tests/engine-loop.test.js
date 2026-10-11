import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createGame} from '../src/combat.js';import {createBrowserLoop} from '../src/engine/loop.js';
test('browser loop owns accumulation, input, events and reset across pause/travel',()=>{
 const before={innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};globalThis.innerWidth=852;globalThis.innerHeight=393;
 try{
  const camera=new THREE.PerspectiveCamera(),world={areaId:'westminster',camera,cameraRight:{x:1,z:0},cameraForward:{x:0,z:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,toRender:(p,h)=>new THREE.Vector3(p.x,h,p.z),update(){}};
  const game=createGame(world,{pilot:"donor-knife"}),events=[];let reads=0,renders=0;
  const s={world,game,paused:false,traveling:false,loaded:true,contextLost:false,scene:{},camera,rim:{position:new THREE.Vector3()},canvas:{clientHeight:393,clientWidth:852},input:{take(){reads++;return{move:{x:0,y:0},actions:[],held:[]}},clear(){}},effects:{advance(){},events(){},update(){},pistolRecoil(){return 0},render(){renders++}},actors:{events(){},update(){}},audio:{play(){}},hud:{update(){}},areas:{checkExit(){return false}},persistRun(){return true},collectNearbySupplies(){},collectNearbyVest(){},updateSupplies(){},updateVestBag(){},emit(es){events.push(...es)}};
  const loop=createBrowserLoop(s);loop.input({move:{x:1,y:0}});loop.step(1/120);assert.equal(game.time,0);loop.step(1/120);assert(Math.abs(game.time-1/60)<1e-9);assert(game.player.pos.x>0);assert.equal(reads,0);const position=game.player.pos.x;loop.step(1/60);assert.equal(reads,0);assert(game.player.pos.x>position);s.paused=true;loop.reset();loop.step(.1);assert(Math.abs(game.time-2/60)<1e-9);s.paused=false;loop.step(1/60);assert(Math.abs(game.time-3/60)<1e-9);s.traveling=true;const rendered=renders;loop.step(.1);assert(Math.abs(game.time-3/60)<1e-9);assert.equal(renders,rendered);loop.reset();s.traveling=false;loop.step(1/60);assert(Math.abs(game.time-4/60)<1e-9);
 }finally{for(const[key,value]of Object.entries(before))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
