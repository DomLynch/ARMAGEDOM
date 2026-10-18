import{dispatchEquipmentSelection}from'../src/engine/run-views.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame,stepGame} from '../src/combat.js';
import {createAreaRegistry} from '../src/area-registry.js';
import {createGeometry} from '../src/world-geometry.js';
import {validateAreaMetadata,validateAreaGeometry} from '../src/engine/area-content.js';
import {createRunPersistence} from '../src/engine/run-core.js';
import {setFlameEquipped,stopFlame} from '../src/engine/flame-runtime.js';
import {FLAME_SAVE_KEY} from '../src/engine/flame-core.js';
import {travelTo} from '../src/travel.js';
import {nextAnimalCycle} from '../src/animal-cycle.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../public/'+p,import.meta.url))),manifest=read('world/manifest.json'),registry=createAreaRegistry({manifest}),content=validateAreaMetadata(read('world/area-content.json'),registry),layout=id=>read(registry.asset(registry.get(id).layoutRef).path),oldKey='armagedom:unique-reward-run:v7',earned=fs.readFileSync(new URL('./fixtures/earned-cleaver148-v7.json',import.meta.url),'utf8');
function fixture({records=new Map(),flame=true,blockHistory=false}={}){
 const writeKeys=[];let g,quota=false,writes=0,remainingWrites=Infinity,geometry=createGeometry(layout('westminster'));
 const world={registry,areaId:'westminster',layout:layout('westminster'),spawn:geometry.ground(registry.get('westminster').entry),geometry,bossData:content.bossData,progressionData:content.progression,expeditionData:content.expedition,uniqueRewardData:content.uniqueRewardData,populationData:content.populationData,flameData:flame?content.flameData:null,residentPlacements:content.residents,lootRules:content.lootRules,
  lineClear:(a,b)=>geometry.lineClear(a,b),move:(p,d,r)=>geometry.move(p,d,r),async loadArea(id,entry){this.areaId=id;this.layout=validateAreaGeometry(registry,id,layout(id),content.residents,content.expedition,content.bossData,content.populationData,content.flameData);geometry=createGeometry(this.layout);this.geometry=geometry;this.spawn=geometry.ground(entry??registry.get(id).entry);return this.spawn;}};
 const fresh=({reset=false}={})=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,areaResidents:true,animalVariants:true,animalCycle:reset?undefined:g?nextAnimalCycle(g.animalCycle):'A',drone:true,rat:true,dog:true,roach:true,finishers:true,residentPlacements:content.residents,encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}}});g=fresh();
 const p=createRunPersistence({getRun:()=>g,setRun:n=>g=n,createFreshRun:fresh,storage:{getItem:k=>{if(blockHistory&&k.endsWith(':reset-backups'))throw Error('blocked history');return records.get(k)??null;},setItem(k,v){writeKeys.push(k);if(blockHistory&&k.endsWith(':reset-backups'))throw Error('blocked history');if(quota||remainingWrites--<=0)throw Error('quota');records.set(k,v);writes++;}}});
 const source=()=>({position:{x:g.player.pos.x,y:1.15,z:g.player.pos.z},direction:{x:g.player.facing.x,y:0,z:g.player.facing.z}});
 const tick=(intent={held:['fire'],aim:{x:-1,z:0}})=>{stepGame(g,intent,1/60,{dispatchFlame:p.dispatchFlame,dispatchPistol:p.dispatchPistol,flameSource:source});p.persistRun(g);};
 return{get g(){return g},world,p,records,tick,source,get writes(){return writes},writeKeys,quota:v=>quota=v,allowWrites:n=>remainingWrites=n};
}
async function pickup(f){await travelTo(f.g,{areaId:f.world.flameData.areaId});f.g.player.pos={...f.world.flameData.position};assert(f.p.dispatchFlame(f.g,{type:'claimPickup',pickupId:f.world.flameData.pickupId},null,true).ok);}
test('actual whole v7→v8 migration preserves raw earned save; pickup once and Retry/cold reload retain partial fuel',async()=>{
 const records=new Map([[oldKey,earned]]),f=fixture({records});f.p.restoreSavedRun(f.g);assert(!f.g.runSaveInvalid);assert.equal(records.get(oldKey),earned);assert.equal(JSON.parse(records.get(FLAME_SAVE_KEY)).version,8);assert.equal(f.g.uniqueReward.status,'owned');
 await pickup(f);assert.equal(f.g.flameFuel.fuelUnits,1000);assert.equal(f.g.flame.equipped,false);assert(setFlameEquipped(f.g,true));f.tick();assert(f.g.flameFuel.fuelUnits<1000);const fuel=f.g.flameFuel.fuelUnits;
 assert.equal(f.p.dispatchFlame(f.g,{type:'claimPickup',pickupId:f.world.flameData.pickupId},null,true).code,'already-collected');assert.equal(f.g.flameFuel.fuelUnits,fuel);assert(f.p.retry());assert.equal(f.g.flameFuel.fuelUnits,fuel);assert.equal(f.g.flame.equipped,false);assert.equal(f.g.uniqueReward.status,'owned');
 const cold=fixture({records});cold.p.restoreSavedRun(cold.g);assert(!cold.g.runSaveInvalid);assert.equal(cold.g.flameFuel.fuelUnits,fuel);assert.equal(cold.g.flame.equipped,false);assert.equal(records.get(oldKey),earned);
});
test('actual quota failure emits no flame/damage/fuel; same tick cannot be charged twice and normal SAVE cannot replay elapsed',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);await pickup(f);assert(setFlameEquipped(f.g,true));f.quota(true);f.tick();assert.equal(f.g.flameFuel.fuelUnits,1000);assert.equal(f.g.flame.active,false);assert(!f.g.events.some(e=>e.type==='hit'));
 f.quota(false);assert.equal(f.p.dispatchFlame(f.g,{type:'save'},{seconds:10,active:true},true).ok,false,'Runtime refuses a stale/batched elapsed request');f.tick();const fuel=f.g.flameFuel.fuelUnits;assert(Math.abs(fuel-(1000-100/60))<1e-8);const writes=f.writes;
 assert.equal(f.p.dispatchFlame(f.g,{type:'save'},{seconds:1/60,active:true},true).ok,false);assert(f.p.persistRun(f.g));assert.equal(f.g.flameFuel.fuelUnits,fuel);assert.equal(f.writes,writes,'F3 covers fuel and scoped consumption is cleared');
 stopFlame(f.g);f.tick({held:[]});assert.equal(f.g.flameFuel.fuelUnits,fuel);
});
test('occupied invalid v8 never falls back; historical flame credit is rejected even without flame feature enabled',()=>{
 const bad='{"version":8,"flameFuel":null}',records=new Map([[oldKey,earned],[FLAME_SAVE_KEY,bad]]),f=fixture({records});f.p.restoreSavedRun(f.g);assert(f.g.runSaveInvalid);assert.equal(records.get(FLAME_SAVE_KEY),bad);assert.equal(f.p.retry(),false);
 const template=fixture({flame:false}),crafted=JSON.parse(earned),row={placementKey:'east-roamer-3',areaId:'east',weaponId:'flamethrower-area8-v1'};crafted.progression=template.g.progressionModel.award(template.g.progressionModel.freshState(),[row]).state;assert(template.g.progressionModel.valid(crafted.progression),'Today model accepts a registered zero-XP row');crafted.supplies.issued.push(row.placementKey);const raw=JSON.stringify(crafted),old=fixture({flame:false,records:new Map([[oldKey,raw]])});old.p.restoreSavedRun(old.g);assert(old.g.runSaveInvalid,'Actual public codec door still rejects impossible historical flame credit');assert.equal(old.records.get(oldKey),raw);
});
test('real flame ticks kill Hale with one zero-XP death/loot/unique receipt; quota retains death intent and never replays fuel',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);await pickup(f);await travelTo(f.g,{areaId:'east'});const hale=f.g.enemies.find(e=>e.placementKey==='east-roamer-2');assert.equal(hale.hp,120);
 // Component fixture isolates the actual protected resident, not a native-play proof.
 f.g.enemies=[hale];hale.ready=hale.recoverUntil=hale.staggerUntil=1e6;f.g.player.pos={x:hale.pos.x+2,z:hale.pos.z};assert(f.world.geometry.clear(f.g.player.pos,f.g.player.radius));assert(setFlameEquipped(f.g,true));
 const events=[];for(let i=0;i<240&&hale.hp>8;i++){f.tick();events.push(...f.g.events);}assert.equal(hale.hp,8);
 // Fuel must commit first. Deny subsequent death+loot+unique write only.
 let charged=false;for(let i=0;i<20&&hale.hp>0;i++){if(f.g.flame.elapsed+1/60+1e-8>=f.world.flameData.contact.interval){f.allowWrites(1);charged=true;}f.tick();events.push(...f.g.events);}
 assert(charged);assert.equal(hale.hp,0);assert.equal(f.g.uniqueReward.status,'eligible');const fuel=f.g.flameFuel.fuelUnits;assert(fuel<1000);assert.equal(f.g.progression.awards.length,0);
 f.allowWrites(Infinity);const cursor=f.g.events.length;assert(f.p.persistRun(f.g));events.push(...f.g.events.slice(cursor));assert.equal(f.g.uniqueReward.status,'pending');assert.equal(f.g.progression.awards.length,1);assert.equal(f.g.progression.awards[0].weaponId,'flamethrower-area8-v1');assert.deepEqual(f.g.progression.proficiency,{knife:0,'westminster-start-pistol-v1':0});assert.equal(f.g.supplies.issued.filter(k=>k===hale.placementKey).length,1);assert.equal(f.g.flameFuel.fuelUnits,fuel);const before=JSON.stringify(JSON.parse(f.records.get(FLAME_SAVE_KEY)));assert(f.p.persistRun(f.g));assert.equal(JSON.stringify(JSON.parse(f.records.get(FLAME_SAVE_KEY))),before);assert.equal(events.filter(e=>e.type==='death').length,1);
});
test('ten seconds exhaust fuel once, return to prior pistol without touching ammo/reload clocks, and Retry cannot refill',async()=>{
 const f=fixture();f.p.restoreSavedRun(f.g);await pickup(f);await travelTo(f.g,{areaId:'westminster'});f.g.player.pos={...f.g.pistol.pickupPos};assert(f.p.dispatchPistol(f.g,{type:'claimPickup',pickupId:'westminster-start-pistol-v1'},true).ok);
 f.tick({actions:['fire'],aim:{x:-1,z:0}});assert.equal(f.g.pistol.magazine,5);for(let i=0;i<100&&f.g.time+1e-8<f.g.pistol.nextFireAt;i++)f.tick({held:[],aim:{x:-1,z:0}});f.tick({actions:['stab'],aim:{x:-1,z:0}});assert(f.g.pistol.reloadingUntil>f.g.time);const gun={...f.g.pistol};assert(setFlameEquipped(f.g,true));
 for(let i=0;i<600;i++)f.tick();assert.equal(f.g.flameFuel.fuelUnits,0);f.tick({held:[]});assert.equal(f.g.flame.equipped,false);assert.equal(f.g.player.weapon,'pistol');for(const k of ['magazine','reserve','reloadingUntil','nextFireAt'])assert.equal(f.g.pistol[k],gun[k],k);
 assert(f.p.retry());assert.deepEqual(f.g.flameFuel,{version:1,collected:true,fuelUnits:0});assert.equal(setFlameEquipped(f.g,true),false);assert.equal(f.p.dispatchFlame(f.g,{type:'claimPickup',pickupId:f.world.flameData.pickupId},null,true).code,'already-collected');
});

