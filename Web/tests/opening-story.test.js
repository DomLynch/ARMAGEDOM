import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{fixture}from'./helpers/rifle-fixture.js';
import{BOSS_EQUIPMENT_PROFILES as profiles}from'../src/engine/boss-equipment-data.js';
import{OPENING_STORY_SAVE_KEY as key}from'../src/engine/opening-story-core.js';
import{openingStoryPresentation as view}from'../src/engine/opening-story.js';
import{LOCKER_SAVE_KEY}from'../src/engine/locker-core.js';
import{createLockerModel,LOCKER_WEAPON_IDS,LOCKER_RESOURCE_RULES}from'../src/engine/locker-state.js';
import{stageProgressionDeath}from'../src/engine/progression-runtime.js';
import{issueSupply}from'../src/supplies.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url)));
const make=(records=new Map(),areaId='westminster')=>{const f=fixture({records,areaId,extraWorld:{bossEquipmentData:profiles,safehouseData:data.safehouse}});f.restore();assert(!f.g.runSaveInvalid);return f;};
const atComms=f=>{f.g.player.pos=f.world.geometry.ground(data.safehouse.props.find(p=>p.id==='comms').standing);};
test('fresh guest finds safehouse; actual comms commit reveals signal/fragment once, survives cold and Retry, Reset is fresh',()=>{
 const f=make();assert.equal(view(f.g).stage,'safehouse');assert.equal(view(f.g).target,'westminster');assert.match(view(f.g).opening,/survivor signal/);assert.equal(view(f.g).fragment,null);
 const before=f.records.get(key);assert(!f.p.dispatchStory(f.g,true).ok);assert.equal(f.records.get(key),before);atComms(f);
 assert(!f.p.dispatchStory(f.g,false).ok);f.quota(true);assert(!f.p.dispatchStory(f.g,true).ok);assert.equal(view(f.g).stage,'safehouse');assert.equal(f.records.get(key),before);f.quota(false);
 assert(f.p.dispatchStory(f.g,true).ok);assert.equal(view(f.g).stage,'matron');assert.match(view(f.g).signal,/SURVIVOR RECORD MATCHED/);assert.match(view(f.g).fragment,/come back from the East/);assert.equal(f.g.expedition.status,'available');
 const writes=f.writes.length;assert(f.p.dispatchStory(f.g,true).ok);assert.equal(f.writes.length,writes);const cold=make(f.records);assert.equal(view(cold.g).stage,'matron');assert(cold.p.retry());assert.equal(view(cold.g).stage,'matron');assert(cold.p.resetRun().ok);assert.equal(view(cold.g).stage,'safehouse');
});
test('verified Matron death before comms reveals intercepted message exactly once without claiming reward or forcing Journal',()=>{
 const f=make(),witch=f.g.enemies.find(e=>e.placementKey==='boss-witch-v1');assert(witch);witch.hp=0;
 assert.equal(view(f.g).intercepted,null);f.g.supplies=issueSupply(f.g.supplies,{areaId:'westminster',placementKey:witch.placementKey,position:witch.pos,hp:0,rules:f.g.lootRules,cycle:f.g.animalCycle}).state;
 stageProgressionDeath(f.g,witch,'knife',120);f.g.corpses.push(witch);const before=f.records.get(key);f.quota(true);assert(!f.p.persistRun(f.g));assert.equal(f.records.get(key),before);assert.equal(view(f.g).intercepted,null);assert(!f.g.events.some(e=>e.type==='story-message-recovered'));f.quota(false);assert(f.p.persistRun(f.g));
 assert.equal(view(f.g).stage,'enter');assert.equal(view(f.g).target,'east');assert.equal(view(f.g).intercepted,'If they sent you, they’ve already found us.');assert.equal(f.g.bossEquipment.emberProjector.status,'pending');assert(!f.g.openingStory.commsRead);assert.match(f.g.message,/Message recovered/);
 const events=f.g.events.filter(e=>e.type==='story-message-recovered').length;assert.equal(events,1);assert(f.p.persistRun(f.g));assert.equal(f.g.events.filter(e=>e.type==='story-message-recovered').length,events);
 const cold=make(f.records);assert.equal(view(cold.g).stage,'enter');assert.equal(cold.g.bossEquipment.emberProjector.status,'pending');assert(!cold.g.events.some(e=>e.type==='story-message-recovered'));atComms(cold);assert(cold.p.dispatchStory(cold.g,true).ok);assert.equal(view(cold.g).stage,'enter');
});
test('actual historical v12 migration preserves rewards/sidequest/locker and does not force veteran tutorial; malformed v13 never falls back',()=>{
 const seed=JSON.parse(fs.readFileSync(new URL('./fixtures/safehouse171-earned-v11.json',import.meta.url))),old=JSON.parse(seed.rawV11);old.version=12;old.locker=createLockerModel({weaponIds:LOCKER_WEAPON_IDS,resourceRules:LOCKER_RESOURCE_RULES}).freshState();const raw=JSON.stringify(old),records=new Map([[LOCKER_SAVE_KEY,raw]]),f=make(records);
 assert.equal(records.get(LOCKER_SAVE_KEY),raw);const saved=JSON.parse(records.get(key));assert.equal(saved.version,13);for(const field of ['expedition','bossEquipment','flameFuel','locker'])assert.deepEqual(saved[field],old[field]);assert.notEqual(view(f.g).stage,'safehouse');assert(f.writes.every(w=>w.key===key));
 records.set(key,'{"version":13,"openingStory":null}');const bad=fixture({records,areaId:'westminster',extraWorld:{bossEquipmentData:profiles,safehouseData:data.safehouse}});bad.restore();assert(bad.g.runSaveInvalid);assert.equal(records.get(key),'{"version":13,"openingStory":null}');assert.equal(records.get(LOCKER_SAVE_KEY),raw);
});
test('East arrival and previously visited East keep forward objective after return and preserve parallel contract',()=>{
 const f=make(new Map(),'east');assert.equal(view(f.g).stage,'trace');assert.equal(view(f.g).target,'east');assert.equal(f.g.expedition.status,'available');assert(f.p.persistRun(f.g));const cold=make(f.records);assert.equal(view(cold.g).stage,'trace');assert.equal(cold.g.expedition.status,'available');assert.match(view(cold.g).question,/Who sent the signal/);
});
