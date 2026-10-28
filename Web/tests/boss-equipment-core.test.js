import{HUB_SAVE_KEY}from'../src/engine/hub-core.js';
import{selectedFlameProfile}from'../src/engine/boss-equipment-data.js';
import{selectedPistolProfile}from'../src/engine/expedition-core.js';
import{KNIFE_MOVES}from'../src/donor/knife.js';
import fs from'node:fs';
import{RIFLE_SAVE_KEY}from'../src/engine/rifle-core.js';
import{FLAME_SAVE_KEY}from'../src/engine/flame-core.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/rifle-fixture.js';
import {BOSS_EQUIPMENT_PROFILES as profiles} from '../src/engine/boss-equipment-data.js';
import {BOSS_EQUIPMENT_SAVE_KEY as key} from '../src/engine/boss-equipment-core.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';
import {issueSupply} from '../src/supplies.js';
const make=options=>fixture({extraWorld:{bossEquipmentData:profiles},...options});
// Exact-fuel assertions run with the save-coalescing window off; the 1 s window is covered by flame-save-coalesce.test.js.
const exact=options=>fixture({extraWorld:{bossEquipmentData:{...profiles,emberProjector:{...profiles.emberProjector,rules:{...profiles.emberProjector.rules,saveCoalesceSeconds:0}}}},...options});
function kill(f,field){const g=f.g,data=profiles[field],e=g.enemies.find(e=>e.placementKey===data.source.placementKey);assert(e);e.hp=0;g.supplies=issueSupply(g.supplies,{areaId:f.world.areaId,placementKey:e.placementKey,position:e.pos,hp:0,rules:g.lootRules,cycle:g.animalCycle}).state;stageProgressionDeath(g,e,'knife',e.maxHP);g.corpses.push(e);assert(f.p.persistRun(g));assert.equal(g.bossEquipment[field].status,'pending');g.player.pos={...g.bossEquipment[field].dropPosition};}
const equip=(f,field,equipped=true)=>f.p.dispatchBossEquipment(f.g,{type:'equip',itemId:profiles[field].itemId,equipped},true);
const pickup=(f,field)=>f.p.dispatchBossEquipment(f.g,{type:'claimPickup',pickupId:profiles[field].itemId},true);
test('actual Core IO source death/manual pickup/selection/finite ammo, quota rollback and cold restore',()=>{
 const f=make({areaId:'south'});f.restore();kill(f,'shotgun');assert(pickup(f,'shotgun').ok);assert.equal(f.g.bossEquipment.shotgun.selected,false);assert(equip(f,'shotgun').ok);assert.equal(f.g.player.weapon,'shotgun');assert.equal(f.g.bossEquipment.shotgun.magazine,2);const before=f.records.get(HUB_SAVE_KEY);
 f.quota(true);assert.equal(f.p.dispatchBossEquipment(f.g,{type:'fire',field:'shotgun'},true).ok,false);assert.equal(f.g.bossEquipment.shotgun.magazine,2);assert.equal(f.records.get(HUB_SAVE_KEY),before);f.quota(false);assert(f.p.dispatchBossEquipment(f.g,{type:'fire',field:'shotgun'},true).ok);assert.equal(f.g.bossEquipment.shotgun.magazine,1);
 const cold=make({areaId:'south',records:f.records});cold.restore();assert.equal(cold.g.player.weapon,'shotgun');assert.deepEqual(cold.g.bossEquipment,f.g.bossEquipment);assert.equal(cold.g.rifle.selected,false);assert(cold.writes.every(w=>w.key===HUB_SAVE_KEY));
});
test('grenade once-only charges and present corrupt envelope never falls back to old records',()=>{
 const f=make({areaId:'area7'});f.restore();kill(f,'grenade');assert(pickup(f,'grenade').ok);assert.equal(pickup(f,'grenade').ok,false);assert(equip(f,'grenade').ok);assert(f.p.dispatchBossEquipment(f.g,{type:'fire',field:'grenade'},true).ok);assert.equal(f.g.bossEquipment.grenade.magazine,2);
 f.records.delete(HUB_SAVE_KEY);f.records.set(key,'{"version":10,"bossEquipment":null}');const raw=f.records.get(key),cold=make({records:f.records});cold.restore();assert.equal(cold.g.runSaveInvalid,true);assert.equal(f.records.get(key),raw);assert.equal(cold.writes.length,0);
});

