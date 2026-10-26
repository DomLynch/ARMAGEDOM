import test from 'node:test';
import {indexOfToken} from './helpers/source-slice.js';
import {GAME_DATA} from '../src/engine/game-data.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {relieveGeometryBudget,protectedAreas} from '../src/engine/parked-view-budget.js';
test('a delayed compile from a cancelled run cannot discard replacement-run views',async()=>{
 const source=readFileSync(process.env.TRAVEL_MAIN_SOURCE??new URL('../src/engine/areas.js',import.meta.url),'utf8'),start=indexOfToken(source,'let areaPreparation=null;'),end=indexOfToken(source,process.env.TRAVEL_MAIN_SOURCE?'function prepareEncounter()':'function checkExit()',start);assert(start>=0&&end>start);
 let compileStarted,finishCompile;const started=new Promise(resolve=>compileStarted=resolve),compile=new Promise(resolve=>finishCompile=resolve),stored=new Map([['east','old-views']]),discards=[];
 const actors={bindPreparedArea(){},prepareAreaSteps:function*(){},areaViewStats:()=>({ownedFinisherGeometryBytes:0,finisherGeometryBudgetBytes:1}),discardArea:area=>{discards.push(area);stored.delete(area);},reset:()=>stored.clear()};
 const game={world:{areaId:'westminster'},player:{pos:{x:0,z:0}},finishers:{}},task={areaId:'east',status:'queued',resolve(){},reject(){}};
 const state={game,actors,urgent:'east',cancelled:false,tasks:new Map([['east',task]]),running:false,iterator:null,stats:{steps:0,cpuMilliseconds:0,maxStepMs:0,areas:{}}};
 const context=vm.createContext({TRAVEL:GAME_DATA.areaRuntime.travel,setTimeout:fn=>queueMicrotask(fn),game,actors,testState:state,scene:{children:[]},contextLost:false,loaded:true,world:{isAreaReady:()=>false,areaId:'westminster',manifest:{links:[]},prepareArea:async()=>({areaId:'east',scene:{}})},renderer:{compileAsync:()=>{compileStarted();return compile;}},prepareParkedResidents:()=>({enemies:[],corpses:[]}),relieveGeometryBudget,protectedAreas,initializeAreaResidents(){},performance,requestIdleCallback:callback=>queueMicrotask(()=>callback({timeRemaining:()=>50})),console});
 context.s={traveling:true,get game(){return context.game},get actors(){return context.actors},get scene(){return context.scene},get contextLost(){return context.contextLost},get loaded(){return context.loaded},get world(){return context.world},get renderer(){return context.renderer}};
 vm.runInContext(source.slice(start,end)+'\nareaPreparation=testState;globalThis.pending=(async()=>{await pumpDestinations(testState);return prepareGraphics("east",testState);})();',context);await started;
 vm.runInContext('stopAreaPreparation();actors.reset();game={world:{areaId:"westminster"}};areaPreparation={game,actors,cancelled:false,tasks:new Map()};',context);stored.set('east','replacement-views');finishCompile();await assert.rejects(context.pending,/cancelled/);
 assert.equal(stored.get('east'),'replacement-views');assert.deepEqual(discards,[]);assert.equal(task.status,'failed');
});
