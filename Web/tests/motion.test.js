import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solveArm,posePhase} from '../src/motion.js';
test('two-bone cosmetic solve reaches a feasible hand target without stretching bones',()=>{
 const root=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone(),c=new THREE.Bone();root.add(a);a.add(b);b.add(c);b.position.set(0,-.5,0);c.position.set(0,-.5,0);root.updateMatrixWorld(true);
 const target=new THREE.Vector3(.4,-.7,.2);solveArm(a,b,c,target,new THREE.Vector3(1,0,0),1);root.updateMatrixWorld(true);
 assert.ok(c.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-6);assert.equal(b.position.length(),.5);assert.equal(c.position.length(),.5);
});
test('attack animation phase reaches contact at45percent and ends with recovery',()=>{
 assert.equal(posePhase(.12,.12,.24),.45);assert.equal(posePhase(.36,.12,.24),1);assert.equal(posePhase(0,.36,.42),0);
});