test('genuine166 earned Rifle migrates read-only, new Shotgun selection clears it and Retry retains empty ammo',()=>{
 const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/rifle166-earned-v9.json',import.meta.url))),records=new Map([[RIFLE_SAVE_KEY,receipt.rawV9],[FLAME_SAVE_KEY,receipt.rawV8]]),f=make({areaId:'south',records});f.restore();assert.equal(f.g.rifle.selected,true);assert.equal(f.g.rifle.magazine,8);assert.equal(f.g.bossEquipment.shotgun.status,'eligible');
 assert(f.p.dispatchRifle(f.g,{type:'equip',itemId:'bridge-warden-rifle-v1',equipped:false},true).ok);kill(f,'shotgun');assert(pickup(f,'shotgun').ok);assert(f.p.dispatchRifle(f.g,{type:'equip',itemId:'bridge-warden-rifle-v1',equipped:true},true).ok);assert(equip(f,'shotgun').ok);assert.equal(f.g.rifle.selected,false);assert.equal(f.g.player.weapon,'shotgun');
 assert(f.p.dispatchBossEquipment(f.g,{type:'fire',field:'shotgun'},true).ok);f.g.time+=1;f.g.tick+=60;assert(f.p.dispatchBossEquipment(f.g,{type:'fire',field:'shotgun'},true).ok);assert.equal(f.g.bossEquipment.shotgun.magazine,0);assert(f.p.retry());assert.equal(f.g.player.weapon,'shotgun');assert.equal(f.g.bossEquipment.shotgun.magazine,0);assert.equal(f.g.bossEquipment.shotgun.reserve,12);assert.equal(records.get(RIFLE_SAVE_KEY),receipt.rawV9);assert.equal(records.get(FLAME_SAVE_KEY),receipt.rawV8);assert(f.writes.every(w=>w.key===HUB_SAVE_KEY));
 assert(f.p.resetRun().ok);const reset=JSON.parse(records.get(HUB_SAVE_KEY));assert.equal(reset.bossEquipment.shotgun.status,'eligible');assert.equal(reset.bossEquipment.shotgun.magazine,0);assert.equal(reset.bossEquipment.shotgun.selected,false);assert.equal(f.g.player.weapon,'knife');
});

test('actual Surgeon unlock keeps Knife geometry/timing and exposes only the frozen damage/stamina variant',()=>{
 const f=make({areaId:'lambeth'});f.restore();kill(f,'surgicalKnife');assert(pickup(f,'surgicalKnife').ok);assert.equal(f.g.bossEquipment.surgicalKnife.selected,false);assert(equip(f,'surgicalKnife').ok);assert.equal(f.g.player.weapon,'knife');assert.equal(f.g.player.meleeVariantId,'surgeons-knife-v1');assert.equal(f.g.player.meleeMoves.thrust.damage,16);assert.equal(f.g.player.meleeMoves.light_right.damage,12);for(const id of ['light_right','thrust','heavy_overhead'])for(const field of ['clip','windupTicks','activeTicks','recoveryTicks','range'])assert.equal(f.g.player.meleeMoves[id][field],KNIFE_MOVES[id][field]);assert.equal(f.g.player.contactPaths,null);assert(!Object.hasOwn(f.g.bossEquipment.surgicalKnife,'magazine'));
 const cold=make({areaId:'lambeth',records:f.records});cold.restore();assert.equal(cold.g.player.meleeVariantId,'surgeons-knife-v1');assert(cold.g.bossEquipment.surgicalKnife.selected);assert(cold.p.dispatchUniqueReward(cold.g,{type:'equip',itemId:'knife',equipped:true},true).ok);assert.equal(cold.g.bossEquipment.surgicalKnife.selected,false);assert.equal(cold.g.player.meleeVariantId,'knife');
});
test('actual Marshal unlock/selection/restore owns independent Railgun ammo without Pistol pickup refill',()=>{
 const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/rifle166-earned-v9.json',import.meta.url))),f=make({areaId:'area8',records:new Map([[RIFLE_SAVE_KEY,receipt.rawV9],[FLAME_SAVE_KEY,receipt.rawV8]])});f.restore();assert(f.p.dispatchRifle(f.g,{type:'equip',itemId:'bridge-warden-rifle-v1',equipped:false},true).ok);const before={magazine:f.g.pistol.magazine,reserve:f.g.pistol.reserve};kill(f,'commanderPistol');assert(pickup(f,'commanderPistol').ok);assert.equal(f.g.bossEquipment.commanderPistol.selected,false);assert.deepEqual({magazine:f.g.pistol.magazine,reserve:f.g.pistol.reserve},before);assert(equip(f,'commanderPistol').ok);assert.equal(f.g.player.weapon,'railgun');assert(!f.g.pistol.equipped);assert.equal(selectedPistolProfile(f.g).damage,25);assert.deepEqual([f.g.bossEquipment.commanderPistol.magazine,f.g.bossEquipment.commanderPistol.reserve],[40,120]);assert.deepEqual({magazine:f.g.pistol.magazine,reserve:f.g.pistol.reserve},before);assert(Object.hasOwn(f.g.bossEquipment.commanderPistol,'magazine'));assert(f.p.persistRun(f.g));assert(f.g.bossEquipment.commanderPistol.selected);
 const cold=make({areaId:'area8',records:f.records});cold.restore();assert(cold.g.bossEquipment.commanderPistol.selected);assert.equal(selectedPistolProfile(cold.g).damage,25);assert.deepEqual({magazine:cold.g.pistol.magazine,reserve:cold.g.pistol.reserve},before);
 assert(cold.p.dispatchExpedition(cold.g,{type:'selectVariant',variantId:'westminster-start-pistol-v1'},true).ok);assert.equal(cold.g.bossEquipment.commanderPistol.selected,false);assert.equal(selectedPistolProfile(cold.g).damage,25);
});

