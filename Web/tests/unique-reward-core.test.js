import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createRunOperation} from '../src/core/run-operation.js';
import {createProgressionComponent,PROGRESSION_SAVE_KEY} from '../src/engine/progression-core.js';
import {createExpeditionComponent,AREA_BOSS_SAVE_KEY,EXPEDITION_SAVE_KEY} from '../src/engine/expedition-core.js';
import {createUniqueRewardModel} from '../src/engine/unique-reward-state.js';
const {createUniqueRewardComponent,UNIQUE_REWARD_SAVE_KEY}=await import(process.env.UNIQUE_REWARD_CORE_URL??new URL('../src/engine/unique-reward-core.js',import.meta.url).href);
const item='hale-pitborn-cleaver-v1',placementKey='east-roamer-2',pistolId='westminster-start-pistol-v1';
const model=createUniqueRewardModel({placementKey,areaId:'east',itemId:item,baseVariantId:'knife',receiptId:placementKey+':'+item});
const rules={version:1,killScore:20,scoreCap:100,damagePerPoint:.001,hpPerVitality:2,staminaPerEndurance:1,damagePerAttribute:.01,weapons:{knife:{damageAttribute:'strength'},[pistolId]:{damageAttribute:'dexterity'}}};
const data={contract:{id:'west-east-stolen-supply-v1',rewardVariantId:'watchmans-pistol-v1',receiptId:'west-east-stolen-supply-v1:watchmans-pistol-v1',giver:{areaId:'westminster',position:{x:0,z:0},radius:1.3},case:{areaId:'east',position:{x:2,z:-3},radius:1.3}}};
function fixture({records=new Map(),legal=true}={}){
 let g,quota=false,scoped=true,writes=0,legalPoint=legal;
 const registry={ids:['westminster','east'],has:id=>['westminster','east'].includes(id)},world={areaId:'east',lineClear:()=>true};
 const fresh=()=>({world,time:10,finished:false,player:{hp:150,maxHP:150,maxStamina:100,weapon:'knife',pos:{x:2,z:-3},hurtUntil:0,dodgeUntil:0,swing:null},pistol:{collected:true,equipped:false,magazine:4,reserve:5,reloadingUntil:0,nextFireAt:3},supplies:{version:1,issued:[],pending:[],collected:[]},vest:{version:1,itemId:'westminster-worn-vest-v1',equipped:false},droneDeaths:[],animalCycle:'A',lootRules:{[placementKey]:{}},enemies:[{placementKey,areaId:'east',hp:100,maxHP:100,pos:{x:2,z:-3}}],corpses:[]});
 g=fresh();
 // Only the lowest combat codec is a fixture. Core/IO, progression, expedition
 // and this outer unique wrapper are the actual components in the real order.
 const combat={RUN_SAVE_KEY:'armagedom:area1-run:v1',PISTOL_SAVE_KEY:'armagedom:pistol:v1',
  encodeRun:run=>JSON.stringify({version:2,pistol:{...run.pistol},hp:run.player.hp,supplies:run.supplies,vest:run.vest,droneDeaths:run.droneDeaths,animalCycle:run.animalCycle}),
  restoreRun(template,raw,legacy){if(raw==null){const old=legacy==null?null:JSON.parse(legacy);return{pistol:old??template.pistol,hp:template.player.hp,supplies:template.supplies,vest:template.vest,droneDeaths:[],animalCycle:'A'};}try{const s=JSON.parse(raw);return s.version===2&&Number.isFinite(s.hp)&&s.hp>=0&&s.hp<=template.player.maxHP?s:null;}catch{return null;}},
  applySavedRun(run,saved){run.player.hp=saved.hp;run.pistol={...saved.pistol};run.player.weapon=run.pistol.equipped?'pistol':'knife';for(const k of['supplies','vest','droneDeaths','animalCycle'])run[k]=saved[k];},
  captureRunState:run=>JSON.stringify({hp:run.player.hp,pistol:run.pistol,supplies:run.supplies,vest:run.vest,droneDeaths:run.droneDeaths,animalCycle:run.animalCycle}),
  isRunStateUnchanged(run,snapshot){return this.captureRunState(run)===snapshot;},
 };
 const progression=createProgressionComponent({baseCodec:combat,getRun:()=>g,data:rules,placements:{east:[{key:placementKey}],westminster:[]}});
 const expedition=createExpeditionComponent({baseCodec:progression.codec,getRun:()=>g,data,registry,saveVersion:6,applyBaseSaved:progression.applySavedRun,baseStorageAdapter:progression.storageAdapter});
 const sourceDead=saved=>(saved.progression?.awards??[]).some(r=>r.placementKey===placementKey&&r.areaId==='east')||(saved.supplies?.issued??[]).includes(placementKey);
 const component=createUniqueRewardComponent({baseCodec:expedition.codec,getRun:()=>g,model,placementKey,areaId:'east',itemId:item,baseVariantId:'knife',applyBaseSaved:expedition.applySavedRun,baseStorageAdapter:expedition.storageAdapter,canDispatch:()=>scoped,sourceDead,validatedDropPosition:(run,corpse)=>legalPoint?{...corpse.pos}:null});
 const io=createRunStorage({codec:component.codec,storage:component.storageAdapter({getItem:key=>records.get(key)??null,setItem(key,raw){writes++;if(quota)throw Error('quota');records.set(key,raw);}})});
 const domain=createRunOperation({getRun:()=>g,setRun:next=>g=next,createFreshRun:fresh,applySavedRun:component.applySavedRun,claimPickup:()=>({ok:false,code:'not-eligible',events:[]}),equip:()=>({ok:false,code:'not-eligible',events:[]})});
 const core=createCore({executeDomain:component.wrapDomain(expedition.wrapDomain(progression.wrapDomain(domain))),codec:component.codec,readRun:()=>io.restore(g),writeRun:io.write});
 return{core,component,progression,expedition,combat,records,world,get run(){return g;},get writes(){return writes;},quota:value=>quota=value,scope:value=>scoped=value,legal:value=>legalPoint=value,
  save:()=>core.dispatch({type:'save'}),restore:()=>core.dispatch({type:'restore'}),retry:()=>core.dispatch({type:'retry'}),pickup:()=>core.dispatch({type:'claimPickup',pickupId:item}),select:variantId=>core.dispatch({type:'equip',itemId:variantId,equipped:true}),
  kill(){const victim=g.enemies.find(e=>e.placementKey===placementKey);victim.hp=0;if(!g.supplies.issued.includes(placementKey))g.supplies.issued.push(placementKey);return progression.recordDeath(g,{placementKey,areaId:'east',weaponId:'knife',damageApplied:20});},
 };
}
test('actual nested codecs fresh→v7 and v6 migration preserve exact old raw, absent-only',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);const v6=seed.expedition.codec.encodeRun(seed.run),records=new Map([[AREA_BOSS_SAVE_KEY,v6]]),f=fixture({records});
 assert.ok(f.restore().ok);assert.equal(f.run.uniqueReward.status,'eligible');assert.ok(f.save().ok);assert.equal(records.get(AREA_BOSS_SAVE_KEY),v6);assert.equal(JSON.parse(records.get(UNIQUE_REWARD_SAVE_KEY)).version,7);
 const reload=fixture({records});assert.ok(reload.restore().ok);assert.equal(reload.run.uniqueReward.status,'eligible');
});
test('v5, v4, combat v2 and pistol-only legacy read through existing adapter chain',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);
 for(const[key,raw]of [[EXPEDITION_SAVE_KEY,JSON.stringify({...JSON.parse(seed.expedition.codec.encodeRun(seed.run)),version:5})],[PROGRESSION_SAVE_KEY,seed.progression.codec.encodeRun(seed.run)],[seed.combat.RUN_SAVE_KEY,seed.combat.encodeRun(seed.run)],[seed.combat.PISTOL_SAVE_KEY,JSON.stringify(seed.run.pistol)]]){
  const f=fixture({records:new Map([[key,raw]])});assert.ok(f.restore().ok,key);assert.ok(f.save().ok,key);assert.equal(f.records.get(key),raw);assert.equal(f.run.uniqueReward.status,'eligible');
 }
});
test('occupied bad v7 including disguised v6 never falls back; bad v6 migration also preserves raw',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);const v6=seed.expedition.codec.encodeRun(seed.run);
 for(const raw of['{bad',v6,JSON.stringify({...JSON.parse(seed.component.codec.encodeRun(seed.run)),uniqueReward:{...model.freshState(),selectedMeleeVariant:'unknown'}}),JSON.stringify({...JSON.parse(seed.component.codec.encodeRun(seed.run)),extra:1})]){
  const records=new Map([[AREA_BOSS_SAVE_KEY,v6],[UNIQUE_REWARD_SAVE_KEY,raw]]),f=fixture({records});assert.equal(f.restore().code,'invalid-save');assert.equal(f.save().ok,false);f.run.runSaveInvalid=true;assert.equal(f.retry().code,'invalid-save');assert.equal(records.get(UNIQUE_REWARD_SAVE_KEY),raw);assert.equal(records.get(AREA_BOSS_SAVE_KEY),v6);
 }
 const f=fixture({records:new Map([[AREA_BOSS_SAVE_KEY,'{broken']])});assert.equal(f.restore().code,'invalid-save');assert.equal(f.save().ok,false);assert.equal(f.records.has(UNIQUE_REWARD_SAVE_KEY),false);
});
test('actual progression retained death intent: one write commits mastery+issued ledger+pending, quota clears none',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.ok(f.save().ok);const raw=f.records.get(UNIQUE_REWARD_SAVE_KEY),n=f.writes;assert.equal(f.kill(),true);f.quota(true);
 assert.equal(f.save().code,'storage-unavailable');assert.equal(f.run.progression.awards.length,0);assert.equal(f.run.uniqueReward.status,'eligible');assert.equal(f.records.get(UNIQUE_REWARD_SAVE_KEY),raw);assert.equal(f.run.enemies[0].hp,0);
 f.quota(false);const result=f.save();assert.ok(result.ok);assert.equal(f.writes,n+2);const saved=JSON.parse(f.records.get(UNIQUE_REWARD_SAVE_KEY));assert.equal(saved.progression.awards.length,1);assert.ok(saved.supplies.issued.includes(placementKey));assert.equal(saved.uniqueReward.status,'pending');assert.equal(result.events.filter(e=>e.type==='unique-reward-drop').length,1);assert.equal(result.events.filter(e=>e.type==='proficiency-gain').length,1);
 assert.ok(f.save().ok);assert.equal(f.run.progression.awards.length,1);
});
test('illegal drop placement blocks complete write; same retained progression intent can recover legally',()=>{
 const f=fixture({legal:false});assert.ok(f.restore().ok);assert.ok(f.save().ok);const raw=f.records.get(UNIQUE_REWARD_SAVE_KEY);assert.ok(f.kill());assert.equal(f.save().ok,false);assert.equal(f.records.get(UNIQUE_REWARD_SAVE_KEY),raw);assert.equal(f.run.progression.awards.length,0);assert.equal(f.run.uniqueReward.status,'eligible');f.legal(true);assert.ok(f.save().ok);assert.equal(f.run.uniqueReward.status,'pending');
});
test('old dead Hale migrates without reward/resurrection, then real new Retry kill can earn once',()=>{
 const seed=fixture();assert.ok(seed.restore().ok);assert.ok(seed.kill());assert.ok(seed.save().ok);const old=seed.expedition.codec.encodeRun(seed.run),f=fixture({records:new Map([[AREA_BOSS_SAVE_KEY,old]])});
 assert.ok(f.restore().ok);assert.equal(f.run.uniqueReward.status,'legacy-dead');assert.equal(f.run.enemies.length,0);assert.equal(f.pickup().ok,false);assert.ok(f.save().ok);assert.equal(f.run.uniqueReward.status,'legacy-dead');assert.ok(f.retry().ok);assert.equal(f.run.uniqueReward.status,'legacy-dead');assert.ok(f.kill());assert.ok(f.save().ok);assert.equal(f.run.uniqueReward.status,'pending');assert.equal(f.records.get(AREA_BOSS_SAVE_KEY),old);
});
test('pending reload/reentry and Retry retain one saved position; owned never reissues on a new kill',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.ok(f.kill());assert.ok(f.save().ok);const position={...f.run.uniqueReward.dropPosition};
 const loaded=fixture({records:f.records});assert.ok(loaded.restore().ok);assert.deepEqual(loaded.run.uniqueReward.dropPosition,position);loaded.world.areaId='westminster';assert.equal(loaded.pickup().ok,false);loaded.world.areaId='east';assert.ok(loaded.retry().ok);assert.deepEqual(loaded.run.uniqueReward.dropPosition,position);assert.ok(loaded.kill());assert.ok(loaded.save().ok);assert.equal(loaded.run.uniqueReward.status,'pending');assert.ok(loaded.pickup().ok);assert.ok(loaded.retry().ok);assert.ok(loaded.kill());assert.ok(loaded.save().ok);assert.equal(loaded.run.uniqueReward.status,'owned');
});
test('pickup validates scoped owner, alive, area, proximity, LOS and action state, then commits ownership once',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.ok(f.kill());assert.ok(f.save().ok);
 for(const [set,clear]of [[()=>f.scope(false),()=>f.scope(true)],[()=>f.run.player.hp=0,()=>f.run.player.hp=150],[()=>f.world.areaId='westminster',()=>f.world.areaId='east'],[()=>f.run.player.pos={x:9,z:9},()=>f.run.player.pos={x:2,z:-3}],[()=>f.world.lineClear=()=>false,()=>f.world.lineClear=()=>true],[()=>f.run.player.swing={},()=>f.run.player.swing=null],[()=>f.run.player.hurtUntil=11,()=>f.run.player.hurtUntil=0],[()=>f.run.player.dodgeUntil=11,()=>f.run.player.dodgeUntil=0]]){set();assert.equal(f.pickup().ok,false);clear();}
 const raw=f.records.get(UNIQUE_REWARD_SAVE_KEY);f.quota(true);assert.equal(f.pickup().code,'storage-unavailable');assert.equal(f.run.uniqueReward.status,'pending');assert.equal(f.records.get(UNIQUE_REWARD_SAVE_KEY),raw);f.quota(false);assert.ok(f.pickup().ok);assert.equal(f.run.uniqueReward.status,'owned');assert.equal(f.run.uniqueReward.selectedMeleeVariant,'knife');assert.equal(f.pickup().code,'already-collected');
});
test('safe explicit equip preserves player identity, all ammo/reload/shot clocks, and writes selection in F3',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.equal(f.select(item).ok,false);assert.ok(f.kill());assert.ok(f.save().ok);assert.ok(f.pickup().ok);f.run.pistol={...f.run.pistol,equipped:true,reloadingUntil:13,nextFireAt:14};f.run.player.weapon='pistol';const before={...f.run.pistol},player=f.run.player;
 f.run.player.swing={};assert.equal(f.select(item).ok,false);f.run.player.swing=null;f.quota(true);assert.equal(f.select(item).code,'storage-unavailable');assert.deepEqual(f.run.pistol,before);assert.equal(f.run.player.weapon,'pistol');f.quota(false);assert.ok(f.select(item).ok);assert.equal(f.run.player,player);assert.deepEqual(f.run.pistol,{...before,equipped:false});assert.equal(f.run.player.weapon,'knife');
 const loaded=fixture({records:f.records});assert.ok(loaded.restore().ok);assert.equal(loaded.run.uniqueReward.selectedMeleeVariant,item);assert.ok(f.select('knife').ok);assert.equal(JSON.parse(f.records.get(UNIQUE_REWARD_SAVE_KEY)).uniqueReward.selectedMeleeVariant,'knife');
 assert.equal(f.core.dispatch({type:'equip',itemId:item,equipped:false}).ok,false);
});
test('failed Retry preserves run/raw; successful Retry retains selected gear but resets old mastery/combat',()=>{
 const f=fixture();assert.ok(f.restore().ok);assert.ok(f.kill());assert.ok(f.save().ok);assert.ok(f.pickup().ok);assert.ok(f.select(item).ok);const before=f.run,raw=f.records.get(UNIQUE_REWARD_SAVE_KEY);f.quota(true);assert.equal(f.retry().ok,false);assert.equal(f.run,before);assert.equal(f.records.get(UNIQUE_REWARD_SAVE_KEY),raw);f.quota(false);assert.ok(f.retry().ok);assert.equal(f.run.progression.awards.length,0);assert.equal(f.run.uniqueReward.selectedMeleeVariant,item);assert.equal(f.run.uniqueReward.status,'owned');assert.equal(f.run.enemies[0].hp,100);
});
