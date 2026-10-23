import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';import {issueSupply} from '../src/supplies.js';
import {createBossEquipmentView} from '../src/engine/boss-equipment-view.js';
const raw=JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url))),registry=fixture().world.registry,data=validateAreaMetadata(raw,registry),extraWorld={bossEquipmentData:data.bossEquipmentData,safehouseData:data.safehouseData,reaperData:data.reaperData,markedData:data.markedData},key='armagedom:marked-run:v18',notice='Ember Projector dropped. Approach to collect.';
function fresh(records=new Map(),areaId='westminster'){const f=fixture({records,areaId,extraWorld});f.restore();return f;}
// Reuse the existing reward test's genuine Core/death-intent path. This is a
// controlled component fixture, not a claim of earning another browser kill.
function death(f,field='emberProjector'){
 const g=f.g,profile=data.bossEquipmentData[field],e=g.enemies.find(e=>e.placementKey===profile.source.placementKey);assert(e);e.hp=0;
 g.supplies=issueSupply(g.supplies,{areaId:f.world.areaId,placementKey:e.placementKey,position:e.pos,hp:0,rules:g.lootRules,cycle:g.animalCycle}).state;stageProgressionDeath(g,e,'knife',e.maxHP);g.corpses.push(e);
}
test('actual committed Witch drop names the weapon once without collecting, equipping or granting fuel',()=>{
 const f=fresh(),g=f.g,fuel=structuredClone(g.flameFuel);g.message='before';death(f);assert.notEqual(g.message,notice);assert(f.p.persistRun(g));assert.equal(g.message,notice);assert.equal(g.messageUntil,g.time+4);assert.equal(g.bossEquipment.emberProjector.status,'pending');assert.deepEqual(g.flameFuel,fuel);assert.equal(g.flame.equipped,false);
 const event=g.events.find(e=>e.type==='boss-equipment-drop');assert.equal(event.itemId,'ember-flamethrower-v1');assert.equal(JSON.parse(f.records.get(key)).bossEquipment.emberProjector.status,'pending');
 const until=g.messageUntil;g.time+=1;assert(f.p.persistRun(g));assert.equal(g.messageUntil,until,'ordinary save ticks never refresh the toast');g.message='other message';assert(f.p.persistRun(g));assert.equal(g.message,'other message');
});
test('failed reward persistence never announces an uncommitted drop; successful retry announces exactly once',()=>{
 const f=fresh(),g=f.g;death(f);f.quota(true);assert.equal(f.p.persistRun(g),false);assert.notEqual(g.message,notice);assert.equal(g.bossEquipment.emberProjector.status,'eligible');f.quota(false);assert(f.p.persistRun(g));assert.equal(g.message,notice);assert.equal(g.bossEquipment.emberProjector.status,'pending');g.message='later';assert(f.p.persistRun(g));assert.equal(g.message,'later');
});
test('strict v18 pending restore does not retoast, existing nearby Collect disappears after its once-only normal claim and owned restore',()=>{
 const source=fresh();death(source);assert(source.p.persistRun(source.g));const f=fresh(new Map(source.records)),g=f.g;assert(!g.runSaveInvalid);assert.equal(g.bossEquipment.emberProjector.status,'pending');assert.notEqual(g.message,notice);
 const old=globalThis.document;globalThis.document={getElementById:()=>({})};const s={game:g,loaded:true,paused:false,actors:{equipmentReady:()=>true},input:{clear(){}}},view=createBossEquipmentView(s,f.p.dispatchBossEquipment);
 try{assert.deepEqual(view.interaction(),[],'restoring pending does not allow remote collection');g.player.pos={...g.bossEquipment.emberProjector.dropPosition};const item=view.interaction().find(x=>x.id==='ember-flamethrower-v1');assert.equal(item.label,'Collect Ember Projector');assert(item.run());assert.equal(g.bossEquipment.emberProjector.status,'owned');assert.deepEqual(view.interaction(),[]);assert.equal(g.flameFuel.fuelUnits,1000);assert.equal(g.flame.equipped,false);assert.notEqual(g.message,notice);
  const owned=fresh(new Map(f.records));assert.equal(owned.g.bossEquipment.emberProjector.status,'owned');assert.equal(owned.g.flameFuel.fuelUnits,1000);assert.notEqual(owned.g.message,notice);assert.equal(owned.g.runSaveInvalid,undefined);
 }finally{view.dispose();globalThis.document=old;}
});
test('other registered boss drop feedback is unchanged',()=>{const f=fresh(new Map(),'south');f.g.message='existing boss feedback';death(f,'shotgun');assert(f.p.persistRun(f.g));assert.equal(f.g.bossEquipment.shotgun.status,'pending');assert.equal(f.g.message,'existing boss feedback');});
