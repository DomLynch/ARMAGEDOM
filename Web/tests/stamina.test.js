import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,stepGame,receiveHit} from '../src/combat.js';
import {createGeometry} from '../src/world-geometry.js';
const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
function game(){const g=createGame({spawn:{x:0,z:-6},layout,...createGeometry(layout)},{pilot:'donor-knife'});g.encounterActive=false;return g;}
const ticks=(g,n,intent={})=>{for(let i=0;i<n;i++)stepGame(g,intent);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

// Wrong costs, duplicate spend, free rolls, phase-independent regen and buffered
// unaffordable retries must fail these production-loop assertions.
for(const [action,cost] of [['slash',18],['stab',14],['heavy',26],['special',40]])test(`${action} pays donor cost once even on a whiff or interruption`,()=>{
 const g=game();stepGame(g,{actions:[action]});near(g.player.stamina,100-cost);assert.ok(g.player.swing);ticks(g,5);near(g.player.stamina,100-cost);
 receiveHit(g,{amount:1,origin:{x:0,z:-5},moveId:'thrust'});assert.equal(g.player.swing,null);near(g.player.stamina,100-cost);
});
test('dodge spends30 once and committed/repeated inputs spend nothing',()=>{
 const g=game();stepGame(g,{dodge:true});near(g.player.stamina,70);const delay=g.player.guardRecoverAt;ticks(g,20,{dodge:true,actions:['slash']});near(g.player.stamina,70);assert.equal(g.player.guardRecoverAt,delay);
});
test('buffer pays only when admitted and only once',()=>{
 const g=game();stepGame(g,{actions:['slash']});ticks(g,26);stepGame(g,{actions:['stab']});assert.ok(g.player.buffer);near(g.player.stamina,82);ticks(g,9);assert.equal(g.player.swing.moveId,'thrust');near(g.player.stamina,68);ticks(g,10);near(g.player.stamina,68);
});
test('unaffordable tail input is never queued or charged and cannot delay recovery',()=>{
 const g=game();g.player.stamina=25;g.player.guardRecoverAt=1;stepGame(g,{actions:['slash']});ticks(g,26);const delay=g.player.guardRecoverAt;stepGame(g,{actions:['stab'],dodge:true});assert.equal(g.player.buffer,null);near(g.player.stamina,7);assert.equal(g.player.guardRecoverAt,delay);ticks(g,60,{actions:['special']});assert.ok(g.player.stamina>7);assert.equal(g.player.swing,null);assert.equal(g.player.buffer,null);
});
test('cooldown, hurt and guard-break refusal charge nothing',()=>{
 for(const field of ['specialReady','hurtUntil','guardBrokenUntil']){const g=game();g.player[field]=10;stepGame(g,{actions:['special']});near(g.player.stamina,100);assert.equal(g.player.swing,null);assert.equal(g.player.guardRecoverAt,0);}
});
test('full and held-guard recovery wait45ticks after spending',()=>{
 for(const [intent,expected] of [[{},70+40/60],[{guard:true},70+20/60]]){const g=game();stepGame(g,{dodge:true});ticks(g,44,intent);near(g.player.stamina,70);stepGame(g,intent);near(g.player.stamina,expected);ticks(g,29,intent);near(g.player.stamina,70+(intent.guard?20:40)/2);}
});
test('zero exhausts actions/guard until20 restored while ordinary movement remains',()=>{
 const g=game();g.player.stamina=18;g.player.guardRecoverAt=1;stepGame(g,{actions:['slash']});near(g.player.stamina,0);assert.equal(g.player.exhausted,true);ticks(g,44);ticks(g,20);assert.ok(g.player.stamina>0&&g.player.stamina<20);const pos={...g.player.pos};stepGame(g,{guard:true,actions:['stab'],dodge:true,move:{x:1,z:0}});assert.equal(g.player.guarding,false);assert.equal(g.player.swing,null);assert.ok(g.player.pos.x>pos.x);ticks(g,10);assert.equal(g.player.exhausted,false);stepGame(g,{actions:['stab']});assert.equal(g.player.swing.moveId,'thrust');
});
test('front block/perfect use shared stamina; parry/rear semantics unchanged',()=>{
 const g=game();g.player.guard=50;g.player.guardRecoverAt=1;near(g.player.stamina,50);stepGame(g,{guard:true,guardPressed:true,aim:{x:0,z:1}});receiveHit(g,{amount:10,origin:{x:0,z:-5},block:true,parry:true,moveId:'light_right'});near(g.player.stamina,50);assert.equal(g.events.at(-1).type,'parry');
 ticks(g,30);stepGame(g,{guard:true,guardPressed:true});ticks(g,10,{guard:true});const pre=g.player.stamina;receiveHit(g,{amount:10,origin:{x:0,z:-5},block:true,parry:true,moveId:'light_right'});near(g.player.stamina,pre-5);assert.equal(g.events.at(-1).perfect,true);near(g.player.guard,g.player.stamina);
 ticks(g,4,{guard:true});const preBlock=g.player.stamina;receiveHit(g,{amount:10,origin:{x:0,z:-5},block:true,parry:true,moveId:'light_right'});near(g.player.stamina,preBlock-10);const delay=g.player.guardRecoverAt;receiveHit(g,{amount:10,origin:{x:0,z:-7},block:true,parry:true,moveId:'light_right'});near(g.player.stamina,preBlock-10);assert.equal(g.player.guardRecoverAt,delay);assert.equal(g.player.hp,140);
});
test('block empties unified pool and exhaustion clears guard',()=>{
 const g=game();g.player.guard=10;g.player.guardRecoverAt=1;ticks(g,14,{guard:true});receiveHit(g,{amount:10,origin:{x:0,z:-5},block:true,moveId:'light_right'});near(g.player.stamina,0);assert.equal(g.player.exhausted,true);stepGame(g,{guard:true});assert.equal(g.player.guarding,false);
});
test('pause freezes stamina/exhaustion/recovery; fresh retry restores100',()=>{
 const g=game();g.player.stamina=18;g.player.guardRecoverAt=1;stepGame(g,{actions:['slash']});const before=[g.time,g.player.stamina,g.player.exhausted,g.player.guardRecoverAt];ticks(g,100,{paused:true,held:['slash'],dodge:true});assert.deepEqual([g.time,g.player.stamina,g.player.exhausted,g.player.guardRecoverAt],before);const retry=game();assert.equal(retry.player.stamina,100);assert.equal(retry.player.exhausted,false);assert.equal(retry.player.maxStamina,100);assert.deepEqual(retry.staminaCosts,{slash:18,stab:14,heavy:26,special:40,dodge:30});
});
for(const mode of ['held','tap'])test(`${mode} spam depletes and recovers without starving regen`,()=>{
 const g=game();let started=0,rejected=0;for(let i=0;i<600;i++){const intent=mode==='held'?{held:['slash']}:(i%9===0?{actions:['slash']}:{});stepGame(g,intent);started+=g.events.filter(e=>e.type==='attack').length;if(i>220&&intent.actions&&!g.events.some(e=>e.type==='attack')&&!g.player.buffer)rejected++;}
 assert.ok(started<16,`unbounded spam: ${started}`);assert.ok(started>=10,'refused spam must allow recovery');assert.ok(g.player.stamina>=0&&g.player.stamina<=100);if(mode==='tap')assert.ok(rejected>0);ticks(g,180);near(g.player.stamina,100);
});
test('legacy encounter retains original guard behavior',()=>{const g=createGame({spawn:{x:0,z:0},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true});stepGame(g,{actions:['slash']});assert.equal(g.player.guard,100);assert.equal(g.player.stamina,undefined);});

import {pacedKnifeIntent} from './helpers/paced-knife.js';
test('Goblin pays same costs, exhausts, waits for20 and regenerates60/s idle',()=>{
 const g=game();g.encounterActive=true;g.started=true;g.nextWave=0;stepGame(g,{});const e=g.enemies[0];
 e.pos={x:0,z:-4.8};e.facing={x:0,z:-1};e.stamina=18;e.guardRecoverAt=1;
 stepGame(g,{guard:true,aim:{x:0,z:1}});assert.equal(e.swing.moveId,'light_right');near(e.stamina,0);assert.equal(e.exhausted,true);assert.equal(e.maxStamina,100);
 const delay=e.guardRecoverAt;let idleRecovery=0,secondAttack=false;
 for(let i=0;i<150&&!secondAttack;i++){
  const before=e.stamina;stepGame(g,{guard:true,aim:{x:0,z:1}});
  if(g.events.some(v=>v.type==='enemy-attack')){assert.ok(before>=19,'new action before20 recovery');assert.equal(e.swing.moveId,'thrust');near(e.stamina,6);secondAttack=true;}
  else if(g.time<delay-1e-8)near(e.stamina,0);
  else if(!e.swing&&g.time>=e.recoverUntil&&g.time>=e.staggerUntil){near(e.stamina-before,1);idleRecovery++;if(e.stamina<20)assert.equal(e.exhausted,true);}
 }
 assert.equal(secondAttack,true);assert.ok(idleRecovery>=19);
});
for(const entryTicks of [0,120])test(`actual Westminster paced guard/counter wins after ${entryTicks}-tick entry`,()=>{
 const g=game();g.encounterActive=true;for(let i=0;i<entryTicks;i++)stepGame(g,{move:{x:0,z:1}});
 let parries=0,attacks=0,enemyAttacks=0;
 for(let i=0;i<60*60&&!g.finished;i++){
  stepGame(g,pacedKnifeIntent(g));
  parries+=g.events.filter(e=>e.type==='parry').length;attacks+=g.events.filter(e=>e.type==='attack').length;enemyAttacks+=g.events.filter(e=>e.type==='enemy-attack').length;
  assert.ok(g.world.clear(g.player.pos,g.player.radius));assert.ok(g.enemies.every(e=>g.world.clear(e.pos,e.radius)));
  assert.ok(g.player.stamina>=0&&g.player.stamina<=100);assert.ok(g.enemies.every(e=>e.stamina>=0&&e.stamina<=100));
 }
 assert.equal(g.finished,true);assert.equal(g.won,true);assert.equal(g.kills,1);assert.ok(parries>=5);assert.ok(attacks>=12);assert.ok(enemyAttacks>=5);assert.ok(g.player.hp>0);
});
test('heavy recovery cannot regenerate merely because45tick spend delay expired',()=>{
 const g=game();stepGame(g,{actions:['heavy']});ticks(g,51);near(g.player.stamina,74);assert.ok(g.player.swing,'heavy still committed');ticks(g,2);near(g.player.stamina,74+40/60);assert.equal(g.player.swing,null);
});
