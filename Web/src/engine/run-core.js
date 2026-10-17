import{deathWeaponDescriptor}from'./weapon-credit-policy.js';
import{FLAME_SAVE_KEY,createFlameComponent}from'./flame-core.js';
import{createFlameFuelModel}from'./flame-fuel-state.js';
import{syncMeleeEquipment}from'../melee-equipment.js';
import{createUniqueRewardModel}from'./unique-reward-state.js';
import{UNIQUE_REWARD_SAVE_KEY,createUniqueRewardComponent}from'./unique-reward-core.js';
import{uniqueRewardSourceDead,uniqueRewardDropPosition}from'./unique-reward-runtime.js';
import {EXPEDITION_SAVE_KEY,AREA_BOSS_SAVE_KEY,createExpeditionComponent} from './expedition-core.js';
import {captureRunState,isRunStateUnchanged} from './run-save-state.js';
import {PROGRESSION_SAVE_KEY,createProgressionComponent} from './progression-core.js';
import {progressionOptions} from './progression-runtime.js';
import {createCore} from '../core/index.js';
import {createRunStorage} from '../core/io/local-run-storage.js';
import {createPickupOperation} from '../core/pickup-operation.js';
import {createRunOperation} from '../core/run-operation.js';
import {createPistolOperation,PISTOL_ITEM_ID} from '../core/pistol-operation.js';
import * as codec from './run-state.js';
import {collectSupply,hasExtendedLoot,collectGearSupply,GEAR_ITEMS} from '../supplies.js';
import {collectVest,VEST_RULES,grantVest} from '../vest.js';
import {collectPistol,equipPistol,grantPistol} from '../pistol.js';

