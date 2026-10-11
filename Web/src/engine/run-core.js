import {createCore} from '../core/index.js';
import {createRunStorage} from '../core/io/local-run-storage.js';
import {createPickupOperation} from '../core/pickup-operation.js';
import {createRunOperation} from '../core/run-operation.js';
import * as codec from './run-state.js';
import {collectSupply} from '../supplies.js';
import {collectVest,VEST_RULES} from '../vest.js';

// One session writer; render/input code supplies live-run access and fresh construction.
export function createRunPersistence({getRun,setRun,createFreshRun,storage}){
 const io=createRunStorage({storage,codec});
 const claimPickup=createPickupOperation({getRun,collectSupply,collectVest,vestRules:VEST_RULES,vestBagPosition:codec.VEST_BAG_POSITION});
 const core=createCore({executeDomain:createRunOperation({getRun,setRun,createFreshRun,applySavedRun:codec.applySavedRun,claimPickup}),
  codec,readRun:()=>io.restore(getRun()),writeRun:(candidate,options)=>io.write(candidate,options)});
 function unavailable(g){g.message='Run saving unavailable. Supplies kept.';g.messageUntil=g.time+5;}
 function persistRun(g){
  if(g!==getRun()||g.runSaveInvalid)return false;
  const result=core.dispatch({type:'save'});if(!result.ok)unavailable(g);return result.ok;
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
 function collectNearbySupplies(g){
  if(!g.supplies||g.runSaveInvalid||g.finished)return;
  for(const drop of g.supplies.pending.slice()){
   const result=core.dispatch({type:'claimPickup',pickupId:drop.id});
   if(result.ok){for(const event of result.events){g.events.push({...event});g.message=event.kind==='rounds'?`Scavenged ${event.amount} spare rounds.`:`Dressing restored ${Math.ceil(event.amount)} health.`;g.messageUntil=g.time+3;}}
   else if(result.code==='storage-unavailable'){unavailable(g);}
   else if(result.code==='not-eligible'){
    const {reason}=collectSupply(g.supplies,{dropId:drop.id,areaId:g.world.areaId,position:g.player.pos,
     resources:{hp:g.player.hp,maxHP:g.player.maxHP,pistolOwned:g.pistol.collected,reserve:g.pistol.reserve},lineClear:(a,b)=>g.world.lineClear(a,b)});
    if(['pistol-required','reserve-full','health-full'].includes(reason)){
     const notice=drop.id+reason;if(g.supplyNotice===notice&&g.time<g.supplyNoticeUntil)continue;
     g.supplyNotice=notice;g.supplyNoticeUntil=g.time+4;g.message={'pistol-required':'Collect the pistol first. Rounds kept.','reserve-full':'Spare rounds full. Supply kept.','health-full':'Health full. Dressing kept.'}[reason];g.messageUntil=g.time+2;
    }
   }
  }
 }
 function collectNearbyVest(g){
  if(!g.vest||g.runSaveInvalid||g.finished)return;
  const result=core.dispatch({type:'claimPickup',pickupId:VEST_RULES.itemId});
  if(!result.ok){if(result.code==='storage-unavailable')unavailable(g);return;}
  for(const event of result.events)g.events.push({...event,actor:g.player});
  g.message='Worn vest equipped · 10% protection from unblocked hits.';g.messageUntil=g.time+4;
 }
 return {persistRun,restoreSavedRun,retry,collectNearbySupplies,collectNearbyVest};
}
