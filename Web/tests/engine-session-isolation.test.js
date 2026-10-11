import test from 'node:test';
import assert from 'node:assert/strict';
// The isolated Lead checkout has contracts only. Review the exact accepted or
// integration module via this explicit path; Web's adopted test uses its default.
const {createSession}=await import(process.env.ENGINE_SERVER_MODULE??new URL('../src/engine/server.js',import.meta.url));
const makeWorld=()=>({areaId:'westminster',move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true});
const makeSession=world=>createSession({world,pilot:{pilot:'donor-knife'}});
test('two actual renderer-free sessions isolate input, events, pause, Retry and disposal',()=>{
 assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');
 const a=makeSession(makeWorld()),b=makeSession(makeWorld());a.start();b.start();
 const aEvents=[],bEvents=[];a.events(e=>aEvents.push(e));b.events(e=>bEvents.push(e));
 const bStart=b.state();a.input({actions:['slash'],move:{x:1,z:0}});a.step(1/60);
 assert(aEvents.some(e=>e.type==='attack'));assert.equal(bEvents.length,0);assert.deepEqual(b.state(),bStart);
 b.input({move:{x:-1,z:0}});for(let i=0;i<6;i++)b.step(1/60);
 assert(b.state().player.pos.x<bStart.player.pos.x);const beforeRetry=b.state();
 a.retry();assert.equal(a.state().time,0);assert.deepEqual(b.state(),beforeRetry);
 a.pause(true);a.step(.1);b.step(1/60);assert.equal(a.state().time,0);assert(b.state().time>beforeRetry.time);
 const aCount=aEvents.length,bTime=b.state().time;a.dispose();
 assert.throws(()=>a.input({actions:['slash']}),/disposed/);
 for(let i=0;i<12;i++)b.step(1/60);
 assert(Math.abs(b.state().time-bTime-12/60)<1e-9);assert.equal(aEvents.length,aCount);
 b.input({actions:['slash']});b.step(1/60);assert(bEvents.some(e=>e.type==='attack'));
 assert.equal(aEvents.length,aCount);assert(Object.isFrozen(b.state().player));b.dispose();
});
for(const replacement of ['dispose','retry'])test(`${replacement} rejects late activation while the other session keeps stepping`,async()=>{
 let resolve;const world=makeWorld();world.loadArea=()=>new Promise(done=>{resolve=done;});
 const a=makeSession(world),b=makeSession(makeWorld());a.start();b.start();
 const position=a.state().player.pos,pending=a.activateArea({areaId:'fixture-westminster-annex',entryPoint:{x:0,y:0}});
 assert.equal(typeof resolve,'function');a[replacement]();
 b.input({move:{x:1,z:0}});for(let i=0;i<6;i++)b.step(1/60);
 const bBefore=b.state();resolve({x:9,z:9});assert.equal(await pending,false);
 assert.deepEqual(a.state().player.pos,position);assert.equal(a.state().time,0);assert.deepEqual(b.state(),bBefore);
 b.step(1/60);assert(b.state().time>bBefore.time);if(replacement==='retry')a.dispose();b.dispose();
});
