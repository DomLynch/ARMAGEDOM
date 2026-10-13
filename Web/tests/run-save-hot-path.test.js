import test from 'node:test';
import assert from 'node:assert/strict';
import * as codec from '../src/engine/run-state.js';
import * as guard from '../src/engine/run-save-state.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createSuppliesState,issueSupply} from '../src/supplies.js';
import {createVestState} from '../src/vest.js';
function game(){return {player:{hp:80,maxHP:150,pos:{x:0,z:0}},pistol:{collected:true,equipped:true,magazine:4,reserve:2,reloadingUntil:0,nextFireAt:0},supplies:createSuppliesState(),vest:createVestState(),droneDeaths:[],animalCycle:'A'};}
function setup(g=game(),extra={}){
 const counts={encode:0,validate:0,write:0},records=new Map();let quota=false,key=codec.RUN_SAVE_KEY;
 const counted={...codec,...guard,...extra,get RUN_SAVE_KEY(){return key;},encodeRun(g){counts.encode++;return codec.encodeRun(g);},restoreRun(...a){counts.validate++;return codec.restoreRun(...a);}};
 const storage={getItem:k=>records.get(k)??null,setItem(k,raw){counts.write++;if(quota)throw Error('quota');records.set(k,raw);}};
 return {g,counts,records,io:createRunStorage({storage,codec:counted}),fail:v=>quota=v,key:v=>key=v};
}
test('600 unchanged ticks skip encode/validation; unpersisted clocks/motion do not dirty run',()=>{
 const f=setup();assert.equal(f.io.write(f.g).status,'saved');
 for(let i=0;i<600;i++){f.g.time=i;f.g.player.pos.x=i;f.g.pistol.reloadingUntil=i;f.g.pistol.nextFireAt=i;assert.equal(f.io.write(f.g).status,'unchanged');}
 assert.deepEqual(f.counts,{encode:1,validate:1,write:1});
});
test('each persisted resource and nested ledger mutation gets validated and immediately saved',()=>{
 const f=setup();f.io.write(f.g);
 for(const change of [g=>g.player.hp=79,g=>g.pistol.magazine=3,g=>g.pistol.reserve=1,g=>g.pistol.equipped=false,g=>g.animalCycle='B',g=>g.droneDeaths.push('east-drone-1'),g=>g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:'westminster-roamer-1',position:{x:0,z:0},hp:0}).state,g=>g.supplies.pending[0].position.x=1,g=>g.supplies.pending[0].remaining=2,g=>g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:'westminster-roamer-2',position:{x:0,z:0},hp:0}).state,g=>g.vest.equipped=true,g=>{g.pistol.collected=false;g.pistol.equipped=false;g.pistol.magazine=0;g.pistol.reserve=0;}]){
  const n=f.counts.write;change(f.g);assert.equal(f.io.write(f.g).status,'saved');assert.equal(f.counts.write,n+1);assert.equal(f.io.write(f.g).status,'unchanged');
 }
 assert.deepEqual(f.counts,{encode:13,validate:13,write:13});
});
test('changed validation context and malformed nested state cannot hit unchanged guard',()=>{
 const f=setup();f.io.write(f.g);f.g.player.maxHP=70;assert.equal(f.io.write(f.g).status,'invalid');assert.equal(f.counts.validate,2);
 f.g.player.maxHP=150;f.g.supplies.issued.push('unknown');assert.equal(f.io.write(f.g).status,'invalid');assert.equal(f.counts.write,1);
 const h=setup();h.io.write(h.g);h.g.supplies.pending.push({});assert.equal(h.io.write(h.g).status,'invalid');
 const k=setup();k.io.write(k.g);k.g.pistol.magazine=7;assert.equal(k.io.write(k.g).status,'invalid');k.g.runSaveInvalid=true;assert.equal(k.io.write(k.g).status,'corrupt');
});
test('failed writes retry same bytes; key changes and restore invalidate successful cache',()=>{
 const f=setup();f.io.write(f.g);f.g.player.hp=75;f.fail(true);
 for(let i=0;i<2;i++)assert.equal(f.io.write(f.g).status,'unavailable');
 f.fail(false);assert.equal(f.io.write(f.g).status,'saved');assert.deepEqual(f.counts,{encode:4,validate:4,write:4});
 assert.equal(f.io.write(f.g).status,'unchanged');f.key('armagedom:test:new-key');assert.equal(f.io.write(f.g).status,'saved');assert.equal(f.records.size,2);
 assert.equal(f.io.restore(f.g).status,'ok');const n=f.counts.validate;assert.equal(f.io.write(f.g).status,'saved');assert.equal(f.counts.validate,n+1);
});
test('fresh validation is never skipped and corrupted restore blocks writes until durable fresh success',()=>{
 const f=setup();f.io.write(f.g);assert.equal(f.io.write(f.g,{fresh:true}).ok,true);assert.equal(f.counts.validate,2);
 f.records.set(codec.RUN_SAVE_KEY,'{bad');assert.equal(f.io.restore(f.g).status,'corrupt');assert.equal(f.io.write(f.g).status,'corrupt');f.fail(true);assert.equal(f.io.write(f.g,{fresh:true}).ok,false);assert.equal(f.io.write(f.g).status,'corrupt');
 f.fail(false);assert.equal(f.io.write(f.g,{fresh:true}).status,'saved');assert.equal(f.io.write(f.g).status,'unchanged');
});
test('optional guard absent or failing keeps old codec validation behavior',()=>{
 for(const extra of [{captureRunState:undefined,isRunStateUnchanged:undefined},{captureRunState(){throw Error('cannot capture');}}]){
  const f=setup(game(),extra);f.io.write(f.g);f.io.write(f.g);assert.equal(f.counts.encode,2);assert.equal(f.counts.validate,2);assert.equal(f.counts.write,1);
 }
});

test('extended stamped context changes revalidate and reject; ledger corruption never overwrites',()=>{
 const g=game(),rule={legacy:false,areaId:'east',tableRef:'dressing-v1',dropId:'area-supply-v2:east-one',outcomes:[{itemId:'dressing',quantity:1,weight:1,conditions:['health-missing']}]};
 g.lootRules={'east-one':rule};g.supplies=createSuppliesState(g.lootRules);g.supplies=issueSupply(g.supplies,{areaId:'east',placementKey:'east-one',position:{x:0,z:0},hp:0,rules:g.lootRules}).state;
 const f=setup(g);assert.equal(f.io.write(g).status,'saved');const raw=f.records.get(codec.RUN_SAVE_KEY);
 assert.equal(f.io.write(g).status,'unchanged');assert.equal(f.counts.validate,1);
 rule.outcomes[0].weight=2;assert.equal(f.io.write(g).status,'invalid');assert.equal(f.counts.validate,2);assert.equal(f.records.get(codec.RUN_SAVE_KEY),raw);
});
test('accessor-backed state falls back to validation; cyclic invalid state rejects',()=>{
 const f=setup();f.io.write(f.g);Object.defineProperty(f.g.supplies,'version',{enumerable:true,get:()=>1});
 assert.equal(f.io.write(f.g).status,'unchanged');assert.equal(f.counts.validate,2);assert.equal(f.io.write(f.g).status,'unchanged');assert.equal(f.counts.validate,3);
 f.g.supplies.pending.push(f.g.supplies);assert.equal(f.io.write(f.g).status,'invalid');assert.equal(f.counts.write,1);
});
