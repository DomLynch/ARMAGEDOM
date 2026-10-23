import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,attack} from '../src/combat.js';
import {KNIFE_MOVES} from '../src/donor/knife.js';
import {ratMeleeDefinition,ratMeleePosePhase} from '../src/rat-melee-definition.js';
// Dom, 2026-10-23: any attack hurts the low animals, like the rat. Stab and Heavy reuse the rat's
// retimed low pose; damage, stamina and cadence stay the selected move's own.
const rigs=[['original-dog','RatLowSlash',false],['original-roach','RatLowSlash',false],['original-wolf','DogMidSlash',true],['giant-salamander','DogMidSlash',true]];
function fixture(rig,reach){const world={areaId:'westminster',layout:{characterScale:1.265},spawn:{x:0,z:-6},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
 const g=createGame(world,{pilot:'donor-knife',encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}},drone:true,areaResidents:true,openingGroup:false});
 const e=g.enemies.find(e=>e.rig==='low-hover-drone');e.rig=rig;e.contactGoalReach=reach?1:undefined;g.enemies=[e];g.player.pos={x:e.pos.x,z:e.pos.z-.95};e.recoverUntil=100;return{g,e};}
for(const [rig,clip,reach] of rigs)for(const [action,id] of [['stab','thrust'],['heavy','heavy_overhead']])test(`${action} locks the ${rig} with the rat's retimed low pose and its own budget`,()=>{
 const{g,e}=fixture(rig,reach),base=KNIFE_MOVES[id];assert.equal(attack(g,action,{x:0,z:1}),true);const s=g.player.swing;
 assert.equal(s.lowTargetId,e.id);assert.equal(s.def.ratLow,true);assert.equal(s.def.ratRetimed,true);assert.equal(s.clip,clip);assert.equal(s.native,false);
 for(const field of ['moveId','damage','stamina','staminaDamage','stagger','cooldown'])assert.equal(s.def[field],base[field],field);
 assert.equal(g.player.stamina,100-base.stamina);
 const phase=ratMeleePosePhase({...s,ageTicks:s.timing.windup},()=>{throw Error('generic');});assert(phase>0&&phase<1);
});
test('non-animal rigs and slash are unchanged',()=>{const low={...KNIFE_MOVES.light_right,clip:'RatLowSlash',ratLow:true,windupTicks:20,activeTicks:6,recoveryTicks:28};
 for(const rig of ['low-hover-drone','hollow-scavenger'])assert.equal(ratMeleeDefinition('stab',KNIFE_MOVES.thrust,low,{rig}),KNIFE_MOVES.thrust);
 assert.equal(ratMeleeDefinition('slash',low,low,{rig:'original-dog'}),low);});
