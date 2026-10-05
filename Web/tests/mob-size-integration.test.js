import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,attack} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
import {allocateMobSizes} from '../src/mob-size-allocation.js';
import {hollowPaletteFor} from '../src/hollow-palette.js';
import {KNIFE_MOVES,KNIFE_RULES} from '../src/donor/knife.js';
import {pistolCue,selectCombatTarget} from '../src/pistol-targeting.js';
import {issueSupply} from '../src/supplies.js';
import {encodeRun,restoreRun,applySavedRun} from '../src/pistol-save.js';
function fixture(){
 const w={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
 return createGame(w,{pilot:'donor-knife',encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}},pistol:true,supplies:true,vest:true,areaResidents:true,openingGroup:false});
}
const identities=g=>new Map(g.enemies.map(e=>[e.placementKey,{size:e.mobSize,combatScale:e.combatScale,bodyScale:e.bodyScale,radius:e.radius,outfit:hollowPaletteFor(e,g.world.areaId)}]));
test('production resident factory applies one balanced absolute profile and preserves player/stats/clothing',()=>{
 const g=fixture(),sizes=allocateMobSizes('westminster',AREA_MOB_SPAWNS.westminster.map(r=>r.key));
 assert.equal(g.enemies.length,6);assert.equal(g.player.combatScale,1.265);assert.equal(g.player.radius,.4);assert.equal(g.player.mobSize,undefined);
 for(const e of g.enemies){assert.equal(e.mobSize,sizes.get(e.placementKey));assert.equal(e.combatScale,1.265*e.mobSize);assert.equal(e.radius,.4*e.mobSize);assert.equal(e.bodyScale,1);assert.equal(e.hp,40);assert.equal(e.moveSpeed,2.1);assert.equal(e.recoveryDelay,.55);assert.ok(hollowPaletteFor(e,'westminster'));}
 const again=fixture();assert.deepEqual(identities(again),identities(g));assert.notEqual(again.enemies[0].id,g.enemies[0].id);
});
test('normal DTO restore filters dead residents after complete size/clothing allocation without adding save fields',()=>{
 const g=fixture(),before=identities(g),key='westminster-roamer-3',dead=g.enemies.find(e=>e.placementKey===key);
 g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:key,position:dead.pos,hp:0}).state;
 const encoded=encodeRun(g);assert.equal(JSON.parse(encoded).version,2);assert.ok(!encoded.includes('mobSize'));
 const fresh=fixture(),saved=restoreRun(fresh,encoded);assert.ok(saved);applySavedRun(fresh,saved);assert.equal(fresh.enemies.length,5);
 for(const [key,value] of identities(fresh))assert.deepEqual(value,before.get(key));
});
test('parked actual domain area return preserves absolute sizes and outfits without reapplication',async()=>{
 const g=fixture(),west=identities(g);await travelTo(g,{areaId:'east'});assert.equal(g.enemies.length,9);const east=identities(g);await travelTo(g,{areaId:'south'});assert.equal(g.enemies.length,9);await travelTo(g,{areaId:'east'});assert.deepEqual(identities(g),east);await travelTo(g,{areaId:'westminster'});assert.deepEqual(identities(g),west);
});
test('actual player attack admits enlarged capsule boundary and rejects smaller, blocked and hidden targets',()=>{
 const def=KNIFE_MOVES.light_right,range=def.range*1.265+KNIFE_RULES.walkSpeed*def.stepIn*(def.windupTicks-KNIFE_RULES.stepInFrom-1)/60;
 for(const [key,expected] of [['westminster-roamer-1',true],['westminster-roamer-5',false]]){
  const g=fixture(),e=g.enemies.find(e=>e.placementKey===key);g.enemies=[e];g.player.pos={x:0,z:0};e.pos={x:0,z:-(range+.02)};assert.ok(attack(g,'slash'));assert.equal(g.player.facing.z<0,expected);assert.deepEqual(g.player.swing.dir,g.player.facing);assert.equal(g.player.swing.turnTo,undefined);assert.equal(g.player.combatScale,1.265);assert.equal(g.player.hp,150);assert.equal(g.player.radius,.4);
 }
 for(const mode of ['blocked','hidden']){const g=fixture(),e=g.enemies.find(e=>e.mobSize===1.15);g.enemies=[e];g.player.pos={x:0,z:0};e.pos={x:0,z:-(range+.02)};if(mode==='blocked')g.world.lineClear=()=>false;attack(g,'slash',undefined,mode==='hidden'?[]:undefined);assert.equal(g.player.swing.turnTo,undefined);assert.deepEqual(g.player.facing,{x:0,z:1});}
});
test('optional candidate reach preserves ranking/cone and rejects invalid offsets',()=>{
 const target={id:1,pos:{x:0,z:2.02},hp:40},args={position:{x:0,z:0},facing:{x:0,z:1},targets:[target],lineClear:()=>true,range:2};assert.equal(selectCombatTarget(args),null);assert.equal(selectCombatTarget({...args,rangeOffset:()=>.05}).targetId,1);
 for(const rangeOffset of [()=>NaN,()=>Infinity,()=>-3,{}])assert.equal(selectCombatTarget({...args,rangeOffset}),null);
 target.pos={x:2,z:0};assert.equal(selectCombatTarget({...args,rangeOffset:()=>.05}),null);
});
test('min/max target cue height varies once even when empty; absent target keeps free height',()=>{
 for(const factor of [.85,1,1.15]){const g=fixture(),e=g.enemies.find(e=>e.mobSize===factor);g.enemies=[e];e.pos={x:0,z:0};Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,reserve:12});const cue=pistolCue(g);assert.equal(cue.targetId,e.id);assert.equal(cue.height,1.15*factor);g.pistol.magazine=0;assert.equal(pistolCue(g).height,1.15*factor);assert.equal(pistolCue(g).targetId,e.id);assert.equal(pistolCue(g).ready,false);g.pistol.magazine=6;e.hp=0;assert.equal(pistolCue(g).height,1.05);}
});
