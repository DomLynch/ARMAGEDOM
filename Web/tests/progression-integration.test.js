import {pacedKnifeIntent} from './helpers/paced-knife.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createGame,stepGame,initializeAreaResidents} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';import {createRunPersistence} from '../src/engine/run-core.js';import {createAreaRegistry} from '../src/area-registry.js';import {validateAreaMetadata} from '../src/engine/area-content.js';import {createGeometry} from '../src/world-geometry.js';import {travelTo} from '../src/travel.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../public/'+p,import.meta.url))),manifest=read('world/manifest.json'),registry=createAreaRegistry({manifest}),content=validateAreaMetadata(read('world/area-content.json'),registry);
function fixture(){let geometry=createGeometry(read('world/westminster/layout.json'));const world={registry,areaId:'westminster',layout:{characterScale:1.265},spawn:{x:0,z:-6},progressionData:content.progression,residentPlacements:content.residents,lootRules:content.lootRules,lineClear:(a,b)=>geometry.lineClear(a,b),move:(p,d,r)=>geometry.move(p,d,r),async loadArea(id,entry){this.areaId=id;geometry=createGeometry(read('world/'+id+'/layout.json'));return geometry.ground(entry??registry.get(id).entry);}};
 const fresh=()=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,areaResidents:true,openingGroup:false,residentPlacements:content.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});let g=fresh(),quota=false;const records=new Map(),p=createRunPersistence({getRun:()=>g,setRun:value=>g=value,createFreshRun:fresh,storage:{getItem:key=>records.get(key)??null,setItem(key,raw){if(quota)throw Error('quota');records.set(key,raw);}}});
 const tick=(intent={})=>{stepGame(g,intent,1/60,{dispatchPistol:p.dispatchPistol});p.collectNearbySupplies(g,intent);p.persistRun(g);};return{get g(){return g},world,p,records,tick,quota(value){quota=value;}};}
async function pistolKill(f,{failedWrite=false}={}){
 f.g.player.pos={...f.g.pistol.pickupPos};f.tick({actions:['pickup']});assert(f.g.pistol.collected);await travelTo(f.g,{areaId:'east',entryPoint:{x:.1,y:.72}});const target=f.g.enemies.find(e=>e.placementKey==='east-roamer-2');assert(target);
 f.beforeRoster=Object.fromEntries(f.g.enemies.map(e=>[e.placementKey,{scale:e.combatScale,radius:e.radius}]));f.deathBoundaryRaw=f.records.get('armagedom:progression-run:v4');if(failedWrite)f.quota(true);
 for(let i=0;i<300&&target.hp>0;i++){const dx=target.pos.x-f.g.player.pos.x,dz=target.pos.z-f.g.player.pos.z;f.tick({actions:['fire'],aim:{x:dx,z:dz}});}
 assert.equal(target.hp,0);return target;
}
test('actual pistol trace/death producer awards once and real re-entry excludes the non-respawning victim',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);assert.equal(f.g.player.maxHP,150);assert.equal(f.g.player.maxStamina,100);await pistolKill(f);
 assert.equal(f.g.progression.proficiency['westminster-start-pistol-v1'],20);assert.equal(f.g.progression.awards.length,1);assert(f.g.supplies.issued.includes('east-roamer-2'));const saved=JSON.parse(f.records.get('armagedom:progression-run:v4'));assert.equal(saved.version,4);assert.equal(saved.progression.proficiency['westminster-start-pistol-v1'],20);
 f.p.persistRun(f.g);assert.equal(f.g.progression.awards.length,1);await travelTo(f.g,{areaId:'westminster'});delete f.g.areaFights.east;await travelTo(f.g,{areaId:'east'});assert(!f.g.enemies.some(e=>e.placementKey==='east-roamer-2'));for(const e of f.g.enemies)assert.deepEqual({scale:e.combatScale,radius:e.radius},f.beforeRoster[e.placementKey],'survivor sizes retain full registered roster');assert.equal(f.g.progression.awards.length,1);
 assert(f.p.retry());assert.deepEqual(f.g.progression.proficiency,{knife:0,'westminster-start-pistol-v1':0});assert.deepEqual(f.g.progression.awards,[]);
});
test('failed durable writes hold actual death award until the next whole writer succeeds',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);await pistolKill(f,{failedWrite:true});assert.equal(f.g.progression.proficiency['westminster-start-pistol-v1'],0);assert.deepEqual(f.g.progression.awards,[]);assert.equal(f.records.get('armagedom:progression-run:v4'),f.deathBoundaryRaw);
 f.quota(false);assert(f.p.persistRun(f.g));assert.equal(f.g.progression.proficiency['westminster-start-pistol-v1'],20);assert.equal(f.g.progression.awards.length,1);
});

test('real blade contact earns knife mastery; missed distant swings earn none',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);for(let i=0;i<60;i++)f.tick({actions:['slash'],aim:{x:0,z:1}});assert.equal(f.g.progression.proficiency.knife,0);
 await travelTo(f.g,{areaId:'east',entryPoint:{x:.1,y:.72}});const target=f.g.enemies.find(e=>e.placementKey==='east-roamer-2');f.g.player.pos={x:target.pos.x,z:target.pos.z-.95};f.g.player.facing={x:0,z:1};
 for(let n=0;n<1500&&target.hp>0&&f.g.player.hp>0;n++)f.tick(pacedKnifeIntent({...f.g,enemies:[target,...f.g.enemies.filter(e=>e!==target)]}));
 assert.equal(target.hp,0);assert.equal(f.g.progression.proficiency.knife,20);assert.equal(f.g.progression.proficiency['westminster-start-pistol-v1'],0);assert.equal(f.g.progression.awards.length,1);
});

test('F3 fast guard persists a nonloot progression-only award before exposing its score',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);await travelTo(f.g,{areaId:'east',entryPoint:{x:.1,y:.72}});f.p.persistRun(f.g);const old=f.records.get('armagedom:progression-run:v4'),e=f.g.enemies.find(e=>e.placementKey==='east-roamer-8');assert(e);
 // Controlled dead DTO exercises the codec boundary; real producers are proved above.
 e.hp=0;f.g.enemies=f.g.enemies.filter(row=>row!==e);f.g.corpses.push(e);f.g.pendingProgressionDeaths.push({placementKey:e.placementKey,areaId:'east',weaponId:'knife',damageApplied:10});
 assert(f.p.persistRun(f.g));const raw=f.records.get('armagedom:progression-run:v4');assert.notEqual(raw,old);assert.equal(JSON.parse(raw).progression.proficiency.knife,20);assert.equal(f.g.progression.proficiency.knife,20);
});
