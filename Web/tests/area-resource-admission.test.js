import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(process.env.ENGINE_AREA_SOURCE??new URL('../src/engine/areas.js',import.meta.url),'utf8');
test('evicted graphics invalidate the old ready task and request fresh preparation',()=>{
 const start=source.indexOf('function queueDestination('),end=source.indexOf('async function prepareDestination(',start),game={},old=Promise.resolve(),state={game,cancelled:false,tasks:new Map([['south',{status:'ready',promise:old}]])};let pumped=0;
 const context=vm.createContext({s:{game,world:{isAreaReady:()=>false}},areaPreparation:state,pumpDestinations:()=>pumped++});vm.runInContext(source.slice(start,end)+'globalThis.queue=queueDestination;',context);
 const next=context.queue('south',state);assert.notEqual(next,old);assert.equal(state.tasks.get('south').status,'queued');assert.equal(pumped,1);
});
test('evicted exit starts one entry pause and lets activation reprepare graphics',()=>{
 const start=source.indexOf('function checkExit(){'),end=source.indexOf('return {start:',start),calls=[];const s={game:{player:{hp:150,pos:{}},time:3,finished:false},world:{travelAt:()=>({areaId:'south'}),isAreaReady:()=>false},paused:false,contextLost:false},state={tasks:new Map([['south',{status:'ready'}]])};
 const context=vm.createContext({s,travelLatch:false,areaPreparation:state,queueDestination:(id)=>{calls.push(id);state.tasks.set(id,{status:'running'});return Promise.resolve();},crossArea:request=>calls.push(['entry-pause',request.areaId])});vm.runInContext(source.slice(start,end)+'globalThis.check=checkExit;',context);assert.equal(context.check(),true);assert.deepEqual(calls,[['entry-pause','south']]);assert.equal(context.check(),false);assert.equal(calls.length,1);
});
test('capacity failure cannot discard retained corpse presentation or logical finisher state',async()=>{
 const start=source.indexOf('let areaPreparation=null;'),end=source.indexOf('function checkExit()',start),game={},entity={finisherPartsUntil:50,finisherSupport:['head']},discarded=[];let releases=0;
 const actors={areaViewStats:()=>({parked:[{area:'south',count:1}]}),discardArea:id=>{discarded.push(id);entity.finisherPartsUntil=0;}},task={areaId:'south',status:'queued',resolve(){},reject(){}},state={game,actors,cancelled:false,tasks:new Map([['south',task]]),stats:{steps:0,cpuMilliseconds:0,maxStepMs:0,areas:{}}};
 const s={game,actors,contextLost:false,world:{manifest:{links:[]},leaseArea:()=>()=>releases++,prepareArea:async()=>{throw Error('texture budget exceeded');}}},context=vm.createContext({s,state,performance,requestIdleCallback:fn=>queueMicrotask(()=>fn({timeRemaining:()=>10})),console});vm.runInContext(source.slice(start,end)+'areaPreparation=state;globalThis.pump=pumpDestinations;',context);await context.pump(state);assert.equal(task.status,'failed');assert.deepEqual(discarded,[]);assert.equal(entity.finisherPartsUntil,50);assert.deepEqual(entity.finisherSupport,['head']);assert.equal(releases,1);
});

test('failed entry graphics admission borrows retained actors without clearing logical finisher data',async()=>{
 const start=source.indexOf('async function prepareGraphics('),end=source.indexOf('function checkExit()',start),entity={finisherPartsUntil:50,finisherSupport:['head']},discarded=[];let releases=0;
 const game={},state={game,cancelled:false,tasks:new Map([['south',{status:'prepared'}]])},s={game,traveling:true,actors:{discardArea:id=>{discarded.push(id);entity.finisherPartsUntil=0;}},world:{isAreaReady:()=>false,leaseArea:()=>()=>releases++,prepareArea:async()=>{throw Error('texture budget exceeded');}}},context=vm.createContext({s,areaPreparation:state});
 vm.runInContext(source.slice(start,end)+'globalThis.graphics=prepareGraphics;',context);await assert.rejects(context.graphics('south',state),/texture budget exceeded/);assert.equal(state.tasks.get('south').status,'failed');assert.deepEqual(discarded,[]);assert.equal(entity.finisherPartsUntil,50);assert.deepEqual(entity.finisherSupport,['head']);assert.equal(releases,1);
});
