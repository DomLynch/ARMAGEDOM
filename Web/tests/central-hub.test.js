import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {createAreaRegistry} from '../src/area-registry.js';
import {areaDefinitions,areaAssets} from '../src/area-definitions.js';
import {validateAreaMetadata,validateAreaGeometry} from '../src/engine/area-content.js';
import {createGeometry} from '../src/world-geometry.js';
import {capsuleSegmentClear} from '../src/engine/route-guidance.js';
import {bossExitGate} from '../src/engine/area-bosses.js';
import {safehouseSite,safehouseProtected,safehouseInteraction,safehouseProp,safehouseBlocksSegment} from '../src/engine/safehouse.js';
import {createWorld} from '../src/world.js';
import {fixture} from './helpers/rifle-fixture.js';
import {receiveHit,stepGame} from '../src/combat.js';
import {HUB_SAVE_KEY} from '../src/engine/hub-core.js';
import {RAILGUN_SAVE_KEY} from '../src/engine/railgun-core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const manifest=read('../public/world/manifest.json'),raw=read('../public/world/area-content.json');
const registry=createAreaRegistry({manifest}),data=validateAreaMetadata(raw,registry),layout=id=>read('../public/world/'+id+'/layout.json');
const seed=fs.readFileSync(new URL('./fixtures/hub195-source194-v16.json',import.meta.url),'utf8');
const make=(records=new Map([[RAILGUN_SAVE_KEY,seed]]))=>{const f=fixture({areaId:'central-hub',records,extraWorld:{bossEquipmentData:data.bossEquipmentData,safehouseData:data.safehouseData,reaperData:data.reaperData}});f.restore();assert(!f.g.runSaveInvalid);return f;};

test('hub gates reject unvisited, absent authoritative boss reward, missing boss profiles and invalid save before allowing exits',()=>{
 const g={world:{areaId:'central-hub',registry,bossData:data.bossData,bossEquipmentData:data.bossEquipmentData},expedition:{visitedIds:[]},bossEquipment:{}};
 assert.equal(bossExitGate(g,'westminster'),null);
 for(const id of ['south','east','area7'])assert.equal(bossExitGate(g,id).allowed,false,id);
 g.expedition.visitedIds=['south','east','area7'];assert.equal(bossExitGate(g,'east').allowed,false);
 g.bossEquipment.emberProjector={status:'unseen'};assert.equal(bossExitGate(g,'east').allowed,false);
 g.bossEquipment.emberProjector={status:'owned'};g.world.bossEquipmentData={};assert.equal(bossExitGate(g,'east').allowed,false);
 g.world.bossEquipmentData=data.bossEquipmentData;g.runSaveInvalid=true;for(const id of ['south','east','area7'])assert.equal(bossExitGate(g,id).allowed,false);
 g.runSaveInvalid=false;for(const status of ['pending','owned','legacy-dead']){g.bossEquipment.emberProjector={status};for(const id of ['south','east','area7'])assert.equal(bossExitGate(g,id).allowed,true,id);}
 // Existing receipt aliases are validated by the sole Core codec, not invented here.
 g.expedition.visitedIds=[];assert.match(bossExitGate(g,'east').message,/Discover/);
 for(const id of ['westminster','south','east','area7']){g.world.areaId=id;assert.equal(bossExitGate(g,'central-hub'),null,'inbound return stays open');}
 g.world.areaId='westminster';g.bossEquipment.emberProjector={status:'unseen'};assert.equal(bossExitGate(g,'east').allowed,false,'original gate remains');
});

test('registry rejects forged visit predicates and manifest omission of a real gate',()=>{
 const areas=structuredClone(areaDefinitions);areas.at(-1).exits[1].requiresVisited='yes';assert.throws(()=>createAreaRegistry({areas}),/visit requirement/);
 const changed=structuredClone(manifest);delete changed.links.find(e=>e.from==='central-hub'&&e.to==='south').requiresVisited;assert.throws(()=>createAreaRegistry({manifest:changed}),/adjacency/);
});

test('all actual new mouth paths fit full player capsules, target arrivals are legal and never land in their return triggers',()=>{
 for(const id of registry.ids)assert.doesNotThrow(()=>validateAreaGeometry(registry,id,layout(id),data.residents,data.expedition,data.bossData,data.populationData,data.flameData,data.safehouseData));
 const hub=layout('central-hub'),g=createGeometry(hub);assert.equal(hub.guidance.length,3);
 for(const row of hub.guidance){const pts=row.path.map(g.ground);for(const p of pts)assert(g.clear(p,.4));for(let i=1;i<pts.length;i++)assert(capsuleSegmentClear(g,pts[i-1],pts[i]),row.to);}
 for(const link of registry.links('central-hub')){const dest=createGeometry(layout(link.to));assert(dest.clear(dest.ground(link.entry),.4));const back=registry.links(link.to).find(e=>e.to==='central-hub');assert(!Object.entries(back.condition).every(([k,v])=>k==='xMin'?link.entry.x>v:k==='xMax'?link.entry.x<v:k==='yMin'?link.entry.y>v:link.entry.y<v));}
 assert.deepEqual(Object.keys(data.expedition.atlas).sort(),registry.ids.slice().sort());assert.deepEqual(data.expedition.atlas['central-hub'],{column:1,row:1});
});

