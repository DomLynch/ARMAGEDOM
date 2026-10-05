import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
import {AREA_MOB_SPAWNS,hollowLocomotionFor} from '../src/area-mob-spawns.js';
const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
function fresh(){const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6}}};return createGame(world,{pilot:'donor-knife',encounter,pistol:true,areaResidents:true,openingGroup:false});}
const selected=g=>g.enemies.filter(e=>hollowLocomotionFor(e)).map(e=>e.placementKey);
test('Crooked presentation selects a stable minority without changing resident data',async()=>{
 const g=fresh(),west=g.enemies.slice();
 assert.deepEqual(selected(g),['westminster-roamer-3','westminster-roamer-5']);
 for(const [area,count,keys] of [['westminster',6,['westminster-roamer-3','westminster-roamer-5']],['east',9,['east-roamer-3','east-roamer-6']],['south',9,['south-roamer-4','south-roamer-7']]]){
  if(area!==g.world.areaId)await travelTo(g,{areaId:area});
  assert.equal(g.enemies.length,count);assert.deepEqual(selected(g),keys);
  assert.deepEqual(g.enemies.map(e=>({key:e.placementKey,pos:e.pos,patrol:e.patrol,hp:e.hp})),AREA_MOB_SPAWNS[area].map(p=>({key:p.key,pos:p.pos,patrol:p.patrol,hp:40})));
 }
 await travelTo(g,{areaId:'westminster'});assert.ok(g.enemies.every((e,i)=>e===west[i]));
 assert.deepEqual(selected(g),selected(fresh()));
 const e=west[2],before=structuredClone(e);hollowLocomotionFor(e);assert.deepEqual(e,before);
 assert.equal(hollowLocomotionFor({...e,id:900}), 'crooked-hollow');
});
test('player, ordinary Hollows, legacy opening enemies and other rigs stay ordinary',()=>{
 const g=fresh();assert.equal(hollowLocomotionFor(g.player),null);
 assert.equal(hollowLocomotionFor(g.enemies[0]),null);
 assert.equal(hollowLocomotionFor({kind:0,rig:'hollow-scavenger',id:3}),null);
 assert.equal(hollowLocomotionFor({...g.enemies[2],rig:'goblin'}),null);
 assert.equal(hollowLocomotionFor({...g.enemies[2],kind:-1}),null);
});
