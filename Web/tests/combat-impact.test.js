import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombatImpact,createHitReaction} from '../src/combat-impact.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('40/50/80ms holds consume leftover time without slowing external clocks',()=>{
 for(const [pistol,killed,hold] of [[false,false,.04],[true,false,.05],[true,true,.08]]){
  const fx=createCombatImpact();fx.event({type:'shot',pistol,x:1,y:0});fx.event({type:killed?'death':'hit',pistol,x:1,y:0});
  close(fx.update(0).hold,hold);let gameplayClock=0;
  gameplayClock+=.12;const state=fx.update(.12);close(gameplayClock,.12);close(state.hold,0);close(state.shot,Math.exp(-(.12-hold)*(pistol?12:18)));
 }
});

test('frame partition invariance includes hold boundary and camera waveform',()=>{
 const a=createCombatImpact(),b=createCombatImpact();
 for(const fx of [a,b]){fx.event({type:'shot',pistol:true,x:.3,y:.4});fx.event({type:'death',x:.3,y:.4});}
 const one=a.update(.123);for(const dt of [.017,.031,.04,.035])b.update(dt);const split=b.update(0);
 for(const key of ['shot','hold','cameraX','cameraY'])close(one[key],split[key]);
});

test('High/Low/Off and reduced motion remain distinct and reset old impulses',()=>{
 for(const [mode,reducedMotion,energy] of [['high',false,1],['low',false,.4],['off',false,0],['high',true,.4],['off',true,0]]){
  const fx=createCombatImpact({mode,reducedMotion});fx.event({type:'shot',x:1,y:0});fx.event({type:'hit',x:1,y:0,pistol:true});const s=fx.update(0);
  close(s.shot,energy);assert.equal(s.mode,reducedMotion&&mode==='high'?'low':mode);assert.equal(s.cameraX!==0,mode==='high'&&!reducedMotion);assert.equal(s.hold>0,mode==='high'&&!reducedMotion);
  fx.configure({mode:'off'});assert.deepEqual(fx.update(0),createCombatImpact({mode:'off',reducedMotion}).update(0));
 }
});

test('rapid directional events are finite and camera norm never exceeds eight CSS pixels',()=>{
 const fx=createCombatImpact();for(let i=0;i<10000;i++){fx.event({type:'death',x:1e300,y:1e300,strength:50});const s=fx.update(0);assert.ok(Math.hypot(s.cameraX,s.cameraY)<=8+1e-12);close(s.hold,.08);assert.ok(Number.isFinite(s.cameraX));}
 const zero=createCombatImpact();zero.event({type:'hit',x:0,y:0});assert.equal(zero.update(0).cameraX,0);
});

test('shorter event cannot shorten pending lethal hold; recoil and hit impulses reinforce',()=>{
 const fx=createCombatImpact();fx.event({type:'death',x:1,y:0});fx.update(.01);fx.event({type:'hit',x:1,y:0});close(fx.update(0).hold,.07);
 const f=createCombatImpact();f.event({type:'shot',x:1,y:0});f.event({type:'hit',x:1,y:0});close(f.update(0).cameraX,-7);
});

test('pause freezes presentation only; invalid input cannot poison state and reset clears it',()=>{
 const fx=createCombatImpact();fx.event({type:'shot',pistol:true,x:1,y:0});const before=fx.update(0);assert.deepEqual(fx.update(20,{paused:true}),before);
 for(const dt of [NaN,Infinity,-1])assert.deepEqual(fx.update(dt),before);
 for(const event of [{type:'unknown'},{type:'death',strength:NaN},{type:'hit',strength:0}])assert.equal(fx.event(event),false);
 const event={type:'hit',x:NaN,y:Infinity};fx.event(event);assert.ok(Number.isFinite(fx.update(0).cameraX));assert.deepEqual(event,{type:'hit',x:NaN,y:Infinity});
 fx.reset();assert.deepEqual(fx.update(0),createCombatImpact().update(0));fx.event({type:'shot'});const s=fx.update(100);assert.equal(s.shot,0);assert.equal(s.cameraX,0);
});

test('victim reactions are isolated, direction-normalized, exact and never advance finisher time',()=>{
 const a=createHitReaction(),b=createHitReaction();let finisherAge=0;
 a.hit({x:3,z:4,killed:true});close(a.update(0).x,.6);close(a.update(0).z,.8);assert.equal(b.update(0).energy,0);
 finisherAge+=.13;const r=a.update(.13);close(finisherAge,.13);close(r.energy,Math.exp(-.05*10));assert.equal(r.killed,true);
 const c=createHitReaction();c.hit({x:3,z:4,killed:true});for(const dt of [.03,.04,.06])c.update(dt);close(c.update(0).energy,r.energy);
 a.configure({mode:'low'});a.hit({x:1,z:0});close(a.update(0).energy,.4);close(a.update(.02).energy,.4*Math.exp(-.02*12));a.reset();assert.equal(a.update(0).energy,0);
});

test('victim pause, mode/motion transition and malformed strength have safe lifecycles',()=>{
 const r=createHitReaction({mode:'high',reducedMotion:true});r.hit({x:1,z:0});assert.equal(r.update(0).mode,'low');assert.equal(r.update(0).hold,0);const before=r.update(0);assert.deepEqual(r.update(10,{paused:true}),before);
 assert.equal(r.hit({strength:Infinity}),false);assert.deepEqual(r.update(NaN),before);r.configure({mode:'off'});r.hit({x:1,z:0});assert.equal(r.update(0).energy,0);r.configure({mode:'bad'});assert.equal(r.update(0).mode,'low');
});

test('normal per-victim hold is45ms, independent of global pistol50ms',()=>{
 const r=createHitReaction();r.hit({x:1,z:0});close(r.update(0).hold,.045);close(r.update(.06).energy,Math.exp(-.015*12));
});
