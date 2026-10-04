import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,enemy,attack,receiveHit,stepGame,spawnWave} from '../src/combat.js';
const world={spawn:{x:0,z:0},layout:{characterScale:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
const ticks=(g,n,intent={})=>{for(let i=0;i<n;i++)stepGame(g,intent,1/60);};
function pilot(x=0,z=1.1){const g=createGame(world,{pilot:'donor-knife'});const e=Object.assign(enemy(0,{x,z}),{rig:'goblin',weapon:'knife',combatScale:1,bodyScale:.78,hp:100,maxHP:100,staggerUntil:100});g.enemies=[e];g.wave=1;return {g,e};}
test('pilot exposes matched rigs, six action metadata and authored special',()=>{const {g}=pilot();assert.equal(g.player.rig,'hero');assert.equal(g.player.weapon,'knife');assert.equal(g.cooldowns.special,15);attack(g,'special');assert.equal(g.player.swing.moveId,'skill_pommel');assert.equal(g.player.swing.clip,'Skill_Pommel');});
test('knife slash waits fourteen ticks and lands only once during active sweep',()=>{const {g,e}=pilot();attack(g,'slash');ticks(g,13);assert.equal(e.hp,100);ticks(g,7);assert.equal(e.hp,90);ticks(g,16);assert.equal(e.hp,90);});
test('blade sweep does not hit a target merely inside old sword range',()=>{const {g,e}=pilot(0,2.5);attack(g,'slash');ticks(g,20);assert.equal(e.hp,100);});
test('pilot active contact remains blocked by world obstacles',()=>{const {g,e}=pilot();g.world={...world,lineClear:()=>false};attack(g,'slash');ticks(g,24);assert.equal(e.hp,100);});
test('donor roll has startup vulnerability and safety only on ticks four through twenty',()=>{for(const [age,hp] of [[0,140],[3,140],[4,150],[20,150],[21,140],[36,140]]){const {g}=pilot(20,20);stepGame(g,{dodge:true,move:{x:1,z:0}});const end=g.player.dodgeUntil;ticks(g,age);receiveHit(g,{amount:10,origin:{x:0,z:1}});assert.equal(g.player.hp,hp,`roll age ${age}`);assert.ok(Math.abs(end-37/60)<1e-8);}});
test('parry uses donor stun and explicit attacker/victim semantics',()=>{const {g,e}=pilot();stepGame(g,{guard:true,guardPressed:true});receiveHit(g,{amount:10,origin:e.pos,attacker:e,block:true,parry:true,moveId:'light_right'});assert.equal(g.player.hp,150);assert.ok(e.staggerUntil>=g.time+1.5-1e-8);const p=g.events.find(e=>e.type==='parry');assert.equal(p.attackerId,e.id);assert.equal(p.victimId,0);assert.equal(p.actor.id,0);});
test('pilot spawns one Goblin and its death completes existing encounter contract',()=>{const g=createGame(world,{pilot:'donor-knife'});spawnWave(g);assert.equal(g.enemies.length,1);assert.equal(g.enemies[0].rig,'goblin');assert.equal(g.enemies[0].weapon,'knife');const e=g.enemies[0];e.pos={x:0,z:1};e.hp=1;e.staggerUntil=100;attack(g,'slash');ticks(g,20);assert.equal(g.finished,true);assert.equal(g.won,true);assert.equal(g.enemies.length,0);});

test('late held guard blocks without chip while rear attacks bypass it',()=>{const {g,e}=pilot(0,2);ticks(g,1,{guard:true,guardPressed:true});ticks(g,14,{guard:true});receiveHit(g,{amount:10,origin:e.pos,attacker:e,block:true,parry:true,moveId:'light_right'});assert.equal(g.player.hp,150);assert.equal(g.player.guard,90);receiveHit(g,{amount:10,origin:{x:0,z:-2},attacker:e,block:true,parry:true,moveId:'light_right'});assert.equal(g.player.hp,140);});
test('guard parry cooldown forbids fresh windows from repeated taps',()=>{const {g}=pilot(20,20);stepGame(g,{guard:true,guardPressed:true});const until=g.player.parryUntil;ticks(g,2,{guard:true,guardPressed:true});assert.equal(g.player.parryUntil,until);});
test('released failed parry exposes guard for eight ticks but leaves attack available',()=>{const {g}=pilot(20,20);stepGame(g,{guard:true,guardPressed:true});ticks(g,11);assert.ok(g.player.guardExposedUntil>g.time);stepGame(g,{guard:true});assert.equal(g.player.guarding,false);assert.equal(g.player.guardBrokenUntil,0);assert.equal(attack(g,'slash'),true);});
test('Special has close range and spends fifteen-second cooldown on a whiff',()=>{const {g,e}=pilot(0,4);attack(g,'special');ticks(g,40);assert.equal(e.hp,100);assert.equal(attack(g,'special'),false);assert.equal(g.player.specialReady,15);});
test('cancel clears queued intent and guard while pause freezes simulation',()=>{const {g}=pilot(20,20);attack(g,'slash');ticks(g,28);attack(g,'stab');assert.ok(g.player.buffer);const time=g.time;stepGame(g,{paused:true,cancel:true});assert.equal(g.player.buffer,null);assert.equal(g.player.guarding,false);assert.equal(g.time,time);});
test('one killed target does not stop another opponent or the London simulation',()=>{const {g,e}=pilot(0,1.1);e.hp=1;const other=Object.assign(enemy(0,{x:20,z:20}),{rig:'goblin',weapon:'knife',combatScale:1,bodyScale:.78,staggerUntil:100});g.enemies.push(other);attack(g,'slash');ticks(g,20);assert.equal(g.enemies.length,1);assert.equal(g.enemies[0],other);assert.equal(g.finished,false);});
test('simultaneous lethal contacts trade without player-first kill suppressing enemy contact',()=>{const {g,e}=pilot(0,1);g.player.hp=1;e.hp=1;e.staggerUntil=0;e.facing={x:0,z:-1};e.ready=100;attack(g,'slash');const def=g.player.swing.def;e.swing={...g.player.swing,dir:{x:0,z:-1},hitIds:new Set(),def,ageTicks:0};ticks(g,20);assert.equal(g.player.hp,0);assert.equal(e.hp,0);assert.equal(g.finished,true);assert.equal(g.won,false);});

test('a startup hit interrupts the roll and hurt response owns the recovery',()=>{const {g}=pilot(20,20);stepGame(g,{dodge:true,move:{x:1,z:0}});receiveHit(g,{amount:10,origin:{x:0,z:1},moveId:'light_right'});assert.ok(g.player.dodgeUntil<=g.time);assert.equal(attack(g,'slash'),false);});

test('stationary dodge retreats from the current aim and obstacle movement clamps it',()=>{const {g}=pilot(20,20);g.world={...world,move:(p,d)=>({x:p.x+d.x,z:Math.max(-.05,p.z+d.z)})};stepGame(g,{dodge:true});assert.ok(g.player.pos.z<0);ticks(g,15);assert.equal(g.player.pos.z,-.05);});
test('guard recovers at half donor regeneration while held after spend delay',()=>{const {g}=pilot(20,20);g.player.guard=50;g.player.guardRecoverAt=0;ticks(g,30,{guard:true});assert.ok(Math.abs(g.player.guard-60)<1e-8);});

// Numeric contact helpers exercise the real pinned rig trajectories.
import {bladePose,worldBlade,bladeContact,segmentDistance} from '../src/donor/knife.js';
const body=(rig='hero',x=0,z=0,scale=1)=>({rig,pos:{x,z},facing:{x:0,z:1},combatScale:scale,bodyScale:1});
test('missing rig paths fail closed and hero/Goblin paths remain distinct',()=>{assert.throws(()=>bladePose('other','thrust',12),/no knife/);assert.notDeepEqual(bladePose('hero','thrust',12),bladePose('goblin','thrust',12));});
test('sweep catches a target crossing the blade between tick endpoints',()=>{const a=body(),before=body('hero',-1,.6),after=body('hero',1,.6);assert.equal(bladeContact(a,a,before,before,'light_right',13,14),false);assert.equal(bladeContact(a,a,after,after,'light_right',13,14),false);assert.equal(bladeContact(a,a,before,after,'light_right',13,14),true);});
test('path transform obeys render handedness, rotation and common actor scale',()=>{const a=body(),b={...body('hero',5,-3,2),facing:{x:1,z:0}};const local=bladePose('hero','thrust',12),worldA=worldBlade(a,'thrust',12),worldB=worldBlade(b,'thrust',12);assert.equal(worldA[0][0],-local[0]);assert.equal(worldA[0][2],local[2]);assert.equal(worldB[0][0],5+2*local[2]);assert.equal(worldB[0][1],2*local[1]);assert.equal(worldB[0][2],-3+2*local[0]);});
test('finite segment geometry handles parallel and point blades',()=>{assert.equal(segmentDistance([0,0,0],[0,0,0],[1,0,0],[1,2,0]),1);assert.equal(segmentDistance([0,0,0],[2,0,0],[0,1,0],[2,1,0]),1);assert.equal(segmentDistance([0,0,0],[2,0,0],[1,-1,0],[1,1,0]),0);});

test('chip from an ordinary heavy block does not stagger or drop the held guard',()=>{const {g,e}=pilot(0,2);ticks(g,1,{guard:true,guardPressed:true});ticks(g,14,{guard:true});receiveHit(g,{amount:14,origin:e.pos,attacker:e,block:true,parry:true,moveId:'heavy_overhead'});assert.equal(g.player.hp,147);assert.equal(g.player.hurtUntil,0);stepGame(g,{guard:true});assert.equal(g.player.guarding,true);});

test('stab selects the nearest contacted target even when array order is reversed',()=>{const {g,e}=pilot(0,.95);const far=Object.assign(enemy(0,{x:0,z:1.4}),{rig:'goblin',weapon:'knife',combatScale:1,bodyScale:.78,hp:100,staggerUntil:100});g.enemies=[far,e];attack(g,'stab');ticks(g,16);assert.equal(e.hp,91);assert.equal(far.hp,100);const hit=g.events.find(event=>event.type==='hit');if(hit){assert.equal(hit.actor.id,e.id);assert.equal(hit.attackerId,0);assert.equal(hit.victimId,e.id);}});
test('perfect block stops heavy chip and insufficient guard breaks without free renewal',()=>{const {g,e}=pilot(0,2);stepGame(g,{guard:true,guardPressed:true});ticks(g,10,{guard:true});receiveHit(g,{amount:14,origin:e.pos,attacker:e,block:true,parry:true,moveId:'heavy_overhead'});assert.equal(g.player.hp,150);assert.equal(g.player.guard,90);g.player.guard=1;ticks(g,4,{guard:true});receiveHit(g,{amount:14,origin:e.pos,attacker:e,block:true,parry:true,moveId:'heavy_overhead'});assert.equal(g.player.hp,136);assert.equal(g.player.guard,0);stepGame(g,{guard:true,guardPressed:true});assert.equal(g.player.guarding,false);});

import {readFileSync} from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
test('real Westminster geometry contains the pilot spawn and complete roaming encounter',()=>{
 const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
 const geometry=createGeometry(layout),london={spawn:{x:0,z:-6},layout,...geometry};
 const g=createGame(london,{pilot:'donor-knife'});g.started=true;g.nextWave=0;
 let incoming=0,outgoing=0;
 for(let i=0;i<60*30&&!g.finished;i++){
  const e=g.enemies[0],aim=e?{x:e.pos.x-g.player.pos.x,z:e.pos.z-g.player.pos.z}:{x:0,z:1};
  stepGame(g,{aim,held:['slash']},1/60);
  assert.ok(geometry.clear(g.player.pos,g.player.radius),'player off road');
  assert.ok(g.enemies.every(e=>geometry.clear(e.pos,e.radius)),'Goblin off road');
  for(const hit of g.events.filter(e=>e.type==='hit'))if(hit.victimId===0)incoming++;else outgoing++;
 }
 assert.equal(g.finished,true);assert.equal(g.won,true);assert.equal(g.kills,1);assert.ok(outgoing>0);assert.ok(incoming>0);
});

test('pilot rejects skipped simulation ticks before mutating the fight',()=>{const {g}=pilot();assert.throws(()=>stepGame(g,{},.1),/60 Hz/);assert.equal(g.time,0);});
test('finished pilot rejects external damage and retry starts a fresh guard/swing state',()=>{const {g}=pilot();g.finished=true;g.won=true;assert.equal(receiveHit(g,{amount:10,origin:{x:0,z:1}}),false);assert.equal(g.player.hp,150);const fresh=createGame(world,{pilot:'donor-knife'});assert.equal(fresh.player.swing,null);assert.equal(fresh.player.guard,100);assert.equal(fresh.player.specialReady,0);});

test('lethal pilot hit retains the victim and authored death response for presentation',()=>{const {g,e}=pilot();e.hp=1;attack(g,'slash');ticks(g,20);assert.equal(g.enemies.length,0);assert.ok(Array.isArray(g.corpses),'death presentation collection missing');assert.equal(g.corpses[0],e);assert.equal(e.response.clip,'Death');assert.equal(e.response.ticks,144);const fresh=createGame(world,{pilot:'donor-knife'});assert.deepEqual(fresh.corpses,[]);});
