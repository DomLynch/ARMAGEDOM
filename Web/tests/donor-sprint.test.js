import test from 'node:test';
import assert from 'node:assert/strict';
import {InputState} from '../src/input.js';
import {createGame,stepGame} from '../src/combat.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ticks=(g,n,intent={})=>{for(let i=0;i<n;i++)stepGame(g,intent)};
const game=(blocked=false)=>{const g=createGame({spawn:{x:0,z:0},layout:{characterScale:1.265},move:(p,d)=>blocked?{...p}:{x:p.x+d.x,z:p.z+d.z},lineClear:()=>true},{pilot:'donor-knife'});g.encounterActive=false;return g};
test('floating46px stick 13% radial deadzone, linear analog walk and deliberate outer sprint',()=>{
 const s=new InputState();s.down(1,'move',{x:100,y:100});
 s.move(1,{x:105,y:100});assert.deepEqual(s.take().move,{x:0,y:0});
 s.move(1,{x:123,y:100});near(s.take().move.x,(.5-.13)/.87);assert.equal(s.take().run,false);
 s.move(1,{x:146,y:100});near(s.take().move.x,1);assert.equal(s.take().run,false);
 s.move(1,{x:164.4,y:100});assert.equal(s.take().run,false);
 s.move(1,{x:165,y:100});assert.equal(s.take().run,true);
 s.down(2,'move',{x:0,y:0});s.move(2,{x:100,y:0});assert.equal(s.take().run,true);
 s.cancel(1);assert.equal(s.take().run,false);s.keys.add('KeyD');s.keys.add('ShiftRight');assert.equal(s.take().run,true);
 s.clear();assert.equal(s.take().run,false);
});
test('donor sprint reaches5.2m/s and drains12/s without regen or action delay',()=>{
 const g=game(),intent={move:{x:1,z:0},run:true};ticks(g,20,intent);
 const start=g.player.pos.x,energy=g.player.stamina;ticks(g,120,intent);
 near(g.player.pos.x-start,10.4);near(energy-g.player.stamina,24);assert.equal(g.player.running,true);near(g.player.guardRecoverAt,0);
 const before=g.player.stamina;stepGame(g,{});near(g.player.stamina-before,40/60);assert.equal(g.player.running,false);
});
test('blocked sprint spends nothing and keeps eligible recovery',()=>{
 const g=game(true);g.player.guard=50;ticks(g,60,{move:{x:1,z:0},run:true});near(g.player.pos.x,0);near(g.player.stamina,90);assert.equal(g.player.running,false);
});
test('zero stamina walks at2.1m/s until20 recovery, then held sprint rearms',()=>{
 const g=game(),intent={move:{x:1,z:0},run:true};g.player.guard=.2;stepGame(g,intent);near(g.player.stamina,0);assert.equal(g.player.exhausted,true);
 ticks(g,10,intent);const start=g.player.pos.x;ticks(g,10,intent);near(g.player.pos.x-start,2.1*10/60);assert.equal(g.player.running,false);
 ticks(g,10,intent);near(g.player.stamina,20);assert.equal(g.player.exhausted,false);stepGame(g,intent);assert.equal(g.player.running,true);near(g.player.stamina,19.8);
});
test('guard, melee commitment, roll and hurt inhibit sprint without changing action costs',()=>{
 const guarded=game();guarded.player.guard=40;ticks(guarded,20,{move:{x:1,z:0},run:true,guard:true});near(guarded.player.velocity.x,1.05);assert.equal(guarded.player.running,false);assert.ok(guarded.player.stamina>40);
 for(const intent of [{actions:['slash']},{dodge:true}]){const g=game();stepGame(g,{...intent,move:{x:1,z:0},run:true});assert.equal(g.player.running,false);near(g.player.stamina,intent.dodge?70:82)}
 const hurt=game();hurt.player.hurtUntil=1;ticks(hurt,10,{move:{x:1,z:0},run:true});near(hurt.player.pos.x,0);near(hurt.player.stamina,100);assert.equal(hurt.player.running,false);
});
