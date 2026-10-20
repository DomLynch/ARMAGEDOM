import{REAPER_ITEM_ID,reaperSelected}from'./reaper.js';
import{paidBossEquipmentDeath}from'./boss-weapon-runtime.js';
import{deathWeaponDescriptor}from'./weapon-credit-policy.js';
import {createProgressionModel,closedData,copyProgression} from './progression-state.js';
import {AREA1_SUPPLIES} from '../supplies.js';
import {DRONE_KEYS} from '../drone-mechanics.js';
const packetFields=['placementKey','areaId','weaponId','damageApplied'];
const envelopeFields=['version','pistol','hp','supplies','vest','droneDeaths','animalCycle','progression'];
export const PROGRESSION_SAVE_KEY='armagedom:progression-run:v4';
// Internal component only. The existing Core command door and IO remain sole owners.
export function createProgressionComponent({baseCodec,getRun,...options}){
 if(typeof getRun!=='function'||typeof baseCodec?.encodeRun!=='function'||typeof baseCodec?.restoreRun!=='function')throw TypeError('Existing codec/live authority required');
 const model=createProgressionModel(options);
 let owner=null;const pending=new Map();
 function sync(){const current=getRun();if(current!==owner){pending.clear();owner=current;}return current;}
 const currentState=run=>run.progression===undefined?model.freshState():run.progression;
 function recordDeath(run,packet){
  const current=sync();
  if(run!==current||!run||run.runSaveInvalid||!closedData(packet,packetFields)||!Number.isFinite(packet.damageApplied)||packet.damageApplied<=0||!model.hasPlacement(packet.placementKey,packet.areaId)||run.world?.areaId!==packet.areaId)return false;
  const state=currentState(run);if(!model.valid(state)||!deathWeaponDescriptor(packet.weaponId)||state.awards.some(r=>r.placementKey===packet.placementKey)||pending.has(packet.placementKey))return false;
  const victim=[...(run.enemies??[]),...(run.corpses??[])].find(e=>e.placementKey===packet.placementKey&&(e.areaId??packet.areaId)===packet.areaId);
  if(!victim||!Number.isFinite(victim.hp)||victim.hp>0||!Number.isFinite(victim.maxHP)||packet.damageApplied>victim.maxHP)return false;
  if(deathWeaponDescriptor(packet.weaponId).creditPolicy==='none'){if(packet.weaponId===REAPER_ITEM_ID){if(!reaperSelected(run)||run.reaper?.lastDamageTick!==run.tick||run.reaper.lastDamageTargetId!==victim.id||packet.damageApplied>run.reaper.lastDamageAmount)return false;}else if(Object.values(run.world.bossEquipmentData??{}).some(row=>row.itemId===packet.weaponId)){if(!paidBossEquipmentDeath(run,packet.weaponId))return false;}else if(run.world.rifleData?.itemId===packet.weaponId){if(run.player.weapon!=='rifle'||!run.rifle?.selected||run.rifleAction?.lastDamageTick!==run.tick||run.rifleAction?.paidTick!==run.tick||run.rifleAction?.paidRounds!==1)return false;}else if(run.world.flameData?.pickupId!==packet.weaponId||run.flame?.lastDamageTick!==run.tick||run.flame?.paidTick!==run.tick||!(run.flame.paidSeconds>0))return false;}
  else if(packet.weaponId==='knife'?run.player.weapon!=='knife':run.player.weapon!=='pistol'||!run.pistol?.collected||!run.pistol.equipped)return false;
  if(pending.size+state.awards.length>=model.placementCount)return false;
  pending.set(packet.placementKey,{placementKey:packet.placementKey,areaId:packet.areaId,weaponId:packet.weaponId});
  return true;
 }
 function coherent(state,supplies,droneDeaths,g){
  return state.awards.every(row=>{
   const loot=g.lootRules?Object.hasOwn(g.lootRules,row.placementKey):row.areaId==='westminster'&&Object.hasOwn(AREA1_SUPPLIES,row.placementKey);
   return (!loot||supplies?.issued.includes(row.placementKey))&&(!Object.hasOwn(DRONE_KEYS,row.placementKey)||droneDeaths?.includes(row.placementKey));
  });
 }
 const codec={
  RUN_SAVE_KEY:PROGRESSION_SAVE_KEY,
  get PISTOL_SAVE_KEY(){return baseCodec.PISTOL_SAVE_KEY;},
  get LEGACY_RUN_SAVE_KEY(){return baseCodec.RUN_SAVE_KEY;},
  encodeRun(g){
   const progression=currentState(g);
   if(!model.valid(progression)||g.player.maxHP!==model.maxHP(progression)||!coherent(progression,g.supplies,g.droneDeaths,g))throw TypeError('Invalid progression envelope');
   return JSON.stringify({...JSON.parse(baseCodec.encodeRun(g)),version:4,progression});
  },
  restoreRun(g,raw,legacyRaw){
   let saved;try{saved=raw==null?null:JSON.parse(raw);}catch{return null;}
   if(saved?.version===4){
    if(!closedData(saved,envelopeFields)||!model.valid(saved.progression)||![1,2].includes(saved.supplies?.version))return null;
    const progression=copyProgression(saved.progression),template={...g,player:{...g.player,maxHP:model.maxHP(progression)}};
    const oldRaw=JSON.stringify({...saved,version:saved.supplies.version===2?3:2});
    const restored=baseCodec.restoreRun(template,oldRaw,null);
    return restored&&coherent(progression,restored.supplies,restored.droneDeaths,g)?{...restored,progression}:null;
   }
   const restored=baseCodec.restoreRun(g,raw,legacyRaw);
   return restored?{...restored,progression:model.freshState()}:null;
  },
 };
 // F3's base snapshot must also cover the new progression DTO; never inherit it blindly.
 if(typeof baseCodec.captureRunState==='function'&&typeof baseCodec.isRunStateUnchanged==='function'){
  codec.captureRunState=g=>({base:baseCodec.captureRunState(g),progression:copyProgression(currentState(g))});
  codec.isRunStateUnchanged=(g,snapshot)=>baseCodec.isRunStateUnchanged(g,snapshot.base)&&model.sameState(currentState(g),snapshot.progression);
 }
 function wrapDomain(executeDomain){
  return (command,context)=>{
   const current=sync();let changed=false,invalid=false;const awarded=[];
   const result=executeDomain(command,{...context,writeRun(candidate){
    const fresh=command.type==='retry',state=fresh?model.freshState():currentState(current);
    if(!fresh&&candidate.progression!==undefined&&!model.sameState(candidate.progression,state)){invalid=true;return false;}
    const proposal=!fresh&&pending.size?model.award(state,[...pending.values()]):{state,events:[]};
    if(!context.writeRun({...candidate,progression:proposal.state}))return false;
    // Durable before live score/ledger or any actor-bearing domain grant.
    candidate.progression=proposal.state;
    if(!fresh){current.progression=proposal.state;changed ||= proposal.state.awards.length!==state.awards.length;awarded.push(...proposal.events);}
    pending.clear();return true;
   }});
   if(invalid)return {ok:false,code:'invalid-save',events:[]};
   if(result.ok&&command.type==='restore')pending.clear();
   return result.ok?{...result,changed:result.changed||changed,events:[...result.events,...awarded]}:result;
  };
 }
 function applySavedRun(g,saved){
  if(!model.valid(saved.progression))throw TypeError('Invalid restored progression');
  g.progression=copyProgression(saved.progression);g.player.maxHP=model.maxHP(g.progression);
  g.player.maxStamina=model.maxStamina(g.progression);
  baseCodec.applySavedRun(g,saved);
  // Web must also use deadPlacements at its shared resident initialization seam.
  const dead=new Set(model.deadPlacements(g.progression,g.world.areaId));
  g.enemies=g.enemies.filter(e=>!dead.has(e.placementKey));
  if(g.areaResidents){
   for(const key of [...(g.supplies?.issued??[]),...(g.droneDeaths??[])])if(model.hasPlacement(key,g.world.areaId))dead.add(key);
   g.kills=dead.size;g.encounterCleared=!g.enemies.length;g.encounterActive=!g.encounterCleared;}
 }
 function storageAdapter(storage){
  return !storage?storage:{getItem(key){const raw=storage.getItem(key);return key===PROGRESSION_SAVE_KEY&&raw==null?storage.getItem(codec.LEGACY_RUN_SAVE_KEY):raw;},setItem:(key,raw)=>storage.setItem(key,raw)};
 }
 return Object.freeze({model,codec:Object.freeze(codec),recordDeath,wrapDomain,applySavedRun,storageAdapter});
}
