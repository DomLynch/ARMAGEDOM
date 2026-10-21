import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';
import {createGeometry} from '../src/world-geometry.js';
import {RAILGUN_SAVE_KEY} from '../src/engine/railgun-core.js';
import {HUB_SAVE_KEY} from '../src/engine/hub-core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),seed=fs.readFileSync(new URL('./fixtures/hub195-source194-v16.json',import.meta.url),'utf8'),data=validateAreaMetadata(read('../public/world/area-content.json'),registry);
function make(records=new Map([[RAILGUN_SAVE_KEY,seed]]),restore=true){const f=fixture({areaId:'westminster',records,extraWorld:{bossEquipmentData:data.bossEquipmentData,safehouseData:data.safehouseData,reaperData:data.reaperData}});if(restore)f.restore();return f;}
function hub(f){const w=f.world;w.areaId='central-hub';w.geometry=createGeometry(read('../public/world/central-hub/layout.json'));w.lineClear=(a,b)=>w.geometry.lineClear(a,b);f.g.player.pos=w.geometry.ground({x:.5,y:.46});}
test('actual Core migrates genuine194 v16 once into passive17, with no resource or selection conversion and no old-key writes',()=>{
 const f=make();assert(!f.g.runSaveInvalid);const expected={...JSON.parse(seed),version:17};assert.deepEqual(JSON.parse(f.records.get(HUB_SAVE_KEY)),expected);assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);assert(f.writes.length>0&&f.writes.every(w=>w.key===HUB_SAVE_KEY));assert.equal(f.g.player.hp,72);assert.deepEqual([f.g.bossEquipment.commanderPistol.magazine,f.g.bossEquipment.commanderPistol.reserve],[1,2]);
});
test('new hub visit and Storage persist only17; cold17 keeps ninth ID while original16 remains byte-exact and free of hub ID',()=>{
 const f=make();hub(f);assert(f.p.persistRun(f.g));assert(f.g.expedition.visitedIds.includes('central-hub'));assert(f.p.dispatchLocker(f.g,{type:'depositSupply',resource:'pistol-reserve',amount:1},true).ok);const cold=make(f.records);assert(!cold.g.runSaveInvalid);assert(cold.g.expedition.visitedIds.includes('central-hub'));assert.equal(cold.g.pistol.reserve,9);assert.equal(cold.g.locker.ammo['pistol-reserve'],1);assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);assert(!JSON.parse(f.records.get(RAILGUN_SAVE_KEY)).expedition.visitedIds.includes('central-hub'));assert(f.writes.every(w=>w.key===HUB_SAVE_KEY));
});
test('corrupt, unknown-field, old-version and future occupied17 never fall back to intact16 or rewrite either original',()=>{
 const valid=JSON.parse(make().records.get(HUB_SAVE_KEY));
 for(const raw of ['null','{','{}',seed,JSON.stringify({...valid,version:18}),JSON.stringify({...valid,extra:true}),JSON.stringify({...valid,expedition:{...valid.expedition,visitedIds:['unknown-area']}})]){
  const records=new Map([[RAILGUN_SAVE_KEY,seed],[HUB_SAVE_KEY,raw]]),f=make(records);assert(f.g.runSaveInvalid);assert.equal(records.get(RAILGUN_SAVE_KEY),seed);assert.equal(records.get(HUB_SAVE_KEY),raw);assert.equal(f.writes.length,0);assert(!f.p.persistRun(f.g));
 }
});
test('quota during migration retains restored resources and original16, and later successful save creates17 without remigration',()=>{
 const f=make(undefined,false);f.quota(true);f.restore();assert(!f.g.runSaveInvalid);assert.equal(f.records.has(HUB_SAVE_KEY),false);assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);assert.equal(f.g.player.hp,72);assert.equal(f.g.pistol.reserve,10);assert.equal(f.g.bossEquipment.commanderPistol.reserve,2);f.quota(false);assert(f.p.persistRun(f.g));assert.equal(JSON.parse(f.records.get(HUB_SAVE_KEY)).version,17);assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);
});
test('one real Core-paid Railgun round and repeated17 cold restores never reload stock from preserved16',()=>{
 const f=make();assert(f.p.dispatchBossEquipment(f.g,{type:'fire',field:'commanderPistol'},true).ok);assert.equal(f.g.bossEquipment.commanderPistol.magazine,0);let latest=f;
 for(let i=0;i<3;i++){latest=make(f.records);assert(!latest.g.runSaveInvalid);assert.deepEqual([latest.g.bossEquipment.commanderPistol.magazine,latest.g.bossEquipment.commanderPistol.reserve],[0,2]);assert.equal(latest.g.player.hp,72);assert.equal(latest.g.pistol.reserve,10);}
 assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);assert.equal(JSON.parse(f.records.get(RAILGUN_SAVE_KEY)).bossEquipment.commanderPistol.magazine,1);
});
test('failed17 Storage command preserves both raw keys and current resources',()=>{
 const f=make();hub(f);assert(f.p.persistRun(f.g));const raw=f.records.get(HUB_SAVE_KEY);f.quota(true);assert(!f.p.dispatchLocker(f.g,{type:'depositSupply',resource:'pistol-reserve',amount:1},true).ok);assert.equal(f.g.pistol.reserve,10);assert.equal(f.g.locker.ammo['pistol-reserve'],0);assert.equal(f.records.get(HUB_SAVE_KEY),raw);assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);
});
