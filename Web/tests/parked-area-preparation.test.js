import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, initializeAreaResidents} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
import {prepareParkedResidents} from '../src/parked-area-preparation.js';

function fixture(cycle='A') {
  const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},
    move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,
    async loadArea(areaId){this.areaId=areaId;return {x:0,z:0};}};
  const game=createGame(world,{pilot:'donor-knife',areaResidents:true,openingGroup:false,
    encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}},
    rat:true,dog:true,roach:true,drone:true,animalVariants:true,animalCycle:cycle,
    pistol:true,supplies:true,vest:true,finishers:true});
  game.time=12;
  return game;
}

for(const cycle of ['A','B'])test(`cycle ${cycle}: real factory runs once; live fight/resources untouched`,()=>{
  const game=fixture(cycle),live=JSON.stringify({...game,areaFights:null}),enemies=game.enemies;
  let calls=0;const factory=g=>{calls++;initializeAreaResidents(g);};
  const record=prepareParkedResidents(game,{...game.world,areaId:'east'},factory);
  assert.equal(record.enemies.length,13);
  assert.equal(record.parkedAt,12);
  assert.equal(new Set(record.enemies.map(e=>e.id)).size,13);
  assert.equal(new Set(record.enemies.map(e=>e.placementKey)).size,13);
  assert(record.enemies.every(e=>!e.alerted&&!e.swing));
  assert.equal(game.enemies,enemies);
  assert.equal(JSON.stringify({...game,areaFights:null}),live);
  assert.equal(prepareParkedResidents(game,{...game.world,areaId:'east'},factory),record);
  assert.equal(calls,1);
});

test('ordinary travel adopts prepared identities and shifts parked clocks; return does not recreate',async()=>{
  const game=fixture(),record=prepareParkedResidents(game,{...game.world,areaId:'south'},initializeAreaResidents);
  const npc=record.enemies[0],ready=npc.ready,ids=record.enemies.map(e=>e.id);
  game.time=20;await travelTo(game,{areaId:'south'});
  assert.equal(game.enemies,record.enemies);
  assert.equal(game.enemies[0],npc);
  assert.equal(npc.ready,ready+8);
  assert.deepEqual(game.enemies.map(e=>e.id),ids);
  await travelTo(game,{areaId:'westminster'});
  const parked=game.areaFights.south;
  assert.equal(prepareParkedResidents(game,{...game.world,areaId:'south'},()=>assert.fail('reinitialised')),parked);
});

test('failed or invalid preparation never installs partial roster or touches live state',()=>{
  const game=fixture(),before=JSON.stringify(game);
  assert.throws(()=>prepareParkedResidents(game,{...game.world,areaId:'east'},g=>{
    g.enemies.push({id:999});throw Error('preparation failed');
  }),/preparation failed/);
  assert.equal(JSON.stringify(game),before);
  assert.throws(()=>prepareParkedResidents(game,game.world,initializeAreaResidents),/another existing/);
  assert.throws(()=>prepareParkedResidents(game,{areaId:'new-area'},initializeAreaResidents),/another existing/);
  assert.equal(JSON.stringify(game),before);
});
