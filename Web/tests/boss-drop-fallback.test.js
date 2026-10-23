import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';import {issueSupply} from '../src/supplies.js';
import {needsUniqueDeathCommit} from '../src/engine/unique-reward-runtime.js';
const registry=fixture().world.registry,data=validateAreaMetadata(JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url))),registry),extraWorld={bossEquipmentData:data.bossEquipmentData,safehouseData:data.safehouseData,reaperData:data.reaperData,markedData:data.markedData};
function fresh(areaId='westminster'){const f=fixture({areaId,extraWorld});f.restore();return f;}
function death(f,field='emberProjector'){
 const g=f.g,profile=data.bossEquipmentData[field],e=g.enemies.find(e=>e.placementKey===profile.source.placementKey);assert(e);e.hp=0;
 g.supplies=issueSupply(g.supplies,{areaId:f.world.areaId,placementKey:e.placementKey,position:e.pos,hp:0,rules:g.lootRules,cycle:g.animalCycle}).state;stageProgressionDeath(g,e,'knife',e.maxHP);g.corpses.push(e);return e;
}
// A wall/exit pocket: nothing within the radius of the corpse is legal ground.
function walled(f,e,radius){const clear=f.world.geometry.clear.bind(f.world.geometry);f.world.geometry.clear=(p,r)=>Math.hypot(p.x-e.pos.x,p.z-e.pos.z)>radius&&clear(p,r);}
test('boss killed with no legal spot within 1 m still commits one reachable drop',()=>{
 const f=fresh(),e=death(f);walled(f,e,1.2);const g=f.g;
 assert(f.p.persistRun(g),'save must not be blocked');assert.equal(g.bossEquipment.emberProjector.status,'pending');
 const at=g.bossEquipment.emberProjector.dropPosition;assert(Math.hypot(at.x-e.pos.x,at.z-e.pos.z)>1.2);assert(f.world.geometry.clear(at,.4));
 assert.equal(g.events.filter(x=>x.type==='boss-equipment-drop').length,1);assert(f.p.persistRun(g));assert.equal(g.events.filter(x=>x.type==='boss-equipment-drop').length,1);
});
test('uncommitted boss kill after a storage failure blocks leaving until the drop is saved',()=>{
 const f=fresh(),g=f.g;death(f);f.quota(true);assert.equal(f.p.persistRun(g),false);
 assert.equal(needsUniqueDeathCommit(g),true,'area exit must stay locked while the boss drop is uncommitted');
 f.quota(false);assert(f.p.persistRun(g));assert.equal(g.bossEquipment.emberProjector.status,'pending');assert.equal(needsUniqueDeathCommit(g),false);
});
