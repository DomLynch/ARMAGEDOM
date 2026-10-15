import {createExpeditionComponent} from './expedition-core.js';
import {captureRunState,isRunStateUnchanged} from './run-save-state.js';
import {createProgressionComponent} from './progression-core.js';
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
 let component=null,wrappedDomain=null,expeditionComponent=null,expeditionDomain=null,expeditionScope=null;
 function progression(){
  const g=getRun();if(!g?.progressionModel)return null;
  if(!component){component=createProgressionComponent({baseCodec:selectedCodec,getRun,...progressionOptions(g)});wrappedDomain=component.wrapDomain(executeDomain);}
  for(const packet of g.pendingProgressionDeaths??[])component.recordDeath(g,packet);g.pendingProgressionDeaths=[];
  return component;
 }
 function expedition(){
  const g=getRun();if(!g?.world.expeditionData)return null;
  const p=progression();if(!p)throw TypeError('Expedition requires registered progression');
  if(!expeditionComponent){expeditionComponent=createExpeditionComponent({baseCodec:p.codec,getRun,data:g.world.expeditionData,registry:g.world.registry,
   applyBaseSaved:(run,saved)=>p.applySavedRun(run,saved),baseStorageAdapter:storage=>p.storageAdapter(storage),canDispatch:run=>expeditionScope?.run===run&&expeditionScope.allowed});
   expeditionDomain=expeditionComponent.wrapDomain(wrappedDomain);}
  return expeditionComponent;
 }
 const stateComponent=()=>expedition()??progression();
 const activeCodec={...selectedCodec,captureRunState(g){return(stateComponent()?.codec??selectedCodec).captureRunState(g);},isRunStateUnchanged(g,snapshot){return(stateComponent()?.codec??selectedCodec).isRunStateUnchanged(g,snapshot);},get RUN_SAVE_KEY(){return stateComponent()?.codec.RUN_SAVE_KEY??selectedCodec.RUN_SAVE_KEY;},encodeRun(g){return(stateComponent()?.codec??selectedCodec).encodeRun(g);},restoreRun(...args){return(stateComponent()?.codec??selectedCodec).restoreRun(...args);}};
 const activeStorage=!selectedStorage?selectedStorage:{getItem(key){return(stateComponent()?.storageAdapter(selectedStorage)??selectedStorage).getItem(key);},setItem:(key,raw)=>selectedStorage.setItem(key,raw)};
 let supplyScope=null;
 const supplyPickup=createPickupOperation({getRun,collectSupply,collectVest,vestRules:VEST_RULES,vestBagPosition:codec.VEST_BAG_POSITION,collectGearSupply,gearItems:GEAR_ITEMS,grantPistol,grantVest,canCollectGear:g=>supplyScope?.run===g&&supplyScope.allowed});
 let pistolScope=null;
 const pistolOperation=createPistolOperation({getRun,collectPistol,equipPistol,grantPistol,canAct:g=>pistolScope?.run===g&&pistolScope.allowed});
 const claimPickup=(command,context)=>command.pickupId===PISTOL_ITEM_ID?pistolOperation(command,context):supplyPickup(command,context);
 const executeDomain=createRunOperation({getRun,setRun,createFreshRun(){const candidate=createFreshRun(),e=expedition();if(e&&candidate&&candidate!==getRun())candidate.expedition=e.model.copy(getRun().expedition??e.model.freshState());return candidate;},applySavedRun(g,saved){const p=stateComponent();if(p)p.applySavedRun(g,saved);else codec.applySavedRun(g,saved);},claimPickup,equip:pistolOperation});
 const io=createRunStorage({storage:activeStorage,codec:activeCodec});
 const core=createCore({executeDomain(command,context){return expedition()?expeditionDomain(command,context):progression()?wrappedDomain(command,context):executeDomain(command,context);},
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
 function persistRun(g){
  if(g!==getRun()||g.runSaveInvalid)return false;
  const result=core.dispatch({type:'save'});if(!result.ok)unavailable(g);else for(const event of result.events)g.events.push({...event,actor:g.player});return result.ok;
 }
 function restoreSavedRun(g){
  const result=core.dispatch({type:'restore'});
  if(!result.ok){
   g.runSaveInvalid=true;
   if(result.code==='invalid-save'){g.supplies=null;g.player.hp=0;g.finished=true;g.message='Saved run invalid. Retry to start fresh.';g.messageUntil=5;}
   else{g.message='Run saving unavailable. Supplies kept.';g.messageUntil=5;}
  }
  persistRun(g);
 }
 function retry(){return core.dispatch({type:'retry'}).ok;}
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
 return {persistRun,restoreSavedRun,retry,collectNearbySupplies,collectNearbyVest,dispatchPistol,dispatchExpedition};
}