test('West earned Ember claim grants shared fuel once atomically; selected10units/s and damage10, Retry/cold never refill',()=>{
 const f=exact({areaId:'westminster'});f.restore();f.g.flameFuel={version:1,collected:true,fuelUnits:123};assert(f.p.persistRun(f.g));kill(f,'emberProjector');f.quota(true);assert.equal(pickup(f,'emberProjector').ok,false);assert.equal(f.g.flameFuel.fuelUnits,123);assert.equal(f.g.bossEquipment.emberProjector.status,'pending');f.quota(false);assert(pickup(f,'emberProjector').ok);assert.equal(f.g.flameFuel.fuelUnits,1000);assert.equal(f.g.bossEquipment.emberProjector.selected,false);assert.equal(f.g.flame.equipped,false);assert.equal(pickup(f,'emberProjector').ok,false);assert(equip(f,'emberProjector').ok);assert.equal(selectedFlameProfile(f.g).contact.damage,10);assert.equal(selectedFlameProfile(f.g).unitsPerSecond,10);
 for(let i=0;i<60;i++){f.g.tick++;f.g.time+=1/60;const result=f.p.dispatchFlame(f.g,{type:'save'},{seconds:1/60,active:true},true);assert(result.ok);const paid=result.events.find(e=>e.type==='flame-fuel-spent');assert(Math.abs(paid.activeSeconds-1/60)<1e-10);}assert(Math.abs(f.g.flameFuel.fuelUnits-990)<1e-7);assert(f.p.retry());assert(f.g.bossEquipment.emberProjector.selected);assert(f.g.flame.equipped);assert(Math.abs(f.g.flameFuel.fuelUnits-990)<1e-7);const cold=exact({areaId:'westminster',records:f.records});cold.restore();assert(cold.g.flame.equipped);assert(cold.g.bossEquipment.emberProjector.selected);assert(Math.abs(cold.g.flameFuel.fuelUnits-990)<1e-7);
 assert(cold.p.dispatchBossEquipment(cold.g,{type:'equip',itemId:profiles.emberProjector.itemId,equipped:false},true).ok);assert.equal(cold.g.flame.equipped,false);assert.equal(selectedFlameProfile(cold.g).contact.damage,10);assert.equal(selectedFlameProfile(cold.g).unitsPerSecond,10);assert(Math.abs(cold.g.flameFuel.fuelUnits-990)<1e-7);
});