test('actual loader discovers ninth area lazily and reuses old Westminster safety data across entry and return',async t=>{
 const old=globalThis.fetch,requests=[];globalThis.fetch=async url=>{const p=new URL(url).pathname.slice(1);requests.push(p);return{ok:true,json:async()=>read('../public/'+p)};};t.after(()=>globalThis.fetch=old);
 class Loader{async loadAsync(){return new T.Texture({width:1672,height:941});}}
 const w=await createWorld({THREE:{...T,TextureLoader:Loader},scene:new T.Scene(),camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/'});t.after(()=>w.dispose());
 assert.equal(w.areaId,'westminster');assert.equal(safehouseSite(w).areaId,'westminster');assert(!requests.includes('world/central-hub/layout.json'));
 await w.prepareArea('central-hub');const site=w.safehouseData.additionalSites[0];assert(site.wholeArea);assert(Object.isFrozen(site));
 await w.loadArea('central-hub',{x:.075,y:.45});assert.equal(safehouseSite(w),site);assert.equal(w.areaId,'central-hub');assert.equal(w.residentPlacements['central-hub'].length,0);
 await w.loadArea('westminster',{x:.38,y:.92});assert.equal(safehouseSite(w).areaId,'westminster');
});

test('hub has zero hostiles and existing safety blocks hits, weapons, delayed projectiles and companion payment while allowing walking',()=>{
 const f=make(),g=f.g;assert.equal(g.enemies.length,0);assert(g.encounterCleared);assert(safehouseProtected(g));
 for(const id of ['locker','comms','map'])assert(safehouseProp(g,id));assert(safehouseInteraction(g));
 const hp=g.player.hp,ammo=[g.pistol.magazine,g.pistol.reserve,g.bossEquipment.commanderPistol.magazine,g.bossEquipment.commanderPistol.reserve];
 assert.equal(receiveHit(g,{origin:{x:g.player.pos.x+1,z:g.player.pos.z},damage:100}),false);
 assert(safehouseBlocksSegment(g,g.player.pos,g.player.pos));g.activeGrenades=[{id:'paid'}];g.activeRockets=[{id:'paid'}];
 const before={...g.player.pos};stepGame(g,{move:{x:1,z:0},actions:['heavy'],held:['fire'],fire:true},1/60,{dispatchBossEquipment:f.p.dispatchBossEquipment});
 assert(g.weaponsLowered);assert.notDeepEqual(g.player.pos,before);assert.equal(g.player.hp,hp);assert.deepEqual(g.activeGrenades,[]);assert.deepEqual(g.activeRockets,[]);assert(!g.player.swing);assert(!g.railgunCharge);assert.equal(g.reaperAction?.pending??null,null);
 assert.deepEqual([g.pistol.magazine,g.pistol.reserve,g.bossEquipment.commanderPistol.magazine,g.bossEquipment.commanderPistol.reserve],ammo);
});

test('genuine published194 v16 resources and ownership survive hub visit, real Storage roundtrip and cold restore through passive17 without changing the resource model or rollback16',()=>{
 const f=make(),g=f.g,before=JSON.parse(seed);assert.equal(g.player.hp,72);assert.deepEqual([g.pistol.magazine,g.pistol.reserve],[2,10]);assert(f.p.persistRun(g));
 assert(g.expedition.visitedIds.includes('central-hub'));const reserve=g.pistol.reserve;
 assert(f.p.dispatchLocker(g,{type:'depositSupply',resource:'pistol-reserve',amount:1},true).ok);assert.equal(g.pistol.reserve,reserve-1);
 assert(f.p.dispatchLocker(g,{type:'withdrawSupply',resource:'pistol-reserve',amount:1},true).ok);assert.equal(g.pistol.reserve,reserve);
 const cold=make(f.records);assert.equal(cold.g.player.hp,before.hp);assert.deepEqual(cold.g.bossEquipment,before.bossEquipment);assert.deepEqual(JSON.parse(f.records.get(HUB_SAVE_KEY)).pistol,before.pistol);for(const key of ['collected','equipped','magazine','reserve'])assert.deepEqual(cold.g.pistol[key],before.pistol[key],key);assert(cold.g.expedition.visitedIds.includes('central-hub'));assert.equal(JSON.parse(f.records.get(HUB_SAVE_KEY)).version,17);
 assert.equal(f.records.get(RAILGUN_SAVE_KEY),seed);cold.quota(true);const raw=f.records.get(HUB_SAVE_KEY);assert.equal(cold.p.dispatchLocker(cold.g,{type:'depositSupply',resource:'pistol-reserve',amount:1},true).ok,false);assert.equal(f.records.get(HUB_SAVE_KEY),raw);assert.equal(cold.g.pistol.reserve,reserve);
});
