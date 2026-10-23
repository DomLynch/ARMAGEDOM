import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';import {issueSupply} from '../src/supplies.js';
import {createAreaLifecycle} from '../src/engine/areas.js';
import {needsUniqueDeathCommit,uniqueRewardDropPosition} from '../src/engine/unique-reward-runtime.js';
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
const dropEvents=g=>g.events.filter(x=>x.type==='boss-equipment-drop').length,awards=(g,key)=>g.progression.awards.filter(a=>a.placementKey===key).length;
test('far fallback is stored once, restores identically, and passes the real claim guard',()=>{
 const f=fresh(),e=death(f);walled(f,e,1.2);const g=f.g;assert(f.p.persistRun(g));const at={...g.bossEquipment.emberProjector.dropPosition};
 assert(f.p.persistRun(g));assert.deepEqual(g.bossEquipment.emberProjector.dropPosition,at,'position is never recomputed');
 const r=fixture({records:new Map(f.records),areaId:'westminster',extraWorld});r.restore();assert(!r.g.runSaveInvalid);assert.deepEqual(r.g.bossEquipment.emberProjector.dropPosition,at);
 assert.equal(r.g.bossEquipment.emberProjector.status,'pending');
 r.g.player.pos={x:at.x,z:at.z};assert(r.world.lineClear(r.g.player.pos,at));const claim=r.p.dispatchBossEquipment(r.g,{type:'claimPickup',pickupId:data.bossEquipmentData.emberProjector.itemId},true);assert(claim.ok,claim.code);assert.equal(r.g.bossEquipment.emberProjector.status,'owned');assert.equal(r.g.bossEquipment.emberProjector.dropPosition,null);
});
test('with no ground anywhere the save fails explicitly instead of storing an unreachable reward',()=>{
 const f=fresh(),g=f.g;death(f);f.world.geometry.clear=()=>false;
 assert.equal(f.p.persistRun(g),false);assert.match(g.message,/saving unavailable/i);assert.equal(g.bossEquipment.emberProjector.status,'eligible');assert.equal(dropEvents(g),0);
});
test('storage failure on the kill save then Retry leaves one drop, one award and one event after the next kill',()=>{
 const f=fresh(),key=data.bossEquipmentData.emberProjector.source.placementKey;let e=death(f);walled(f,e,1.2);f.quota(true);assert.equal(f.p.persistRun(f.g),false);f.quota(false);
 assert(f.p.retry());assert.equal(f.g.bossEquipment.emberProjector.status,'eligible');assert.equal(awards(f.g,key),0);assert.equal(dropEvents(f.g),0);
 e=death(f);walled(f,e,1.2);assert(f.p.persistRun(f.g));assert.equal(f.g.bossEquipment.emberProjector.status,'pending');assert.equal(awards(f.g,key),1);assert.equal(dropEvents(f.g),1);
 assert(f.p.persistRun(f.g));assert.equal(awards(f.g,key),1);assert.equal(dropEvents(f.g),1);
 const r=fixture({records:new Map(f.records),areaId:'westminster',extraWorld});r.restore();assert.equal(awards(r.g,key),1);assert.equal(r.g.bossEquipment.emberProjector.status,'pending');
});
test('legacy-dead boss with its corpse in the current area still gets its drop',()=>{
 const f=fresh(),g=f.g;g.bossEquipment={...g.bossEquipment,emberProjector:{...g.bossEquipment.emberProjector,status:'legacy-dead'}};const e=death(f);walled(f,e,1.2);
 assert(f.p.persistRun(g));assert.equal(g.bossEquipment.emberProjector.status,'pending');assert.equal(dropEvents(g),1);
});
test('persistent save failure at the exit gate shows the existing saving-unavailable message, not a silent block',()=>{
 const f=fresh(),g=f.g;death(f);f.quota(true);g.message='';assert.equal(f.p.persistRun(g),false);assert.match(g.message,/saving unavailable/i);assert(g.messageUntil>g.time);assert(needsUniqueDeathCommit(g));
});
test('area exit with failing storage is refused with the saving-unavailable notice, and Retry clears the lock',async()=>{
 const f=fresh(),g=f.g;death(f);f.quota(true);g.message='';
 const life=createAreaLifecycle({game:g,world:f.world,persistRun:x=>f.p.persistRun(x)});
 assert.equal(await life.activate({areaId:'south'}),false);assert.equal(f.world.areaId,'westminster');assert.match(g.message,/saving unavailable/i);assert(g.messageUntil>g.time);
 f.quota(false);assert(f.p.retry());assert.equal(needsUniqueDeathCommit(f.g),false,'Retry puts the boss back, so the lock is gone');
});
test('with only the area entry legal the drop lands there, in world metres, and the pickup model is placed at it',()=>{
 const f=fresh(),e=death(f),entry=f.world.geometry.ground(f.world.registry.get('westminster').entry);
 f.world.geometry.clear=(p)=>Math.hypot(p.x-entry.x,p.z-entry.z)<.1;
 assert(f.p.persistRun(f.g));const at=f.g.bossEquipment.emberProjector.dropPosition;assert(Number.isFinite(at.x)&&Number.isFinite(at.z));assert.deepEqual(at,{x:entry.x,z:entry.z});assert(Math.hypot(at.x-e.pos.x,at.z-e.pos.z)>6);
});
test('rifle source kill with failing storage also locks the area exit until it is saved',()=>{
 const f=fixture({areaId:'east-bridge'});f.restore();f.quota(true);assert.equal(f.kill(),false);assert.equal(needsUniqueDeathCommit(f.g),true);
 f.quota(false);assert(f.p.persistRun(f.g));assert.equal(f.g.rifle.status,'pending');assert.equal(needsUniqueDeathCommit(f.g),false);
});
test('rifle and cleaver sources use the same widened search at a wall',()=>{
 const rf=fixture({areaId:'east-bridge'});rf.restore();const boss=rf.g.enemies.find(e=>e.placementKey==='boss-warden-v1');boss.hp=0;
 const w=rf.world,clear=w.geometry.clear.bind(w.geometry);w.geometry.clear=(p,r)=>Math.hypot(p.x-boss.pos.x,p.z-boss.pos.z)>1.2&&clear(p,r);
 const at=uniqueRewardDropPosition(rf.g,boss,w.rifleData.source);assert(at&&Math.hypot(at.x-boss.pos.x,at.z-boss.pos.z)>1.2);
 const hale={pos:{...boss.pos},hp:0,placementKey:'east-roamer-2'};const far=uniqueRewardDropPosition(rf.g,hale,{areaId:w.areaId,placementKey:'east-roamer-2'});assert(far&&Math.hypot(far.x-boss.pos.x,far.z-boss.pos.z)>1.2);
});
