import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DonorMotion} from '../src/donor-motion.js';
test('player5.2m/s sprint samples native Run at1x independent of approved visual scale',()=>{
 for(const scale of [1.265,1.6729625]){
  const root=new THREE.Group(),model=new THREE.Group();root.scale.setScalar(scale);root.add(model);
  const duration=2/3,clips=[new THREE.AnimationClip('Idle',1,[]),new THREE.AnimationClip('ArmedWalk',4/3,[]),new THREE.AnimationClip('Run',duration,[])];
  const motion=new DonorMotion(root,model,clips,{clips:{idle:'Idle',walk:'ArmedWalk',run:'Run',guard:'Parry'},stride:1});
  const entity={hp:150,running:true};motion.update(entity,0,0);root.position.z+=5.2*.1;motion.update(entity,.1,.1);
  assert.equal(motion.currentClip,'Run');assert.ok(Math.abs(motion.currentPhase-.1/duration)<1e-8);motion.dispose();
 }
});
