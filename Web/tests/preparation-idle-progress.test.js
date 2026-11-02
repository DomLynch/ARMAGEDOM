import test from 'node:test';
import {indexOfToken} from './helpers/source-slice.js';
import {GAME_DATA} from '../src/engine/game-data.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const source=readFileSync(process.env.TRAVEL_MAIN_SOURCE??new URL('../src/engine/areas.js',import.meta.url),'utf8'),start=indexOfToken(source,'function preparationTurn(state)'),end=indexOfToken(source,'function exitDistance(',start);assert(start>=0&&end>start);
 const game={},state={game,cancelled:false},queue=[];let now=0;
 const context=vm.createContext({TRAVEL:GAME_DATA.areaRuntime.travel,game,contextLost:false,s:{get game(){return game},contextLost:false},state,performance:{now:()=>now},requestIdleCallback:(fn,options)=>queue.push({fn,options})});vm.runInContext(source.slice(start,end)+'\nglobalThis.pending=preparationTurn(state);',context);
 return{state,queue,pending:context.pending,advance(ms){now+=ms;},fire(){queue.shift().fn({didTimeout:false,timeRemaining:()=>2});}};
}
test('repeated short idle callbacks cannot reset the absolute preparation progress deadline',async()=>{
 const run=setup();let resolved=false;run.pending.then(()=>resolved=true);
 for(let i=0;i<2;i++){run.advance(16);run.fire();await Promise.resolve();if(resolved)break;}
 assert.equal(resolved,true,'work must receive a small budget within two frames despite short idle callbacks');assert((await run.pending)>0);assert.equal(run.queue.length,0);
});
test('cancellation wins over a due progress grant',async()=>{const run=setup();run.state.cancelled=true;run.advance(120);run.fire();await assert.rejects(run.pending,/cancelled/);});
