import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import{bossExitGate}from'../src/engine/area-bosses.js';
test('cold entry starts the announced travel pause once; leaving resets latch and dead players never travel',()=>{
 const source=readFileSync(new URL('../src/engine/areas.js',import.meta.url),'utf8'),start=source.indexOf('function checkExit()'),end=source.indexOf('return {start:',start),calls=[];
 const game={player:{hp:150,pos:{x:0,z:0}},finished:false},state={tasks:new Map(),urgent:null},world={travelAt:()=>context.atExit?{areaId:'east'}:null,isAreaReady:()=>false};
 const context=vm.createContext({bossExitGate,s:{game,world,paused:false,contextLost:false},travelLatch:false,areaPreparation:state,atExit:true,crossArea:request=>calls.push(request.areaId)});
 const frame=()=>vm.runInContext('(function(){'+source.slice(start,end)+'return checkExit();})()',context);
 assert.equal(frame(),true);frame();assert.deepEqual(calls,['east']);assert.equal(context.travelLatch,true);
 context.atExit=false;frame();assert.equal(context.travelLatch,false);game.player.hp=0;context.atExit=true;frame();assert.equal(calls.length,1);
 game.player.hp=150;context.s.paused=true;frame();assert.equal(calls.length,1);context.s.paused=false;context.s.contextLost=true;frame();assert.equal(calls.length,1);context.s.contextLost=false;assert.equal(frame(),true);assert.deepEqual(calls,['east','east']);
});
