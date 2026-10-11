import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('an unprepared exit keeps current gameplay; retreat and death prevent a delayed crossing',async()=>{
 const source=readFileSync(new URL('../src/engine/areas.js',import.meta.url),'utf8'),start=source.indexOf('function checkExit(){')+'function checkExit(){'.length,end=source.indexOf('return false;',start);assert(start>=0&&end>start);
 let resolve;const preparation=new Promise(done=>resolve=done),calls=[];
 const context=vm.createContext({game:{time:10,player:{hp:150,pos:{x:0,z:0}},finished:false},paused:false,contextLost:false,travelLatch:false,areaPreparation:{tasks:new Map(),urgent:null},atExit:true,ready:false,world:{travelAt:()=>context.atExit?{areaId:'south'}:null,isAreaReady:()=>context.ready},queueDestination:(area,state)=>{calls.push(['prepare',area]);state.tasks.set(area,{status:'running'});return preparation;},crossArea:request=>calls.push(['cross',request.areaId])});
 context.s={get game(){return context.game},get world(){return context.world},get paused(){return context.paused},get contextLost(){return context.contextLost}};
 const frame=()=>vm.runInContext('(function(){'+source.slice(start,end)+'})()',context);
 frame();frame();assert.deepEqual(calls,[['prepare','south']]);assert.equal(context.travelLatch,false);
 context.atExit=false;frame();context.ready=true;resolve();await preparation;await Promise.resolve();assert.deepEqual(calls,[['prepare','south']]);assert.equal(context.areaPreparation.urgent,null);
 context.atExit=true;context.game.player.hp=0;context.game.finished=true;frame();assert.equal(calls.length,1,'ready resources never warp a dead player');
 context.game.player.hp=150;context.game.finished=false;frame();assert.deepEqual(calls,[['prepare','south'],['cross','south']]);assert.equal(context.travelLatch,true);frame();assert.equal(calls.length,2,'ready crossing dispatches once');
});
