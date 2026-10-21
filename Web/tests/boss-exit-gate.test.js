import{HUB_SAVE_KEY}from'../src/engine/hub-core.js';
import{historicalSave}from'./helpers/historical-save-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bossExitGate,validateBossGeometry} from '../src/engine/area-bosses.js';
import {BOSS_EQUIPMENT_PROFILES as profiles} from '../src/engine/boss-equipment-data.js';
import {createUnlockRewardModel} from '../src/engine/unlock-reward-state.js';
import {createAreaRegistry,publicAreaRegistry as registry} from '../src/area-registry.js';
import {areaDefinitions} from '../src/area-definitions.js';
import {createGeometry} from '../src/world-geometry.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';
import {issueSupply} from '../src/supplies.js';
import {fixture} from './helpers/rifle-fixture.js';
import {createAreaLifecycle} from '../src/engine/areas.js';
import {journalPresentation} from '../src/engine/expedition-runtime.js';
import {LOCKER_SAVE_KEY} from '../src/engine/locker-core.js';
import {RIFLE_SAVE_KEY} from '../src/engine/rifle-core.js';

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const content=read('../public/world/area-content.json');
const make=records=>fixture({records,areaId:'westminster',extraWorld:{bossEquipmentData:profiles,safehouseData:content.safehouse}});
function stageWitch(f){
 const g=f.g,e=g.enemies.find(e=>e.placementKey==='boss-witch-v1');
 assert(e);e.hp=0;
 g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:e.placementKey,position:e.pos,hp:0,rules:g.lootRules,cycle:g.animalCycle}).state;
 stageProgressionDeath(g,e,'knife',e.maxHP);g.corpses.push(e);
}

test('only declared outward exit is gated; return and alternate routes retain their contract',()=>{
 const f=make();f.restore();assert.equal(bossExitGate(f.g,'east').allowed,false);
 assert.match(bossExitGate(f.g).message,/Defeat Ember Matron.*east exit/);
 assert.equal(bossExitGate(f.g,'south'),null);
 for(const area of registry.ids){const links=registry.links(area).filter(link=>link.requiresDefeat);assert.equal(links.length,['westminster','central-hub'].includes(area)?1:0);}
 assert.equal(registry.nextExit('south','east').to,'east');
 const malformed=structuredClone(areaDefinitions);malformed[0].exits[0].requiresDefeat=()=>true;
 assert.throws(()=>createAreaRegistry({areas:malformed}),/Area registry/);
});

test('actual current v17 Core keeps the exit locked through quota failure, opens on committed defeat before pickup, persists through cold restore and Retry',()=>{
 const f=make();f.restore();stageWitch(f);const before=JSON.stringify(f.g.bossEquipment);
 f.quota(true);assert.equal(f.p.persistRun(f.g),false);assert.equal(bossExitGate(f.g,'east').allowed,false);assert.equal(JSON.stringify(f.g.bossEquipment),before);
 f.quota(false);assert(f.p.persistRun(f.g));assert.equal(f.g.bossEquipment.emberProjector.status,'pending');assert.equal(bossExitGate(f.g,'east').allowed,true);
 const raw=f.records.get(HUB_SAVE_KEY);assert(raw);assert.equal(JSON.parse(raw).version,17);
 const cold=make(f.records);cold.restore();assert.equal(cold.g.runSaveInvalid,undefined);assert.equal(bossExitGate(cold.g,'east').allowed,true);assert.equal(cold.g.bossEquipment.emberProjector.status,'pending');
 assert(cold.p.retry());assert.equal(bossExitGate(cold.g,'east').allowed,true);assert.equal(cold.g.bossEquipment.emberProjector.status,'pending');
 assert.equal(cold.g.progression.awards.filter(row=>row.placementKey==='boss-witch-v1').length,0,'Retry keeps its existing progression policy');
 assert(cold.p.persistRun(cold.g));assert.equal(cold.g.bossEquipment.emberProjector.rewardReceipt,null,'gate never collects or grants the reward');
});

