import test from 'node:test';
import assert from 'node:assert/strict';
import {finisherImpactProfile,createFinisherImpactGate,FINISHER_IMPACT_LIMITS} from '../src/finisher-impact-profile.js';
const anchors={head:{x:4,y:2,z:-3},body:{x:4,y:1,z:-3}};
const event=(recipeId='opened',damageType='cutting',victimId=1)=>({lethal:true,victimId,recipeId,damageType,impactDirection:{x:3,z:4}});

test('actual presented recipe and anatomy determine emission; ordinary/fallback unchanged',()=>{
  for(const[id,type,anchor]of [['decapitation','cutting','head'],['split-crown','cutting','head'],['opened','cutting','body'],['run-through','piercing','body'],['pistol-directional','bullet','body'],['pistol-decapitation','bullet','head']]){
    const p=finisherImpactProfile(event(id,type),anchors);assert.equal(p.anchor,anchor);assert.deepEqual(p.origin,anchors[anchor]);
    assert.equal(finisherImpactProfile(event(id,type==='bullet'?'cutting':'bullet'),anchors),null);
  }
  assert.equal(finisherImpactProfile(event('ordinary'),anchors),null);
  assert.equal(finisherImpactProfile({...event(),lethal:false},anchors),null);
  assert.equal(finisherImpactProfile(event(),{head:anchors.head}),null);
  assert.equal(finisherImpactProfile({...event(),impactDirection:{x:0,z:0}},anchors),null);
  assert.equal(finisherImpactProfile(event(),{body:{x:NaN,y:1,z:2}}),null);
});
test('direction converted once and anchor snapshot survives later part motion',()=>{
  const moving={body:{...anchors.body}},p=finisherImpactProfile(event(),moving);
  moving.body.y=9;assert.equal(p.origin.y,1);assert.deepEqual(p.direction,{x:.6,y:0,z:-.8});
  assert(Object.isFrozen(p.origin));assert(Object.isFrozen(p));
});
test('concurrent sever bursts remain within existing 48 particle capacity and expire once',()=>{
  const gate=createFinisherImpactGate(),a={},b={},c={};
  const first=gate.start(a,event(),anchors,{freeParticles:48,freeTrails:8,now:2}),second=gate.start(b,event('opened','cutting',2),anchors,{freeParticles:48,freeTrails:8,now:2});
  assert(first&&second);assert(first.droplets+second.droplets<=FINISHER_IMPACT_LIMITS.particles);
  assert(first.trails+second.trails<=FINISHER_IMPACT_LIMITS.trails);
  assert.equal(gate.start(c,event('opened','cutting',3),anchors,{freeParticles:48,freeTrails:8,now:2}),null);
  assert.deepEqual(gate.expire(2.59),[]);assert.equal(gate.expire(2.60).length,2);assert.deepEqual(gate.expire(3),[]);
  assert.equal(gate.start(c,event('opened','cutting',3),anchors,{freeParticles:48,freeTrails:8,now:3}),null);
  const scarce={},fresh=createFinisherImpactGate();
  assert.equal(fresh.start(scarce,event(),anchors,{now:3,freeParticles:19,freeTrails:4}),null);
  assert.equal(fresh.start(scarce,event(),anchors,{now:4,freeParticles:48,freeTrails:8}),null);
  assert.equal(gate.start(a,event(),anchors,{freeParticles:48,freeTrails:8,now:3}),null);
});
test('cancel/area clear never replay; restored corpse suppressed; dispose terminal',()=>{
  const gate=createFinisherImpactGate(),a={},b={},restored={};
  const effect=gate.start(a,event(),anchors,{freeParticles:48,freeTrails:8,now:0});assert(effect);
  assert.equal(gate.cancel(a),effect);assert.equal(gate.cancel(a),null);
  assert.equal(gate.start(a,event(),anchors,{freeParticles:48,freeTrails:8,now:1}),null);
  assert.equal(gate.start(restored,event(),anchors,{freeParticles:48,freeTrails:8,now:1,restored:true}),null);
  assert.equal(gate.start(restored,event(),anchors,{freeParticles:48,freeTrails:8,now:1}),null);
  assert(gate.start(b,event(),anchors,{freeParticles:48,freeTrails:8,now:1}));assert.equal(gate.clear().length,1);
  assert.equal(gate.start(b,event(),anchors,{freeParticles:48,freeTrails:8,now:2}),null);
  gate.dispose();assert.equal(gate.start({},event(),anchors,{freeParticles:48,freeTrails:8,now:2}),null);
});
test('finite dark-crimson non-additive profiles; no geometry/clock/reward state mutation',()=>{
  for(const[id,type]of [['opened','cutting'],['run-through','piercing'],['pistol-directional','bullet']]){
    const input=event(id,type),before=JSON.stringify(input),p=finisherImpactProfile(input,anchors);
    assert.equal(JSON.stringify(input),before);assert(p.lifetime<=.60&&p.lifetime>0);
    assert(p.droplets<=24&&p.trails<=4);assert(p.depthTest&&!p.depthWrite&&!p.additive&&!p.bloom);
    for(const color of p.palette){assert((color>>16&255)<=0x83);assert((color>>16&255)>(color>>8&255));}
  }
});
