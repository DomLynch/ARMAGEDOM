import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solveArm,posePhase} from '../src/motion.js';
import {GAME_DATA} from '../src/engine/game-data.js';
test('two-bone cosmetic solve reaches a feasible hand target without stretching bones',()=>{
 const root=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone(),c=new THREE.Bone();root.add(a);a.add(b);b.add(c);b.position.set(0,-.5,0);c.position.set(0,-.5,0);root.updateMatrixWorld(true);
 const target=new THREE.Vector3(.4,-.7,.2);solveArm(a,b,c,target,new THREE.Vector3(1,0,0),1);root.updateMatrixWorld(true);
 assert.ok(c.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-6);assert.equal(b.position.length(),.5);assert.equal(c.position.length(),.5);
});
test('attack animation phase reaches contact at45percent and ends with recovery',()=>{
 assert.equal(posePhase(.12,.12,.24),.45);assert.equal(posePhase(.36,.12,.24),1);assert.equal(posePhase(0,.36,.42),0);
});
test('motion.js numbers live in visual.json and equal the values that were inline (48 to 0)',()=>{
 const m=GAME_DATA.visual.motion;
 assert.deepEqual(m.posePhase,{windupShare:.45,minSeconds:.01});assert.equal(1-m.posePhase.windupShare,.55);
 assert.deepEqual(m.gait,{walkStride:1.31,otherStride:3.5,fullRunSpeed:1.3,runBlendSeconds:.14,strikeBlendSeconds:.08,guardBlendSeconds:.1,minStepSeconds:.001});
 assert.deepEqual(m.swingFallback,{windupSeconds:.14,recoverSeconds:.28});
 assert.deepEqual(m.stab,{startExtension:.05,peakExtension:.9,sideOffset:.08,drop:.2});
 assert.deepEqual(m.heavyWindup,{forward:.25,up:.2,aimForward:.25});
 assert.deepEqual(m.guard,{forward:.28,sideOffset:.12,drop:.2,aimSide:.3});
 assert.equal(m.bigLift,.6);assert.equal(m.soleWeight,.6);
 assert.deepEqual(m.plant,{minSpeed:.3,minRunWeight:.8,groundClearance:.012,maxDrift:.45,contactWindows:{walking:[[.05,.45],[.55,.95]],other:[[.03,.2],[.55,.74]]}});
 for(const [elapsed,windup,recovery] of [[.05,.14,.28],[.3,.14,.28],[0,0,0],[.2,.001,.5]]){
  const old=Math.min(1,Math.max(0,elapsed<windup?.45*elapsed/Math.max(.01,windup):.45+.55*(elapsed-windup)/Math.max(.01,recovery)));
  assert.equal(posePhase(elapsed,windup,recovery),old);
 }
});
