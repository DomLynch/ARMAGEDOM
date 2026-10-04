import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,enemy,receiveHit,stepGame} from '../src/combat.js';

const world={spawn:{x:0,z:0},layout:{characterScale:1},
  move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
const direction=degrees=>({x:Math.sin(degrees*Math.PI/180),z:Math.cos(degrees*Math.PI/180)});
function guarded(mode,initialFacing=0){
  const g=createGame(world,{pilot:'donor-knife'});
  const attacker=Object.assign(enemy(0,{x:20,z:20}),{staggerUntil:100});
  g.enemies=[attacker];g.wave=1;
  stepGame(g,{guard:true,guardPressed:true,aim:direction(initialFacing)});
  if(mode==='block')for(let i=0;i<14;i++)stepGame(g,{guard:true});
  return {g,attacker};
}
function impact(g,attacker,degrees){
  const d=direction(degrees);
  receiveHit(g,{amount:14,moveId:'heavy_overhead',attacker,block:true,parry:true,
    origin:{x:g.player.pos.x+d.x*2,z:g.player.pos.z+d.z*2}});
}
function expectOutcome(g,mode,covered,capacity){
  const defence=g.events.filter(e=>['parry','block','guard-break'].includes(e.type));
  if(covered){
    assert.equal(g.player.hp,mode==='parry'?150:147);
    assert.equal(g.player.guard,mode==='parry'?capacity:capacity-20);
    assert.ok(defence.some(e=>e.type===mode));
  }else{
    assert.equal(g.player.hp,136,'bypassed hit must deal full damage');
    assert.equal(g.player.guard,capacity,'bypassed hit must not spend guard');
    assert.equal(defence.length,0,'bypassed hit must not emit defence success/break');
    assert.equal(g.player.guardRecoverAt,0,'bypassed hit must not postpone guard regeneration');
  }
}
const cases=[
  ['front',0,true],['right side',90,false],['left side',-90,false],['rear',180,false],
  ['right just inside',59.999,true],['left just inside',-59.999,true],
  ['right boundary',60,true],['left boundary',-60,true],
  ['right just outside',60.001,false],['left just outside',-60.001,false]
];
for(const mode of ['block','parry']){
  for(const [name,angle,covered] of cases)test(`${mode}: ${name} obeys frontal 120-degree cone`,()=>{
    const {g,attacker}=guarded(mode);g.player.guard=80;
    impact(g,attacker,angle);expectOutcome(g,mode,covered,80);
  });
  for(const [from,to,covered] of [[0,90,false],[0,-90,false],[0,180,false],[90,0,true]]){
    test(`${mode}: turn ${from} to ${to} before front impact uses current facing`,()=>{
      const {g,attacker}=guarded(mode,from);
      stepGame(g,{guard:true,aim:direction(to)});g.player.guard=80;
      impact(g,attacker,0);expectOutcome(g,mode,covered,80);
    });
  }
}
