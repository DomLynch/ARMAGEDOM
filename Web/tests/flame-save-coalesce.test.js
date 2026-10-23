import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/rifle-fixture.js';
import {BOSS_EQUIPMENT_PROFILES as profiles} from '../src/engine/boss-equipment-data.js';
import {selectedFlameProfile} from '../src/engine/boss-equipment-data.js';
import {HUB_SAVE_KEY} from '../src/engine/hub-core.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';
import {issueSupply} from '../src/supplies.js';
const make=options=>fixture({extraWorld:{bossEquipmentData:profiles},areaId:'westminster',...options});
const field='emberProjector';
function armed(){const f=make();f.restore();const g=f.g,data=profiles[field],e=g.enemies.find(e=>e.placementKey===data.source.placementKey);e.hp=0;
 g.supplies=issueSupply(g.supplies,{areaId:f.world.areaId,placementKey:e.placementKey,position:e.pos,hp:0,rules:g.lootRules,cycle:g.animalCycle}).state;stageProgressionDeath(g,e,'knife',e.maxHP);g.corpses.push(e);assert(f.p.persistRun(g));
 g.player.pos={...g.bossEquipment[field].dropPosition};assert(f.p.dispatchBossEquipment(g,{type:'claimPickup',pickupId:data.itemId},true).ok);assert(f.p.dispatchBossEquipment(g,{type:'equip',itemId:data.itemId,equipped:true},true).ok);return f;}
const fire=f=>{f.g.tick++;f.g.time+=1/60;const r=f.p.dispatchFlame(f.g,{type:'save'},{seconds:1/60,active:true},true);assert(r.ok);return r;};
const stored=f=>JSON.parse(f.records.get(HUB_SAVE_KEY)).flameFuel.fuelUnits;
test('the window is flame data, not a constant in code',()=>{assert.equal(profiles[field].rules.saveCoalesceSeconds,1);assert.equal(selectedFlameProfile(armed().g).saveCoalesceSeconds,1);});
test('firing for 3 s writes about 3 times, not once per tick',()=>{
 const f=armed(),before=f.writes.length,fuel0=f.g.flameFuel.fuelUnits;for(let i=0;i<180;i++)fire(f);
 const writes=f.writes.length-before;assert(writes>=2&&writes<=5,'expected about 3 writes, got '+writes);
 assert(Math.abs(f.g.flameFuel.fuelUnits-(fuel0-30))<1e-6,'in-memory fuel spending is unchanged');
});
test('a reload after a coalesced write restores at least the saved fuel, at most one second stale',()=>{
 const f=armed();for(let i=0;i<100;i++)fire(f);const live=f.g.flameFuel.fuelUnits,disk=stored(f);
 assert(disk>=live-1e-9&&disk-live<=10+1e-6,`disk ${disk} vs live ${live}`);
 const cold=make({records:f.records});cold.restore();assert(!cold.g.runSaveInvalid);assert.equal(cold.g.flameFuel.fuelUnits,disk);
});
test('running the tank empty forces a write of zero fuel',()=>{
 const f=armed();f.g.flameFuel={version:1,collected:true,fuelUnits:1.5};assert(f.p.persistRun(f.g));let empty=false;
 for(let i=0;i<60&&!empty;i++)empty=!!fire(f).events.find(e=>e.type==='flame-fuel-spent')?.empty;
 assert(empty);assert.equal(f.g.flameFuel.fuelUnits,0);assert.equal(stored(f),0);
});
test('damage taken inside the window still writes',()=>{
 const f=armed();fire(f);fire(f);const before=f.writes.length;f.g.player.hp-=5;fire(f);assert(f.writes.length>before,'other state change writes');
});
