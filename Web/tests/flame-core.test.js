import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createRunOperation} from '../src/core/run-operation.js';
import {createProgressionComponent,PROGRESSION_SAVE_KEY} from '../src/engine/progression-core.js';
import {createExpeditionComponent,AREA_BOSS_SAVE_KEY,EXPEDITION_SAVE_KEY} from '../src/engine/expedition-core.js';
import {createUniqueRewardModel} from '../src/engine/unique-reward-state.js';
import {createUniqueRewardComponent,UNIQUE_REWARD_SAVE_KEY} from '../src/engine/unique-reward-core.js';
import {createFlameFuelModel,FLAME_PILOT_PROFILE} from '../src/engine/flame-fuel-state.js';
const {createFlameComponent,FLAME_SAVE_KEY}=await import(process.env.FLAME_CORE_URL??new URL('../src/engine/flame-core.js',import.meta.url).href);
const fuel=createFlameFuelModel(FLAME_PILOT_PROFILE),flameId=FLAME_PILOT_PROFILE.pickupId;
const item='hale-pitborn-cleaver-v1',placementKey='east-roamer-2',pistolId='westminster-start-pistol-v1';
const model=createUniqueRewardModel({placementKey,areaId:'east',itemId:item,baseVariantId:'knife',receiptId:placementKey+':'+item});
const rules={version:1,killScore:20,scoreCap:100,damagePerPoint:.001,hpPerVitality:2,staminaPerEndurance:1,damagePerAttribute:.01,weapons:{knife:{damageAttribute:'strength'},[pistolId]:{damageAttribute:'dexterity'}}};
const data={contract:{id:'west-east-stolen-supply-v1',rewardVariantId:'watchmans-pistol-v1',receiptId:'west-east-stolen-supply-v1:watchmans-pistol-v1',giver:{areaId:'westminster',position:{x:0,z:0},radius:1.3},case:{areaId:'east',position:{x:2,z:-3},radius:1.3}}};
function fixture({records=new Map(),legal=true}={}){
 let g,quota=false,scoped=true,writes=0,legalPoint=legal,request=null,reads=0;
 const registry={ids:['westminster','east'],has:id=>['westminster','east'].includes(id)},world={areaId:'east',lineClear:()=>true};
 const fresh=()=>({world,time:10,finished:false,player:{hp:150,maxHP:150,maxStamina:100,weapon:'knife',pos:{x:2,z:-3},hurtUntil:0,dodgeUntil:0,swing:null},pistol:{collected:true,equipped:false,magazine:4,reserve:5,reloadingUntil:0,nextFireAt:3},supplies:{version:1,issued:[],pending:[],collected:[]},vest:{version:1,itemId:'westminster-worn-vest-v1',equipped:false},droneDeaths:[],animalCycle:'A',lootRules:{[placementKey]:{},'east-roamer-1':{}},enemies:[{placementKey,areaId:'east',hp:100,maxHP:100,pos:{x:2,z:-3}},{placementKey:'east-roamer-1',areaId:'east',hp:100,maxHP:100,pos:{x:3,z:-3}}],corpses:[]});
 g=fresh();
 // Only the lowest combat codec is a fixture. Core/IO, progression, expedition
 // unique and flame are actual components in their real order; no actual runtime codec claim.
 const combat={RUN_SAVE_KEY:'armagedom:area1-run:v1',PISTOL_SAVE_KEY:'armagedom:pistol:v1',
  encodeRun:run=>JSON.stringify({version:2,pistol:{...run.pistol},hp:run.player.hp,supplies:run.supplies,vest:run.vest,droneDeaths:run.droneDeaths,animalCycle:run.animalCycle}),
  restoreRun(template,raw,legacy){if(raw==null){const old=legacy==null?null:JSON.parse(legacy);return{pistol:old??template.pistol,hp:template.player.hp,supplies:template.supplies,vest:template.vest,droneDeaths:[],animalCycle:'A'};}try{const s=JSON.parse(raw);return s.version===2&&Number.isFinite(s.hp)&&s.hp>=0&&s.hp<=template.player.maxHP?s:null;}catch{return null;}},
  applySavedRun(run,saved){run.player.hp=saved.hp;run.pistol={...saved.pistol};run.player.weapon=run.pistol.equipped?'pistol':'knife';for(const k of['supplies','vest','droneDeaths','animalCycle'])run[k]=saved[k];},
  captureRunState:run=>JSON.stringify({hp:run.player.hp,pistol:run.pistol,supplies:run.supplies,vest:run.vest,droneDeaths:run.droneDeaths,animalCycle:run.animalCycle}),
  isRunStateUnchanged(run,snapshot){return this.captureRunState(run)===snapshot;},
 };
 const progression=createProgressionComponent({baseCodec:combat,getRun:()=>g,data:rules,placements:{east:[{key:placementKey},{key:'east-roamer-1'}],westminster:[]}});
 const expedition=createExpeditionComponent({baseCodec:progression.codec,getRun:()=>g,data,registry,saveVersion:6,applyBaseSaved:progression.applySavedRun,baseStorageAdapter:progression.storageAdapter});
 const sourceDead=saved=>(saved.progression?.awards??[]).some(r=>r.placementKey===placementKey&&r.areaId==='east')||(saved.supplies?.issued??[]).includes(placementKey);
 const unique=createUniqueRewardComponent({baseCodec:expedition.codec,getRun:()=>g,model,placementKey,areaId:'east',itemId:item,baseVariantId:'knife',applyBaseSaved:expedition.applySavedRun,baseStorageAdapter:expedition.storageAdapter,canDispatch:()=>scoped,sourceDead,validatedDropPosition:(run,corpse)=>legalPoint?{...corpse.pos}:null});
 const component=createFlameComponent({baseCodec:unique.codec,getRun:()=>g,model:fuel,applyBaseSaved:unique.applySavedRun,baseStorageAdapter:unique.storageAdapter,canPickup:()=>scoped,getConsumption:()=>{reads++;return request;},unitsPerSecond:100});
 const io=createRunStorage({codec:component.codec,storage:component.storageAdapter({getItem:key=>records.get(key)??null,setItem(key,raw){writes++;if(quota)throw Error('quota');records.set(key,raw);}})});
 const domain=createRunOperation({getRun:()=>g,setRun:next=>g=next,createFreshRun:fresh,applySavedRun:component.applySavedRun,claimPickup:()=>({ok:false,code:'not-eligible',events:[]}),equip:()=>({ok:false,code:'not-eligible',events:[]})});
 const core=createCore({executeDomain:component.wrapDomain(unique.wrapDomain(expedition.wrapDomain(progression.wrapDomain(domain)))),codec:component.codec,readRun:()=>io.restore(g),writeRun:io.write});
 return{core,component,unique,progression,expedition,combat,records,world,
  get reads(){return reads;},
  fire(seconds,active=true){request={seconds,active};try{return core.dispatch({type:'save'});}finally{request=null;}},
  flamePickup:()=>core.dispatch({type:'claimPickup',pickupId:flameId}),get run(){return g;},get writes(){return writes;},quota:value=>quota=value,scope:value=>scoped=value,legal:value=>legalPoint=value,
  save:()=>core.dispatch({type:'save'}),restore:()=>core.dispatch({type:'restore'}),retry:()=>core.dispatch({type:'retry'}),pickup:()=>core.dispatch({type:'claimPickup',pickupId:item}),select:variantId=>core.dispatch({type:'equip',itemId:variantId,equipped:true}),
  kill(key=placementKey){const victim=g.enemies.find(e=>e.placementKey===key);victim.hp=0;if(!g.supplies.issued.includes(key))g.supplies.issued.push(key);return progression.recordDeath(g,{placementKey:key,areaId:'east',weaponId:'knife',damageApplied:20});},
 };
}
test('absent v8 migrates v7 and complete legacy chain, preserving every old raw',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);
 const candidates=[[UNIQUE_REWARD_SAVE_KEY,seed.unique.codec.encodeRun(seed.run)],[AREA_BOSS_SAVE_KEY,seed.expedition.codec.encodeRun(seed.run)],[EXPEDITION_SAVE_KEY,JSON.stringify({...JSON.parse(seed.expedition.codec.encodeRun(seed.run)),version:5})],[PROGRESSION_SAVE_KEY,seed.progression.codec.encodeRun(seed.run)],[seed.combat.RUN_SAVE_KEY,seed.combat.encodeRun(seed.run)],[seed.combat.PISTOL_SAVE_KEY,JSON.stringify(seed.run.pistol)]];
 for(const[key,raw]of candidates){const f=fixture({records:new Map([[key,raw]])});assert.ok(f.restore().ok,key);assert.deepEqual(f.run.flameFuel,fuel.freshState());assert.ok(f.save().ok);assert.equal(f.records.get(key),raw);const saved=JSON.parse(f.records.get(FLAME_SAVE_KEY));assert.equal(saved.version,8);assert.deepEqual(Object.keys(saved).sort(),[...Object.keys(JSON.parse(seed.unique.codec.encodeRun(seed.run))),'flameFuel'].sort());assert.ok(fixture({records:f.records}).restore().ok);}
});
test('occupied invalid v8 never falls back, and snapshots include every fuel field',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);const v7=seed.unique.codec.encodeRun(seed.run),valid=JSON.parse(seed.component.codec.encodeRun(seed.run));
 const bad=[null,{}, {...fuel.freshState(),fuelUnits:1},{version:1,collected:true,fuelUnits:1001},{version:1,collected:true,fuelUnits:-1},{version:1,collected:true,fuelUnits:1,extra:0}];
 for(const raw of ['{bad',v7,JSON.stringify({...valid,extra:0}),...bad.map(flameFuel=>JSON.stringify({...valid,flameFuel}))]){
  const f=fixture({records:new Map([[UNIQUE_REWARD_SAVE_KEY,v7],[FLAME_SAVE_KEY,raw]])});assert.equal(f.restore().code,'invalid-save');assert.equal(f.save().ok,false);f.run.runSaveInvalid=true;assert.equal(f.retry().code,'invalid-save');assert.equal(f.records.get(FLAME_SAVE_KEY),raw);assert.equal(f.records.get(UNIQUE_REWARD_SAVE_KEY),v7);
 }
 const f=fixture();assert.ok(f.restore().ok);const snap=f.component.codec.captureRunState(f.run);assert.ok(f.component.codec.isRunStateUnchanged(f.run,snap));assert.ok(f.flamePickup().ok);assert.equal(f.component.codec.isRunStateUnchanged(f.run,snap),false);const collected=f.component.codec.captureRunState(f.run);assert.ok(f.fire(.1).ok);assert.equal(f.component.codec.isRunStateUnchanged(f.run,collected),false);
 f.run.flameFuel.extra=0;assert.equal(f.component.codec.isRunStateUnchanged(f.run,collected),false);assert.equal(f.save().code,'invalid-save');
});
test('historical v7 flame death rows reject before a permissive base model sees them',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);const original=JSON.parse(seed.unique.codec.encodeRun(seed.run));
 original.progression.awards.push({placementKey,areaId:'east',weaponId:flameId});
 original.supplies.issued.push(placementKey);
 // The generic shared model accepts zero-XP flame awards; migration must not.
 assert.ok(seed.progression.model.valid(original.progression));
 for(const version of[7,6,5,4]){
  const saved={...original,version};if(version<7)delete saved.uniqueReward;if(version<5)delete saved.expedition;
  const key=version===7?UNIQUE_REWARD_SAVE_KEY:version===6?AREA_BOSS_SAVE_KEY:version===5?EXPEDITION_SAVE_KEY:PROGRESSION_SAVE_KEY,raw=JSON.stringify(saved),f=fixture({records:new Map([[key,raw]])});
  assert.equal(f.restore().code,'invalid-save');assert.equal(f.save().ok,false);assert.equal(f.records.get(key),raw);assert.equal(f.records.has(FLAME_SAVE_KEY),false);
 }
 // Valid v8 can carry the same registered death and survives reload.
 const current={...original,version:8,flameFuel:{version:1,collected:true,fuelUnits:900}},f=fixture({records:new Map([[FLAME_SAVE_KEY,JSON.stringify(current)]])});assert.ok(f.restore().ok);assert.equal(f.run.progression.awards.length,1);
});
test('pickup is scoped, one-shot, quota atomic and reconciles retained Hale/mastery in one write',()=>{
 const f=fixture();assert.ok(f.restore().ok);f.scope(false);assert.equal(f.flamePickup().code,'not-eligible');f.scope(true);assert.ok(f.save().ok);assert.ok(f.kill());
 const raw=f.records.get(FLAME_SAVE_KEY),before=f.writes;f.quota(true);const denied=f.flamePickup();assert.equal(denied.code,'storage-unavailable');assert.deepEqual(denied.events,[]);assert.equal(f.run.flameFuel.collected,false);assert.equal(f.run.progression.awards.length,0);assert.equal(f.run.uniqueReward.status,'eligible');assert.equal(f.records.get(FLAME_SAVE_KEY),raw);
 f.quota(false);const result=f.flamePickup();assert.ok(result.ok);assert.equal(f.writes,before+2);assert.equal(f.run.flameFuel.fuelUnits,1000);assert.equal(f.run.uniqueReward.status,'pending');assert.equal(f.run.progression.awards.length,1);for(const type of['flame-pickup','unique-reward-drop','proficiency-gain'])assert.equal(result.events.filter(e=>e.type===type).length,1);
 const n=f.writes;assert.equal(f.flamePickup().code,'already-collected');assert.equal(f.writes,n);assert.equal(f.run.player.weapon,'knife');assert.equal(f.reads,1); // the earlier normal save only
});
test('active consumption commits before fuel event, quota exposes neither spend nor stale replay',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.ok(f.flamePickup().ok);const raw=f.records.get(FLAME_SAVE_KEY);f.quota(true);const denied=f.fire(1);assert.equal(denied.code,'storage-unavailable');assert.deepEqual(denied.events,[]);assert.equal(f.run.flameFuel.fuelUnits,1000);assert.equal(f.records.get(FLAME_SAVE_KEY),raw);
 f.quota(false);assert.ok(f.save().ok);assert.equal(f.run.flameFuel.fuelUnits,1000);const n=f.writes,result=f.fire(1);assert.ok(result.ok);assert.equal(f.writes,n+1);assert.deepEqual(result.events,[{type:'flame-fuel-spent',spent:100,activeSeconds:1,empty:false}]);assert.equal(JSON.parse(f.records.get(FLAME_SAVE_KEY)).flameFuel.fuelUnits,900);
 assert.deepEqual(f.save().events,[]);assert.equal(f.run.flameFuel.fuelUnits,900);assert.deepEqual(f.fire(8.5).events,[{type:'flame-fuel-spent',spent:850,activeSeconds:8.5,empty:false}]);assert.deepEqual(f.fire(1).events,[{type:'flame-fuel-spent',spent:50,activeSeconds:.5,empty:true}]);assert.equal(f.run.flameFuel.fuelUnits,0);assert.deepEqual(f.fire(1).events,[]);assert.equal(f.run.flameFuel.fuelUnits,0);
});
test('inactive, zero and invalid requests cannot spend or mutate; ordinary equip is delegated',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.equal(f.fire(1).ok,false);assert.ok(f.flamePickup().ok);for(const result of[f.fire(1,false),f.fire(0)]){assert.ok(result.ok);assert.deepEqual(result.events,[]);}assert.equal(f.run.flameFuel.fuelUnits,1000);
 for(const seconds of[-1,NaN,Infinity]){const raw=f.records.get(FLAME_SAVE_KEY),n=f.writes;assert.equal(f.fire(seconds).ok,false);assert.equal(f.records.get(FLAME_SAVE_KEY),raw);assert.equal(f.writes,n);assert.equal(f.run.flameFuel.fuelUnits,1000);}
 const reads=f.reads;assert.equal(f.core.dispatch({type:'equip',itemId:flameId,equipped:true}).code,'not-eligible');assert.equal(f.reads,reads);assert.equal(f.run.player.weapon,'knife');
});
test('Retry retains partially spent and empty fuel across fresh-owner swap, reload and repeated pickup',()=>{
 for(const seconds of[2,10]){
  const f=fixture();assert.ok(f.restore().ok);assert.ok(f.flamePickup().ok);assert.ok(f.fire(seconds).ok);assert.ok(f.kill());assert.ok(f.save().ok);const before=f.run,raw=f.records.get(FLAME_SAVE_KEY),expected={...f.run.flameFuel};f.quota(true);assert.equal(f.retry().ok,false);assert.equal(f.run,before);assert.equal(f.records.get(FLAME_SAVE_KEY),raw);f.quota(false);const reads=f.reads;assert.ok(f.retry().ok);assert.equal(f.reads,reads);assert.notEqual(f.run,before);assert.deepEqual(f.run.flameFuel,expected);assert.equal(f.run.progression.awards.length,0);assert.equal(f.run.enemies[0].hp,100);assert.equal(f.flamePickup().code,'already-collected');
  const loaded=fixture({records:f.records});assert.ok(loaded.restore().ok);assert.deepEqual(loaded.run.flameFuel,expected);assert.equal(loaded.run.player.weapon,'knife');assert.equal(loaded.flamePickup().code,'already-collected');
 }
});
test('consumption and retained death intent share one durable write; other commands retain fuel',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.ok(f.flamePickup().ok);assert.ok(f.kill());f.quota(true);assert.equal(f.fire(.2).ok,false);assert.equal(f.run.progression.awards.length,0);assert.equal(f.run.uniqueReward.status,'eligible');assert.equal(f.run.flameFuel.fuelUnits,1000);
 f.quota(false);const n=f.writes,result=f.fire(.2);assert.ok(result.ok);assert.equal(f.writes,n+1);const saved=JSON.parse(f.records.get(FLAME_SAVE_KEY));assert.equal(saved.flameFuel.fuelUnits,980);assert.equal(saved.progression.awards.length,1);assert.equal(saved.uniqueReward.status,'pending');assert.ok(saved.supplies.issued.includes(placementKey));assert.equal(result.events.filter(e=>e.type==='flame-fuel-spent').length,1);assert.equal(result.events.filter(e=>e.type==='unique-reward-drop').length,1);
 const reads=f.reads;assert.ok(f.pickup().ok);assert.ok(f.select(item).ok);assert.ok(f.select('knife').ok);assert.equal(f.reads,reads);assert.equal(f.run.flameFuel.fuelUnits,980);assert.equal(f.run.player.weapon,'knife');assert.equal(f.run.uniqueReward.selectedMeleeVariant,'knife');
});
