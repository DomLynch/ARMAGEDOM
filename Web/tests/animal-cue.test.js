import test from 'node:test';
import assert from 'node:assert/strict';
import {pistolCue,resolvePistolShot,selectCombatTarget} from '../src/pistol-targeting.js';
const specs=[['original-rat',1.09,1.49],['original-dog',1.54,1.94],['original-roach',1.59,1.99]];
const at=(degrees,distance)=>({x:Math.sin(degrees*Math.PI/180)*distance,z:Math.cos(degrees*Math.PI/180)*distance});
const enemy=(id,rig,radius,pos)=>({id,rig,radius,pos,hp:20,visible:true,areaId:'westminster',contactGoalReach:1,mobSize:1});
const game=enemies=>({player:{pos:{x:0,z:0},facing:{x:0,z:1},hp:150,dodgeUntil:0},pistol:{equipped:true,magazine:6,reloadingUntil:0,nextFireAt:0},time:0,pistolUserFacing:{x:0,z:1},world:{areaId:'westminster',lineClear:()=>true},enemies});
const shot=g=>resolvePistolShot({position:g.player.pos,aim:g.pistolUserFacing,targets:g.enemies,lineClear:g.world.lineClear,areaId:g.world.areaId});
for(const [rig,radius,distance]of specs)test(`${rig}: actual body ray outside centre cone has the same cue as Fire`,()=>{
 const e=enemy(1,rig,radius,at(20,distance)),g=game([e]),before=JSON.stringify(g);
 assert.equal(selectCombatTarget({position:g.player.pos,aim:g.pistolUserFacing,targets:g.enemies,lineClear:g.world.lineClear,range:18,coneDegrees:12}),null);
 assert.equal(shot(g).targetId,e.id);assert.equal(pistolCue(g).targetId,e.id);assert.equal(JSON.stringify(g),before);
 g.mobileAiming=true;assert.equal(pistolCue(g).targetId,e.id);
 e.pos=at(90,distance);assert.equal(shot(g).targetId,null);assert.equal(pistolCue(g).targetId,null);
});
test('mixed cohort cue follows nearer physical body when aligned acquisition chooses farther actor',()=>{
 const near=enemy(1,'original-roach',1.59,at(35,1.99)),far=enemy(2,'hollow-scavenger',.4,at(0,6)),g=game([far,near]);
 assert.equal(shot(g).targetId,1);assert.equal(pistolCue(g).targetId,1);near.visible=false;assert.equal(pistolCue(g).targetId,null);
 near.visible=true;assert.equal(pistolCue(g,{visibleIds:[2]}).targetId,null);
});
test('body cue retains walls/area/visibility/death/range/readiness and pause boundaries',()=>{
 for(const mode of ['wall','area','hidden','dead','far','empty','cooldown','pause']){
  const e=enemy(1,'original-roach',1.59,at(20,1.99)),g=game([e]);
  if(mode==='wall')g.world.lineClear=(_a,b)=>b.z<.1;
  if(mode==='area')e.areaId='east';if(mode==='hidden')e.visible=false;if(mode==='dead')e.hp=0;if(mode==='far')e.pos=at(20,22);
  if(mode==='empty')g.pistol.magazine=0;if(mode==='cooldown')g.pistol.nextFireAt=2;
  const cue=pistolCue(g,{paused:mode==='pause'});
  if(mode==='pause')assert.equal(cue,null);else if(['empty','cooldown'].includes(mode)){assert.equal(cue.targetId,1);assert.equal(cue.ready,false);}else assert.equal(cue.targetId,null,mode);
 }
});