// One session writer; render/input code supplies live-run access and fresh construction.
export function createRunPersistence({getRun,setRun,createFreshRun,storage}){
 const extendedKey='armagedom:area-run:v3';
 const selectedCodec={...codec,captureRunState,isRunStateUnchanged,get RUN_SAVE_KEY(){return hasExtendedLoot(getRun()?.lootRules)?extendedKey:codec.RUN_SAVE_KEY;}};
 // Evaluate context at IO time: browser persistence is created before the game loads.
 const selectedStorage=!storage?storage:{getItem(name){const raw=storage.getItem(name);return name===extendedKey&&raw==null?storage.getItem(codec.RUN_SAVE_KEY):raw;},setItem(name,raw){storage.setItem(name,raw);}};
 let flameComponent=null,flameDomain=null,flameScope=null,lastFuelOwner=null,lastFuelTick=-1;
 let component=null,wrappedDomain=null,expeditionComponent=null,expeditionDomain=null,expeditionScope=null,uniqueComponent=null,uniqueDomain=null,uniqueScope=null;
 function progression(){
  const g=getRun();if(!g?.progressionModel)return null;
  if(!component){component=createProgressionComponent({baseCodec:selectedCodec,getRun,...progressionOptions(g)});wrappedDomain=component.wrapDomain(executeDomain);}
  for(const packet of g.pendingProgressionDeaths??[])component.recordDeath(g,packet);g.pendingProgressionDeaths=[];
  return component;
 }
 function expedition(){
  const g=getRun();if(!g?.world.expeditionData)return null;
  const p=progression();if(!p)throw TypeError('Expedition requires registered progression');
  if(!expeditionComponent){const options=progressionOptions(g),bossKeys=new Set(Object.values(g.world.residentPlacements??{}).flat().filter(row=>row.bossRef).map(row=>row.key));
   expeditionComponent=createExpeditionComponent({baseCodec:p.codec,getRun,data:g.world.expeditionData,registry:g.world.registry,
   saveVersion:g.world.bossData?6:5,previousPlacementIds:g.world.bossData?Object.values(options.placements).flat().map(row=>row.key).filter(key=>!bossKeys.has(key)):null,applyBaseSaved:(run,saved)=>p.applySavedRun(run,saved),baseStorageAdapter:storage=>p.storageAdapter(storage),canDispatch:run=>expeditionScope?.run===run&&expeditionScope.allowed});
   expeditionDomain=expeditionComponent.wrapDomain(wrappedDomain);}
  return expeditionComponent;
 }
 function uniqueReward(){
  const g=getRun(),data=g?.world.uniqueRewardData;if(!data)return null;
  const base=expedition();if(!base||!g.world.bossData)throw TypeError('Unique equipment requires registered v6 run');
  if(!uniqueComponent){const model=createUniqueRewardModel(data);uniqueComponent=createUniqueRewardComponent({baseCodec:base.codec,getRun,model,...data,applyBaseSaved:(run,saved)=>base.applySavedRun(run,saved),baseStorageAdapter:storage=>base.storageAdapter(storage),canDispatch:run=>uniqueScope?.run===run&&uniqueScope.allowed,validatedDropPosition:uniqueRewardDropPosition,sourceDead:saved=>uniqueRewardSourceDead(saved,data)});uniqueDomain=uniqueComponent.wrapDomain(expeditionDomain);}
  return uniqueComponent;
 }
 function flame(){
  const g=getRun(),data=g?.world.flameData;if(!data)return null;
  const base=uniqueReward();if(!base)throw TypeError('Flame requires registered v7 run');
  if(!flameComponent){flameComponent=createFlameComponent({baseCodec:base.codec,getRun,model:createFlameFuelModel(data),unitsPerSecond:data.unitsPerSecond,applyBaseSaved:(run,saved)=>base.applySavedRun(run,saved),baseStorageAdapter:storage=>base.storageAdapter(storage),
   canPickup:run=>{const p=run.player;return flameScope?.run===run&&flameScope.allowed&&p.hp>0&&!run.finished&&!run.runSaveInvalid&&!p.swing&&run.time>=p.hurtUntil&&run.time>=p.dodgeUntil&&run.world.areaId===data.areaId&&Math.hypot(p.pos.x-data.position.x,p.pos.z-data.position.z)<=data.pickupRadius+1e-8&&run.world.lineClear(p.pos,data.position);},
   getConsumption:run=>flameScope?.run===run&&flameScope.allowed?flameScope.request:null});flameDomain=flameComponent.wrapDomain(uniqueDomain);}
  return flameComponent;
 }
 const stateComponent=()=>flame()??uniqueReward()??expedition()??progression();
 const activeCodec={...selectedCodec,captureRunState(g){return(stateComponent()?.codec??selectedCodec).captureRunState(g);},isRunStateUnchanged(g,snapshot){return(stateComponent()?.codec??selectedCodec).isRunStateUnchanged(g,snapshot);},get RUN_SAVE_KEY(){return stateComponent()?.codec.RUN_SAVE_KEY??selectedCodec.RUN_SAVE_KEY;},encodeRun(g){return(stateComponent()?.codec??selectedCodec).encodeRun(g);},restoreRun(...args){try{const raw=args[1]==null?null:JSON.parse(args[1]);if(raw?.version<=7&&(raw.progression?.awards??[]).some(row=>deathWeaponDescriptor(row.weaponId)?.creditPolicy==='none'))return null;}catch{return null;}return(stateComponent()?.codec??selectedCodec).restoreRun(...args);}};
 const activeStorage=!selectedStorage?selectedStorage:{getItem(key){return(stateComponent()?.storageAdapter(selectedStorage)??selectedStorage).getItem(key);},setItem:(key,raw)=>selectedStorage.setItem(key,raw)};
 let supplyScope=null;
 const supplyPickup=createPickupOperation({getRun,collectSupply,collectVest,vestRules:VEST_RULES,vestBagPosition:codec.VEST_BAG_POSITION,collectGearSupply,gearItems:GEAR_ITEMS,grantPistol,grantVest,canCollectGear:g=>supplyScope?.run===g&&supplyScope.allowed});
 let pistolScope=null;
 const pistolOperation=createPistolOperation({getRun,collectPistol,equipPistol,grantPistol,canAct:g=>pistolScope?.run===g&&pistolScope.allowed});
 const claimPickup=(command,context)=>command.pickupId===PISTOL_ITEM_ID?pistolOperation(command,context):supplyPickup(command,context);
 const executeDomain=createRunOperation({getRun,setRun,createFreshRun({reset=false}={}){const candidate=createFreshRun({reset}),e=expedition();if(!reset&&e&&candidate&&candidate!==getRun())candidate.expedition=e.model.copy(getRun().expedition??e.model.freshState());return candidate;},applySavedRun(g,saved){const p=stateComponent();if(p)p.applySavedRun(g,saved);else codec.applySavedRun(g,saved);if(g.world.uniqueRewardData)syncMeleeEquipment(g);},claimPickup,equip:pistolOperation});
 const io=createRunStorage({storage:activeStorage,codec:activeCodec,resetSnapshot(){
  const keys=[FLAME_SAVE_KEY,UNIQUE_REWARD_SAVE_KEY,AREA_BOSS_SAVE_KEY,EXPEDITION_SAVE_KEY,PROGRESSION_SAVE_KEY,extendedKey,codec.RUN_SAVE_KEY,codec.PISTOL_SAVE_KEY],records=Object.fromEntries(keys.map(key=>[key,storage.getItem(key)]));
  let liveRaw=null;try{liveRaw=activeCodec.encodeRun(getRun());}catch{/* Unreadable originals remain verbatim in records. */}
  return{records,liveRaw};
 }});
 const core=createCore({executeDomain(command,context){if(command.type==='reset')return executeDomain(command,context);return flame()?flameDomain(command,context):uniqueReward()?uniqueDomain(command,context):expedition()?expeditionDomain(command,context):progression()?wrappedDomain(command,context):executeDomain(command,context);},
  codec:activeCodec,readRun:()=>io.restore(getRun()),writeRun:(candidate,options)=>io.write(candidate,options)});
 function unavailable(g){g.message='Run saving unavailable. Supplies kept.';g.messageUntil=g.time+5;}
 function dispatchPistol(g,command,canAct){
  if(g!==getRun()||pistolScope)return {ok:false,code:'not-eligible',events:[]};
  pistolScope={run:g,allowed:canAct===true};
  try{const result=core.dispatch(command);if(!result.ok&&result.code==='storage-unavailable')unavailable(g);return result;}
  finally{pistolScope=null;}
 }
 function dispatchExpedition(g,command,allowed){
  if(g!==getRun()||expeditionScope)return {ok:false,code:'not-eligible',events:[]};
  expeditionScope={run:g,allowed:allowed===true};
  try{const result=core.dispatch(command);if(!result.ok&&result.code==='storage-unavailable'){g.message='Saving unavailable. Contract and equipment kept.';g.messageUntil=g.time+5;}return result;}
  finally{expeditionScope=null;}
 }
 function dispatchUniqueReward(g,command,allowed){
  if(g!==getRun()||uniqueScope||!uniqueReward())return{ok:false,code:'not-eligible',events:[]};
  uniqueScope={run:g,allowed:allowed===true};
  try{const result=core.dispatch(command);if(result.ok&&g.world.uniqueRewardData)syncMeleeEquipment(g);if(!result.ok&&result.code==='storage-unavailable'){g.message='Saving unavailable. Equipment kept.';g.messageUntil=g.time+5;}return result;}
  finally{uniqueScope=null;}
 }
 function dispatchFlame(g,command,request=null,allowed=false){
  if(g!==getRun()||flameScope||!flame())return{ok:false,code:'not-eligible',events:[]};
  if(lastFuelOwner!==g){lastFuelOwner=g;lastFuelTick=-1;}
  if(request&&(request.active!==true||!Number.isFinite(request.seconds)||Math.abs(request.seconds-1/60)>1e-8||lastFuelTick===g.tick||!Number.isInteger(g.tick)||!g.flame?.equipped||g.player.hp<=0||g.finished||g.runSaveInvalid||g.player.swing||g.time<g.player.ready||g.time<g.player.hurtUntil||g.time<g.player.dodgeUntil))return{ok:false,code:'not-eligible',events:[]};
  flameScope={run:g,request,allowed:allowed===true};
  try{const result=core.dispatch(command);if(result.ok&&result.events.some(e=>e.type==='flame-fuel-spent'))lastFuelTick=g.tick;if(!result.ok&&result.code==='storage-unavailable')unavailable(g);return result;}
  finally{flameScope=null;}
 }
 function persistRun(g){
  if(g!==getRun()||g.runSaveInvalid)return false;
  const result=core.dispatch({type:'save'});if(!result.ok)unavailable(g);else for(const event of result.events)g.events.push({...event,actor:g.player});return result.ok;
 }
 function restoreSavedRun(g){
  const result=core.dispatch({type:'restore'});
  if(!result.ok){
   g.runSaveInvalid=true;
   if(result.code==='invalid-save'){g.supplies=null;g.player.hp=0;g.finished=true;g.message=expedition()?'Saved run invalid. Original kept; recover it before retrying.':'Saved run invalid. Retry to start fresh.';g.messageUntil=5;}
   else{g.message='Run saving unavailable. Supplies kept.';g.messageUntil=5;}
  }
  persistRun(g);
 }
 function resetRun(){return core.dispatch({type:'reset'});}
 function retry(){const result=core.dispatch({type:'retry'});if(result.ok&&getRun().world.uniqueRewardData)syncMeleeEquipment(getRun());return result.ok;}
 function collectNearbySupplies(g,intent={}){
  const p=g.player;
  supplyScope={run:g,allowed:p.hp>0&&!g.finished&&!intent.cancel&&!intent.dodge&&!p.swing&&g.time>=p.hurtUntil&&g.time>=p.dodgeUntil};
  try{
  if(!g.supplies||g.runSaveInvalid||g.finished)return;
  for(const drop of g.supplies.pending.slice()){
   const result=core.dispatch({type:'claimPickup',pickupId:drop.id});
   if(result.ok){for(const event of result.events){g.events.push(event.type==='vest-pickup'?{...event,actor:g.player}:{...event});if(event.type!=='supply-pickup')continue;g.message=event.kind==='westminster-start-pistol-v1'?'Pistol collected and equipped.':event.kind==='westminster-worn-vest-v1'?'Worn vest equipped · 10% protection.':event.kind==='rounds'?`Scavenged ${event.amount} spare rounds.`:`Dressing restored ${Math.ceil(event.amount)} health.`;g.messageUntil=g.time+3;}}
   else if(result.code==='storage-unavailable'){unavailable(g);}
   else if(result.code==='not-eligible'){
    const {reason}=collectSupply(g.supplies,{dropId:drop.id,areaId:g.world.areaId,position:g.player.pos,
     rules:g.lootRules,resources:{hp:g.player.hp,maxHP:g.player.maxHP,pistolOwned:g.pistol.collected,reserve:g.pistol.reserve},lineClear:(a,b)=>g.world.lineClear(a,b)});
    if(['pistol-required','reserve-full','health-full'].includes(reason)){
     const notice=drop.id+reason;if(g.supplyNotice===notice&&g.time<g.supplyNoticeUntil)continue;
     g.supplyNotice=notice;g.supplyNoticeUntil=g.time+4;g.message={'pistol-required':'Collect the pistol first. Rounds kept.','reserve-full':'Spare rounds full. Supply kept.','health-full':'Health full. Dressing kept.'}[reason];g.messageUntil=g.time+2;
    }
   }
  }
  }finally{supplyScope=null;}
 }
 function collectNearbyVest(g){
  if(!g.vest||g.runSaveInvalid||g.finished)return;
  const result=core.dispatch({type:'claimPickup',pickupId:VEST_RULES.itemId});
  if(!result.ok){if(result.code==='storage-unavailable')unavailable(g);return;}
  for(const event of result.events)g.events.push({...event,actor:g.player});
  g.message='Worn vest equipped · 10% protection from unblocked hits.';g.messageUntil=g.time+4;
 }
 return {persistRun,restoreSavedRun,retry,resetRun,readResetBackup:()=>io.readResetBackup(),collectNearbySupplies,collectNearbyVest,dispatchPistol,dispatchExpedition,dispatchUniqueReward,dispatchFlame};
}
