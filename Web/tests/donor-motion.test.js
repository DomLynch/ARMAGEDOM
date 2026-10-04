import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {DonorMotion,equipDonorPlayer,donorSwingPhase} from '../src/donor-motion.js';
import {loadGeometry,endpoints,sha} from '../../art/donor/probe.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/donor/manifest.json',import.meta.url)));
const tables=JSON.parse(fs.readFileSync(new URL('./fixtures/donor-knife-contacts.json',import.meta.url)));
const load=file=>loadGeometry(fs.readFileSync(new URL('../public/assets/donor/'+file,import.meta.url)));
const warrior=await load('warrior.glb'),goblin=await load('goblin.glb'),knife=await load('knife.glb');
function actor(rig){const source=rig==='hero'?equipDonorPlayer({scene:clone(warrior.scene),animations:warrior.animations},knife):{scene:clone(goblin.scene),animations:goblin.animations};const root=new THREE.Group();root.scale.setScalar(1.265);root.add(source.scene);return {source,root,motion:new DonorMotion(root,source.scene,source.animations,manifest.models[rig==='hero'?'vagrant':'goblin'])};}
for(const [timing,contact] of [[{windup:14,active:6,recovery:16},.34],[{windup:12,active:4,recovery:20},.34],[{windup:22,active:5,recovery:26},.48],[{windup:18,active:4,recovery:18},.45]])test('Contact phase '+timing.windup,()=>{assert.equal(donorSwingPhase(timing.windup,timing,contact),contact);assert.equal(donorSwingPhase(-1,timing,contact),0);assert.equal(donorSwingPhase(999,timing,contact),1);});
test('Equip preserves source scenes, grip transform and player overrides',()=>{const a=actor('hero');assert(knife.scene.getObjectByName('WeaponDrawn'));assert(warrior.scene.getObjectByName('SwordDrawn'));assert.equal(a.source.scene.getObjectByName('WeaponDrawn').parent.name,'hand_r');assert.equal(a.source.animations.find(c=>c.name==='Heavy'),knife.animations.find(c=>c.name==='Heavy'));assert.equal(goblin.animations.find(c=>c.name==='Heavy').name,'Heavy');assert.deepEqual(a.source.scene.getObjectByName('WeaponDrawn').position.toArray(),knife.scene.getObjectByName('WeaponDrawn').position.toArray());a.motion.dispose();});
const moves={light_right:['slash','Attack',14,6,16,.34],light_left:['slash','Return',14,6,16,.34],thrust:['stab','Riposte',12,4,20,.34],heavy_overhead:['heavy','Heavy',22,5,26,.48]};
for(const rig of ['hero','goblin'])for(const [path,[action,clip,windup,active,recovery,sourceContact]]of Object.entries(moves))test(rig+' '+path+' fixed-tick contacts and cardinal headings',()=>{const a=actor(rig),timing={windup,active,recovery};for(const facing of [{x:0,z:1},{x:1,z:0},{x:0,z:-1},{x:-1,z:0}]){a.root.position.set(3,0,-2);a.root.rotation.y=Math.atan2(facing.x,-facing.z);for(let age=0;age<windup+active+recovery;age++){a.motion.update({hp:100,swing:{action,clip,ageTicks:age,timing,sourceContact,start:0,end:10}},age/60,1/60);const actual=endpoints(a.source),expected=tables[rig].knife[path][age];for(let j=0;j<2;j++){const [x,y,z]=expected.slice(j*3,j*3+3),domainX=-x*facing.z+z*facing.x,domainZ=x*facing.x+z*facing.z;assert(actual[j].distanceTo(new THREE.Vector3(3+domainX*1.265,y*1.265,-2-domainZ*1.265))<.000012,'visible blade differs from baked sweep');}}}a.motion.dispose();});
test('Cancellation, responses, guard, roll, special, death and independent mixers',()=>{const a=actor('hero'),b=actor('hero');a.motion.update({hp:100,swing:{clip:'Skill_Pommel',ageTicks:18,timing:{windup:18,active:4,recovery:18},sourceContact:.45,end:1}},.3,.016);assert.equal(a.motion.currentClip,'Skill_Pommel');assert.equal(a.motion.currentPhase,.45);a.motion.update({hp:100,swing:null,guarding:true},.31,.016);assert.equal(a.motion.currentClip,'Guard');a.motion.update({hp:100,dodgeStart:.32,dodgeUntil:.92},.62,.016);assert.equal(a.motion.currentClip,'Roll');assert(Math.abs(a.motion.currentPhase-.5)<1e-12);for(const clip of ['Hit','Parry','BlockImpact','Deflected']){a.motion.update({hp:100,response:{clip,start:1,ticks:12}},1.1,.016);assert.equal(a.motion.currentClip,clip);}a.motion.update({hp:100},2,.016);assert.equal(a.motion.currentClip,'Armed');a.motion.update({hp:0,response:{clip:'Death',start:3,ticks:144}},4,.016);assert.equal(a.motion.currentClip,'Death');assert.equal(b.motion.currentClip,'Armed');a.motion.dispose();b.motion.dispose();});
test('Candidate hashes, preserved roots and rig-specific stride',()=>{for(const entry of Object.values(manifest.files)){const bytes=fs.readFileSync(new URL('../public/assets/donor/'+entry.file,import.meta.url));assert.equal(sha(bytes),entry.sha256);assert.equal(entry.errors,0);}assert.equal(manifest.models.goblin.scale,1);assert.equal(manifest.models.goblin.stride,.7014);assert.deepEqual(goblin.scene.children[0].scale.toArray(),[.7515,.80995,.80995]);});
test('Moving guard uses native legs and dedicated upper guard; stopped simulation stays still',()=>{const a=actor('hero');a.root.position.z=.02;a.motion.update({hp:100,guarding:true},1,1/60);assert.equal(a.motion.guardUpper.getEffectiveWeight(),1);assert.equal(a.motion.actions.get(a.motion.currentClip).getEffectiveWeight(),0);assert.equal(a.motion.actions.get(a.motion.currentClip+'GuardLegs').getEffectiveWeight(),1);assert(a.motion.actions.get(a.motion.currentClip+'GuardLegs').getClip().tracks.every(t=>!t.name.startsWith('hand_')));const cycle=a.motion.cycle;a.motion.update({hp:100,guarding:true},1,0);assert.equal(a.motion.cycle,cycle);a.motion.dispose();a.motion.dispose();});
test('A fresh counter swing supersedes lingering parry response',()=>{const a=actor('hero');a.motion.update({hp:100,response:{clip:'Parry',start:0,ticks:10},swing:{clip:'Attack',ageTicks:14,timing:{windup:14,active:6,recovery:16},sourceContact:.34,end:1}},.1,.016);assert.equal(a.motion.currentClip,'Attack');assert.equal(a.motion.currentPhase,.34);a.motion.dispose();});
test('ordinary 3m/s uses ArmedWalk and no-tick 120Hz frames retain it with the same cadence as 60Hz',()=>{
 const samples=[];
 for(const fps of [60,120]){
  const a=actor('hero');a.root.scale.setScalar(1.265*1.3225);a.root.rotation.y=Math.PI;
  const entity={hp:100,swing:null,guarding:false};let time=0,accumulator=0,wrong=0;
  a.motion.update(entity,0,0);
  for(let frame=0;frame<fps*2;frame++){
   accumulator+=1/fps;
   while(accumulator+1e-10>=1/60){time+=1/60;a.root.position.z-=3/60;accumulator-=1/60;}
   a.motion.update(entity,time,1/fps);
   if(time>0&&a.motion.currentClip!=='ArmedWalk')wrong++;
  }
  samples.push({fps,wrong,phase:a.motion.currentPhase,z:a.root.position.z});a.motion.dispose();
 }
 assert.equal(samples[0].wrong,0);assert.equal(samples[1].wrong,0);
 assert.ok(Math.abs(samples[0].phase-samples[1].phase)<1e-10);
 assert.ok(Math.abs(samples[0].z-samples[1].z)<1e-10);
});
