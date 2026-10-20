import{REAPER_ITEM_ID,ownsReaper}from'./reaper.js';
import {freeze} from './content-schema.js';
import {closedData} from './progression-state.js';
import {createExpeditionModel} from './expedition-state.js';
import {PISTOL_ITEM_ID} from '../core/pistol-operation.js';
import {PISTOL_RULES} from '../pistol.js';
export const EXPEDITION_SAVE_KEY='armagedom:expedition-run:v5';
export const AREA_BOSS_SAVE_KEY='armagedom:area-boss-run:v6';
const envelope=['version','pistol','hp','supplies','vest','droneDeaths','animalCycle','progression','expedition'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const same=(a,b)=>a.version===b.version&&a.status===b.status&&a.rewardReceipt===b.rewardReceipt&&a.selectedPistolVariant===b.selectedPistolVariant&&a.visitedIds.length===b.visitedIds.length&&a.visitedIds.every((id,i)=>id===b.visitedIds[i]);
export function expeditionModel(data,registry){return createExpeditionModel({areaIds:registry.ids,expeditionId:data.contract.id,rewardVariantId:data.contract.rewardVariantId,baseVariantId:PISTOL_ITEM_ID,receiptId:data.contract.receiptId});}
export function validateExpeditionData(input,registry){
 if(input===undefined)return null;
 const fail=()=>{throw TypeError('Invalid expedition catalogue');};
 const exact=(v,keys)=>{if(!closedData(v,keys))fail();};
 const text=v=>typeof v==='string'&&v.length>0&&v.length<=160;
 exact(input,['version','contract','variants','atlas']);if(input.version!==1)fail();const c=input.contract;
 exact(c,['id','title','summary','giver','case','guard','rewardVariantId','receiptId']);if(![c.id,c.title,c.summary,c.rewardVariantId,c.receiptId].every(text)||c.rewardVariantId===PISTOL_ITEM_ID)fail();
 for(const anchor of[c.giver,c.case]){exact(anchor,['areaId','position','radius']);exact(anchor.position,['x','z']);if(!registry.has(anchor.areaId)||!Object.values(anchor.position).every(Number.isFinite)||anchor.radius!==1.3)fail();}
 exact(c.guard,['areaId','placementKey','name']);if(!registry.has(c.guard.areaId)||!text(c.guard.placementKey)||!text(c.guard.name)||c.guard.areaId!==c.case.areaId)fail();
 exact(input.variants,[PISTOL_ITEM_ID,c.rewardVariantId]);
 for(const[id,row]of Object.entries(input.variants)){exact(row,['name','damage','reload','tint']);if(!text(row.name)||!Number.isFinite(row.damage)||row.damage<1||row.damage>40||!Number.isFinite(row.reload)||row.reload<1||row.reload>3||!Number.isInteger(row.tint)||row.tint<0||row.tint>0xffffff)fail();if(id===PISTOL_ITEM_ID&&(row.damage!==PISTOL_RULES.damage||row.reload!==PISTOL_RULES.reload))fail();}
 exact(input.atlas,registry.ids);const cells=new Set();for(const node of Object.values(input.atlas)){exact(node,['column','row']);if(!Number.isInteger(node.column)||node.column<0||node.column>3||!Number.isInteger(node.row)||node.row<0||node.row>1||cells.has(node.column+':'+node.row))fail();cells.add(node.column+':'+node.row);}
 expeditionModel(input,registry);return freeze(structuredClone(input));
}
export function expeditionEligible(g,action,data){
 const p=g.player;if(!p||p.hp<=0||g.finished||g.runSaveInvalid||p.swing||g.time<p.hurtUntil||g.time<p.dodgeUntil)return false;
 if(action==='reaper')return ownsReaper(g);if(action==='select')return g.pistol?.collected===true;
 const anchor=action==='recover'?data.contract.case:data.contract.giver;
 return ['accept','recover','claim'].includes(action)&&g.world.areaId===anchor.areaId&&distance(p.pos,anchor.position)<=anchor.radius+1e-8&&g.world.lineClear(p.pos,anchor.position);
}
export function selectedPistolProfile(g){
 const special=g.world?.bossEquipmentData?.commanderPistol,reward=g.bossEquipment?.commanderPistol;if(special&&reward?.status==='owned'&&reward.selected&&reward.rewardReceipt===special.source.receiptId)return{...PISTOL_RULES,...special.rules,name:special.name};
 const data=g.world?.expeditionData,state=g.expedition;
 if(!data||!state||g.world.reaperData||state.selectedPistolVariant===PISTOL_ITEM_ID)return PISTOL_RULES;
 return state.status==='claimed'&&state.rewardReceipt===data.contract.receiptId&&state.selectedPistolVariant===data.contract.rewardVariantId?{...PISTOL_RULES,...data.variants[state.selectedPistolVariant]}:PISTOL_RULES;
}
// Compose with the existing v4 codec/Core writer, never a parallel award store.
export function createExpeditionComponent({baseCodec,getRun,data,registry,applyBaseSaved,baseStorageAdapter=storage=>storage,canDispatch=()=>true,saveVersion=5,previousPlacementIds=null}){
 if(![5,6].includes(saveVersion))throw TypeError('Unsupported run successor');
 const saveKey=saveVersion===6?AREA_BOSS_SAVE_KEY:EXPEDITION_SAVE_KEY;let readOrigin=null;
 const previousPlacements=previousPlacementIds===null?null:new Set(previousPlacementIds);
 const model=expeditionModel(data,registry),state=g=>g.expedition===undefined?model.freshState():g.expedition;
 const visited=(s,g)=>model.transition(s,{type:'visit',areaId:g.world.areaId});
 const codec={RUN_SAVE_KEY:saveKey,get PISTOL_SAVE_KEY(){return baseCodec.PISTOL_SAVE_KEY;},
  encodeRun(g){const extension=state(g);if(!model.valid(extension))throw TypeError('Invalid expedition envelope');const old=JSON.parse(baseCodec.encodeRun(g));if(old.version!==4)throw TypeError('Expedition requires existing progression envelope');return JSON.stringify({...old,version:saveVersion,expedition:model.copy(extension)});},
  restoreRun(g,raw,legacyRaw){
   // Core IO reads then restores synchronously; consume this origin permission once.
   const origin=readOrigin;readOrigin=null;
   let saved;try{saved=raw==null?null:JSON.parse(raw);}catch{return null;}
   if(origin===null&&saved?.version===saveVersion||origin==='expedition'&&saved?.version===5){if(!closedData(saved,envelope))return null;
    if(origin==='expedition'&&previousPlacements&&[...(saved.supplies?.issued??[]),...(saved.progression?.awards??[]).map(row=>row.placementKey)].some(key=>!previousPlacements.has(key)))return null;const extension=model.restoreState(saved.expedition);if(!extension)return null;const previous={...saved,version:4};delete previous.expedition;const restored=baseCodec.restoreRun(g,JSON.stringify(previous),null);return restored?{...restored,expedition:extension}:null;}
   if(origin!=='legacy'||saved&&![2,3,4].includes(saved.version))return null;
   const restored=baseCodec.restoreRun(g,raw,legacyRaw);return restored?{...restored,expedition:model.freshState()}:null;
  },
  captureRunState(g){return{base:baseCodec.captureRunState(g),expedition:model.copy(state(g))};},
  isRunStateUnchanged(g,snapshot){return model.valid(state(g))&&same(state(g),snapshot.expedition)&&baseCodec.isRunStateUnchanged(g,snapshot.base);},
 };
 function wrapDomain(executeDomain){return(command,context)=>{
  const g=getRun();if(!g)return{ok:false,code:'not-eligible',events:[]};
  if(command.type==='retry'&&g.runSaveInvalid)return{ok:false,code:'invalid-save',events:[]};
  if(command.type==='expedition'||command.type==='selectVariant'||(command.type==='equip'&&command.itemId===REAPER_ITEM_ID&&g.world.reaperData)){
   const reaper=command.type==='equip',companion=!!g.world.reaperData;if(reaper&&(!companion||!closedData(command,['type','itemId','equipped'])||typeof command.equipped!=='boolean'||!ownsReaper(g)||command.equipped&&(g.locker?.weapons??[]).includes(REAPER_ITEM_ID)))return{ok:false,code:'not-eligible',events:[]};const action=command.type==='expedition'?command.action:'select';
   if(!canDispatch(g)||!expeditionEligible(g,reaper?'reaper':action,data))return{ok:false,code:'not-eligible',events:[]};
   const current=state(g),proposal=companion&&!reaper&&action==='select'&&command.variantId===PISTOL_ITEM_ID?model.copy(current):model.transition(current,action==='select'?{type:'select',variantId:reaper?(command.equipped?REAPER_ITEM_ID:PISTOL_ITEM_ID):command.variantId}:{type:action});
   if(!proposal)return{ok:false,code:action==='claim'&&current.status==='claimed'?'already-collected':'not-eligible',events:[]};
   const next=visited(proposal,g);if(!next)return{ok:false,code:'invalid-save',events:[]};
   const select=action==='select'&&!reaper,pistol=select?{...g.pistol,equipped:true}:g.pistol;
   const changed=!same(current,next)||select&&!g.pistol.equipped;if(!changed)return{ok:true,changed:false,events:[]};
   const candidate={...g,expedition:next,pistol,player:select?{...g.player,weapon:'pistol'}:g.player};
   if(!context.writeRun(candidate))return{ok:false,code:'storage-unavailable',events:[]};
   g.expedition=model.copy(next);if(select){g.pistol=pistol;g.player.weapon='pistol';}
   return{ok:true,changed:true,events:[{type:reaper?'reaper-selected':select?'pistol-variant-selected':'expedition-'+action,contractId:data.contract.id,variantId:next.selectedPistolVariant}]};
  }
  let changed=false;
  const result=executeDomain(command,{...context,writeRun(candidate){
   const extension=visited(model.copy(state(g)),candidate);if(!extension)return false;
   if(!context.writeRun({...candidate,expedition:extension}))return false;
   changed ||= !same(state(g),extension);candidate.expedition=extension;if(command.type!=='retry')g.expedition=model.copy(extension);return true;
  }});
  return result.ok?{...result,changed:result.changed||changed}:result;
 };}
 function applySavedRun(g,saved){if(!model.valid(saved.expedition))throw TypeError('Invalid restored expedition');g.expedition=model.copy(saved.expedition);applyBaseSaved(g,saved);}
 function storageAdapter(storage){const base=baseStorageAdapter(storage);return !base?base:{getItem(key){
  if(key!==saveKey)return base.getItem(key);readOrigin=null;const raw=base.getItem(key);if(raw!=null)return raw;
  if(saveVersion===6){const previous=base.getItem(EXPEDITION_SAVE_KEY);if(previous!=null){readOrigin='expedition';return previous;}}
  readOrigin='legacy';return base.getItem(baseCodec.RUN_SAVE_KEY);
 },setItem:(key,raw)=>base.setItem(key,raw)};}
 return Object.freeze({model,codec:Object.freeze(codec),wrapDomain,applySavedRun,storageAdapter});
}