test('valid historical defeat and owned reward unlock without a new receipt; corrupt run stays closed',()=>{
 const f=make();f.restore();const p=profiles.emberProjector,model=createUnlockRewardModel({itemId:p.itemId,source:p.source});
 f.g.bossEquipment.emberProjector=model.restoreState(undefined,{sourceDead:true});assert.equal(bossExitGate(f.g,'east').allowed,true);assert.equal(f.g.bossEquipment.emberProjector.rewardReceipt,null);
 let state=model.transition(model.freshState(),{type:'drop',placementKey:p.source.placementKey,areaId:p.source.areaId,position:{x:18,z:8}});state=model.transition(state,{type:'pickup'});f.g.bossEquipment.emberProjector=state;assert.equal(bossExitGate(f.g,'east').allowed,true);
 f.g.runSaveInvalid=true;assert.equal(bossExitGate(f.g,'east').allowed,false);
});

test('actual historical v9 defeated save migrates through existing Core to legacy-dead without granting a reward',()=>{
 const old=make();old.restore();stageWitch(old);assert(old.p.persistRun(old.g));
 const saved=historicalSave(JSON.parse(old.records.get(HUB_SAVE_KEY)),9);
 const raw=JSON.stringify(saved),records=new Map([[RIFLE_SAVE_KEY,raw]]),f=make(records);f.restore();
 assert(!f.g.runSaveInvalid);assert.equal(f.g.bossEquipment.emberProjector.status,'legacy-dead');assert.equal(bossExitGate(f.g,'east').allowed,true);
 assert.equal(f.g.bossEquipment.emberProjector.rewardReceipt,null);assert.equal(records.get(RIFLE_SAVE_KEY),raw);
 const invalid=JSON.parse(records.get(HUB_SAVE_KEY));invalid.bossEquipment.emberProjector.status='invented';const bad=make(new Map([[HUB_SAVE_KEY,JSON.stringify(invalid)]]));bad.restore();assert.equal(bad.g.runSaveInvalid,true);assert.equal(bossExitGate(bad.g,'east').allowed,false);
});

test('blocked lifecycle activation cannot begin loading, and Journal retains the optional contract beside the gate cue',async()=>{
 const f=make();f.restore();let loads=0;f.world.loadArea=async()=>{loads++;throw Error('must not load');};
 const lifecycle=createAreaLifecycle({game:f.g,world:f.world});assert.equal(await lifecycle.activate({areaId:'east'}),false);assert.equal(loads,0);assert.match(f.g.message,/Ember Matron/);
 f.world.travelAt=()=>({areaId:'east'});assert.equal(lifecycle.checkExit(),false);assert.equal(lifecycle.checkExit(),false);assert.equal(loads,0);
 const presentation=journalPresentation(f.g,f.world.expeditionData);assert.match(presentation.next,/Ember Matron/);assert.match(presentation.next,/Optional/);
});

test('actual relocated Witch remains on clear East approach, outside travel triggers and safe return arrival',()=>{
 const g=createGeometry(read('../public/world/westminster/layout.json')),row=content.bosses.placements.find(row=>row.key==='boss-witch-v1');
 assert(Math.abs(g.point(row.pos).x-.835)<1e-9);assert(Math.abs(g.point(row.pos).y-.545)<1e-9);
 assert(g.clear(row.pos,.4));validateBossGeometry(content.bosses,'westminster',g,registry);
 const returning=g.ground(registry.links('east').find(l=>l.to==='westminster').entry),profile=content.bosses.profiles[row.profileRef];
 assert(Math.hypot(returning.x-row.pos.x,returning.z-row.pos.z)>profile.homeLeash+.8);
 const point=g.point(row.pos);assert(!registry.links('westminster').some(l=>Object.entries(l.condition).every(([key,v])=>key==='xMin'?point.x>v:key==='xMax'?point.x<v:key==='yMin'?point.y>v:point.y<v)));
});
