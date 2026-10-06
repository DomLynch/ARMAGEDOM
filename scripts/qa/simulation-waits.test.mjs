import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateSimulationWait,waitSimulation} from './scenarios.mjs';
test('slow visible progress, stalled clock, event success and predicate failure stay bounded',async()=>{
 const start={time:10,tick:600,wall:0},limits={seconds:4,wallMs:90000};
 assert.equal(evaluateSimulationWait(start,{time:11,tick:660,wall:12001,visibility:'visible',menuOpen:false},limits,()=>false),false);
 const event={type:'hit',tick:690};assert.equal(evaluateSimulationWait(start,{time:11.5,tick:690,wall:24000},limits,()=>event),event);
 assert.throws(()=>evaluateSimulationWait(start,{time:10,tick:600,wall:90000,menuOpen:true},limits,()=>false),/wall cap/);
 assert.throws(()=>evaluateSimulationWait(start,{time:14,tick:840,wall:40000},limits,()=>false),/simulation deadline/);
 assert.throws(()=>evaluateSimulationWait(start,{time:11,tick:660,wall:1000},limits,()=>{throw Error('player dead');}),/player dead/);
 const original=Error('browser predicate failure'),page={evaluate:async()=>start,waitForFunction:async()=>{throw original;}};
 await assert.rejects(waitSimulation(page,()=>false),error=>error===original);
});

test('Playwright receives an invoked callback, never a truthy function expression string',async t=>{
 const previous={qa:globalThis.__qa,window:globalThis.window,document:globalThis.document};t.after(()=>{globalThis.__qa=previous.qa;globalThis.window=previous.window;globalThis.document=previous.document;});globalThis.__qa={game:{time:1,tick:60}};globalThis.window={};globalThis.document={visibilityState:'visible',getElementById:()=>({open:false})};
 const page={evaluate:async(fn,arg)=>fn(arg),waitForFunction:async(callback,arg)=>{assert.equal(typeof callback,'function');return callback(arg);}};assert.equal(await waitSimulation(page,()=>false),false);assert.equal(window.__qaWaits.at(-1).trace.length,1);assert.equal(await waitSimulation(page,value=>value,{type:'hit'}).then(x=>x.type),'hit');
});