test('moving the same pickup preserves real154 collected and empty v8 saves without duplicate or refill',async()=>{for(const name of['flame154-collected-v8.json','flame154-empty-v8.json']){const raw=fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'),fuel=JSON.parse(raw).flameFuel,records=new Map([[FLAME_SAVE_KEY,raw]]),f=fixture({records});f.p.restoreSavedRun(f.g);assert.equal(f.world.flameData.areaId,'westminster');assert.deepEqual(f.g.flameFuel,fuel);assert.equal(f.g.flame.equipped,false);f.g.player.pos={...f.world.flameData.position};const before=f.writes,r=f.p.dispatchFlame(f.g,{type:'claimPickup',pickupId:f.world.flameData.pickupId},null,true);assert.equal(r.ok,false);assert.equal(r.code,'already-collected');assert.equal(f.writes,before);assert.equal(records.get(FLAME_SAVE_KEY),raw);assert.deepEqual(f.g.flameFuel,fuel);}});

test('Reset writes only fresh v8 and leaves malformed history, legacy and foreign records unchanged; Retry retains progress',async()=>{
 const history=FLAME_SAVE_KEY+':reset-backups',records=new Map([[oldKey,earned],[history,'{malformed-history'],['foreign:auth','untouched']]),f=fixture({records});f.p.restoreSavedRun(f.g);await pickup(f);assert(setFlameEquipped(f.g,true));f.tick();const fuel=f.g.flameFuel.fuelUnits,old=f.g;assert(f.p.retry());assert.equal(f.g.flameFuel.fuelUnits,fuel);assert.equal(f.g.uniqueReward.status,'owned');const before=f.g,prior=new Map(records),cursor=f.writeKeys.length;
 assert(f.p.resetRun().ok);assert.notEqual(f.g,before);assert.deepEqual(f.writeKeys.slice(cursor),[FLAME_SAVE_KEY]);for(const[k,v]of prior)if(k!==FLAME_SAVE_KEY)assert.equal(records.get(k),v);assert.equal(records.size,prior.size);assert.equal(f.g.player.hp,150);assert.deepEqual(f.g.flameFuel,{version:1,collected:false,fuelUnits:0});assert.equal(f.g.pistol.collected,false);assert.deepEqual(f.g.progression.awards,[]);
 const saved=JSON.parse(records.get(FLAME_SAVE_KEY));assert.equal(saved.version,8);assert.equal(saved.uniqueReward.status,'eligible');assert.equal(saved.expedition.status,'available');assert.deepEqual(saved.expedition.visitedIds,[]);const cold=fixture({records});cold.p.restoreSavedRun(cold.g);assert.equal(cold.g.uniqueReward.status,'eligible');assert.deepEqual(cold.g.progression.awards,[]);assert.deepEqual(cold.g.flameFuel,{version:1,collected:false,fuelUnits:0});await pickup(cold);assert.equal(cold.g.flameFuel.fuelUnits,1000);assert(cold.p.resetRun().ok);assert.equal(records.get(history),'{malformed-history');assert.equal(f.p.persistRun(old),false);
});
test('primary Reset write failure retains old owner/raw and recovery requires exactly one successful write',()=>{
 const records=new Map([[oldKey,earned]]),f=fixture({records});f.p.restoreSavedRun(f.g);const old=f.g,raw=records.get(FLAME_SAVE_KEY);f.allowWrites(0);assert.equal(f.p.resetRun().code,'storage-unavailable');assert.equal(f.g,old);assert.equal(records.get(FLAME_SAVE_KEY),raw);assert.equal(f.g.uniqueReward.status,'owned');f.allowWrites(1);const cursor=f.writeKeys.length;assert(f.p.resetRun().ok);assert.deepEqual(f.writeKeys.slice(cursor),[FLAME_SAVE_KEY]);assert.equal(f.g.flameFuel.collected,false);assert.equal(records.has(FLAME_SAVE_KEY+':reset-backups'),false);
});
test('explicit Reset replaces corrupt primary without reading or writing blocked backup history',()=>{
 const bad='{bad-v8',records=new Map([[oldKey,earned],[FLAME_SAVE_KEY,bad]]),f=fixture({records,blockHistory:true});f.p.restoreSavedRun(f.g);assert(f.g.runSaveInvalid);assert.equal(f.p.retry(),false);assert(f.p.resetRun().ok);assert.deepEqual(f.writeKeys,[FLAME_SAVE_KEY]);assert.equal(records.get(oldKey),earned);assert.equal(JSON.parse(records.get(FLAME_SAVE_KEY)).version,8);assert.equal(f.g.runSaveInvalid,undefined);
});


test('failed equipment selection preserves active flame and resources; only committed swaps lower it',async()=>{
 for(const family of ['pistol','melee']){
  const f=fixture({records:new Map([[oldKey,earned]])});f.p.restoreSavedRun(f.g);await pickup(f);assert(setFlameEquipped(f.g,true));f.tick();assert(f.g.flameFuel.fuelUnits<1000);
  const command=family==='pistol'?{type:'selectVariant',variantId:'westminster-start-pistol-v1'}:{type:'equip',itemId:'knife',equipped:true},dispatch=family==='pistol'?f.p.dispatchExpedition:f.p.dispatchUniqueReward;
  const snapshot=()=>JSON.stringify({flame:f.g.flame,fuel:f.g.flameFuel,pistol:f.g.pistol,unique:f.g.uniqueReward,expedition:f.g.expedition,weapon:f.g.player.weapon});
  let before=snapshot();assert.equal(dispatchEquipmentSelection(f.g,command,false,dispatch).ok,false);assert.equal(snapshot(),before,'denied selection must not lower or mutate current weapon');
  f.quota(true);before=snapshot();assert.equal(dispatchEquipmentSelection(f.g,command,true,dispatch).code,'storage-unavailable');assert.equal(snapshot(),before,'quota failure must preserve flame, ammo, fuel and selection');
  f.quota(false);const fuel=f.g.flameFuel.fuelUnits,ammo=[f.g.pistol.magazine,f.g.pistol.reserve];assert(dispatchEquipmentSelection(f.g,command,true,dispatch).ok);assert.equal(f.g.flame.equipped,false);assert.equal(f.g.flameFuel.fuelUnits,fuel);assert.deepEqual([f.g.pistol.magazine,f.g.pistol.reserve],ammo);
  assert(dispatchEquipmentSelection(f.g,command,true,dispatch).ok,'duplicate selection is idempotent');assert.equal(f.g.flameFuel.fuelUnits,fuel);assert.deepEqual([f.g.pistol.magazine,f.g.pistol.reserve],ammo);
 }
});
