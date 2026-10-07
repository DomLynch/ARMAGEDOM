import test from 'node:test';import assert from 'node:assert/strict';
import{ratMeleeDefinition,ratMeleePosePhase}from'../src/rat-melee-definition.js';
import{KNIFE_MOVES}from'../src/donor/knife.js';
const low={...KNIFE_MOVES.light_right,moveId:'rat_low',clip:'RatLowSlash',ratLow:true,native:true,windupTicks:20,activeTicks:6,recoveryTicks:28};
test('rat-only Stab/Heavy preserve combat authority while requesting explicit retimed low pose',()=>{
 for(const[action,id]of [['stab','thrust'],['heavy','heavy_overhead']]){
  const base=KNIFE_MOVES[id],before=JSON.stringify(base),def=ratMeleeDefinition(action,base,low,{rig:'original-rat'});
  assert.equal(def.clip,'RatLowSlash');assert.equal(def.native,false);assert(def.ratLow&&def.ratRetimed);
  for(const key of ['moveId','damage','stamina','staminaDamage','windupTicks','activeTicks','recoveryTicks','windup','active','recovery','range','stepIn','knockback','parryable','stagger','chip','cooldown'])assert.equal(def[key],base[key],key);
  assert.equal(JSON.stringify(base),before);
  for(const rig of ['original-dog','original-roach','low-hover-drone','hollow-scavenger'])assert.equal(ratMeleeDefinition(action,base,low,{rig}),base);
 }
 assert.equal(ratMeleeDefinition('slash',low,low,{rig:'original-rat'}),low);
});
test('retimed action uses complete native low active window with original action boundaries',()=>{
 const def=ratMeleeDefinition('stab',KNIFE_MOVES.thrust,low,{rig:'original-rat'}),s={def,clip:def.clip,native:false,ageTicks:12,timing:{windup:12,active:4,recovery:20},sourceContact:def.sourceContact};
 const fallback=()=>{throw Error('rat-only phase must not use generic active sweep');};
 for(const[age,phase]of [[0,0],[12,20/54],[16,26/54],[36,1]])assert.equal(ratMeleePosePhase({...s,ageTicks:age},fallback),phase);
 const heavy=ratMeleeDefinition('heavy',KNIFE_MOVES.heavy_overhead,low,{rig:'original-rat'}),h={def:heavy,clip:heavy.clip,native:false,timing:{windup:22,active:5,recovery:26},sourceContact:heavy.sourceContact};
 for(const[age,phase]of [[0,0],[22,20/54],[27,26/54],[53,1]])assert.equal(ratMeleePosePhase({...h,ageTicks:age},fallback),phase);
 assert.equal(ratMeleePosePhase({def:low,ageTicks:23,timing:{},sourceContact:0},()=>.75),.75);
 assert.throws(()=>ratMeleePosePhase({...s,native:true},()=>.5));
 assert.throws(()=>ratMeleePosePhase({...s,ageTicks:NaN},fallback));
});
test('last real Stab/Heavy active tick reaches demonstrated existing Low pose26',()=>{
 for(const[action,id,w,a,r]of [['stab','thrust',12,4,20],['heavy','heavy_overhead',22,5,26]]){
  const def=ratMeleeDefinition(action,KNIFE_MOVES[id],low,{rig:'original-rat'}),s={def,clip:def.clip,native:false,timing:{windup:w,active:a,recovery:r},sourceContact:def.sourceContact};
  const phase=age=>ratMeleePosePhase({...s,ageTicks:age},()=>{throw Error('generic');});
  assert.equal(phase(w),20/54);assert.equal(phase(w+a-1),26/54);
  assert.equal(phase(w+a),26/54);assert.equal(phase(w+a+r),1);
  assert.equal(ratMeleePosePhase({...s,ageTicks:w,timing:{windup:w,active:1,recovery:r}},()=>0),20/54);
 }
});
