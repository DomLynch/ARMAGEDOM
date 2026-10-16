import {closedData} from './progression-state.js';
export const UNIQUE_REWARD_SAVE_KEY='armagedom:unique-reward-run:v7';
const envelope=['version','pistol','hp','supplies','vest','droneDeaths','animalCycle','progression','expedition','uniqueReward'];
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const same=(a,b)=>a.version===b.version&&a.status===b.status&&a.rewardReceipt===b.rewardReceipt&&a.selectedMeleeVariant===b.selectedMeleeVariant&&
 (a.dropPosition===null?b.dropPosition===null:b.dropPosition!==null&&a.dropPosition.x===b.dropPosition.x&&a.dropPosition.z===b.dropPosition.z);
const fail=code=>({ok:false,code,events:[]});
// OUTER wrapper: unique(expedition(progression(domain))). One existing Core writer.
export function createUniqueRewardComponent({baseCodec,getRun,model,placementKey,areaId,itemId,baseVariantId,applyBaseSaved,baseStorageAdapter=storage=>storage,canDispatch,validatedDropPosition,sourceDead}){
 if([getRun,applyBaseSaved,baseStorageAdapter,canDispatch,validatedDropPosition,sourceDead,baseCodec?.encodeRun,baseCodec?.restoreRun,baseCodec?.captureRunState,baseCodec?.isRunStateUnchanged,model?.copy,model?.transition].some(fn=>typeof fn!=='function'))throw TypeError('Existing codec, model and runtime authority required');
 let legacyRead=false;
 function missing(saved){const dead=sourceDead(saved);return typeof dead==='boolean'?model.restoreState(undefined,{sourceDead:dead}):null;}
 const state=g=>g.uniqueReward===undefined?missing(g):g.uniqueReward;
 const codec={RUN_SAVE_KEY:UNIQUE_REWARD_SAVE_KEY,get PISTOL_SAVE_KEY(){return baseCodec.PISTOL_SAVE_KEY;},
  encodeRun(g){const reward=state(g);if(!model.valid(reward))throw TypeError('Invalid unique reward envelope');const old=JSON.parse(baseCodec.encodeRun(g));if(old.version!==6)throw TypeError('Unique reward requires base v6');return JSON.stringify({...old,version:7,uniqueReward:model.copy(reward)});},
  restoreRun(g,raw,legacyRaw){
   const legacy=legacyRead;legacyRead=false;
   try{
    if(legacy){const restored=baseCodec.restoreRun(g,raw,legacyRaw);if(!restored)return null;const reward=missing(restored);return reward?{...restored,uniqueReward:reward}:null;}
    const saved=JSON.parse(raw);if(saved?.version!==7||!closedData(saved,envelope)||!model.valid(saved.uniqueReward))return null;
    const previous={...saved,version:6};delete previous.uniqueReward;
    const restored=baseCodec.restoreRun(g,JSON.stringify(previous),null);return restored?{...restored,uniqueReward:model.copy(saved.uniqueReward)}:null;
   }catch{return null;}
  },
  captureRunState(g){return{base:baseCodec.captureRunState(g),uniqueReward:model.copy(state(g))};},
  isRunStateUnchanged(g,snapshot){return model.valid(state(g))&&same(state(g),snapshot.uniqueReward)&&baseCodec.isRunStateUnchanged(g,snapshot.base);},
 };
 function safe(g){const p=g.player;return !!p&&Number.isFinite(p.hp)&&p.hp>0&&!g.finished&&!g.runSaveInvalid&&!p.swing&&Number.isFinite(g.time)&&g.time>=(p.hurtUntil??0)&&g.time>=(p.dodgeUntil??0)&&canDispatch(g)===true;}
 function wrapDomain(executeDomain){return(command,context)=>{
  const g=getRun();if(!g)return fail('not-eligible');
  if(command.type!=='restore'&&(g.runSaveInvalid||!model.valid(state(g))))return fail('invalid-save');
  let changed=false,committedReward=null;const drops=[];
  function writeCandidate(candidate,{reward=state(g),pistol,player}={}){
   const current=state(g);if(!model.valid(current)||candidate.uniqueReward!==undefined&&(!model.valid(candidate.uniqueReward)||!same(candidate.uniqueReward,current)))return false;
   let next=model.copy(reward);
   const award=row=>row.placementKey===placementKey&&row.areaId===areaId;
   if(command.type!=='restore'&&command.type!=='retry'&&['eligible','legacy-dead'].includes(current.status)&&(candidate.progression?.awards??[]).some(award)&&!(g.progression?.awards??[]).some(award)){
    const corpse=g.world.areaId===areaId?[...(g.enemies??[]),...(g.corpses??[])].find(e=>e.placementKey===placementKey&&(e.areaId??g.world.areaId)===areaId&&Number.isFinite(e.hp)&&e.hp<=0):null;
    if(!corpse)return false;
    let position;try{position=validatedDropPosition(g,corpse);}catch{return false;}
    next=model.transition(next,{type:'drop',placementKey,areaId,position});if(!next)return false;
   }
   const proposal={...candidate,uniqueReward:next};if(pistol!==undefined)proposal.pistol=pistol;if(player!==undefined)proposal.player=player;
   if(!context.writeRun(proposal))return false;
   changed ||= !same(current,next);committedReward=model.copy(next);candidate.uniqueReward=model.copy(next);if(command.type!=='retry')g.uniqueReward=model.copy(next);
   if(current.status!==next.status&&next.status==='pending')drops.push({type:'unique-reward-drop',itemId,areaId,position:{...next.dropPosition}});
   return true;
  }
  const claim=command.type==='claimPickup'&&command.pickupId===itemId,select=command.type==='equip'&&[baseVariantId,itemId].includes(command.itemId);
  if(claim||select){
   if(!safe(g))return fail('not-eligible');
   const current=state(g);
   if(claim){
    if(current.status==='owned')return fail('already-collected');
    if(current.status!=='pending'||g.world.areaId!==areaId||!point(g.player.pos)||Math.hypot(g.player.pos.x-current.dropPosition.x,g.player.pos.z-current.dropPosition.z)>1.3+1e-8||!g.world.lineClear(g.player.pos,current.dropPosition))return fail('not-eligible');
   }
   if(select&&command.equipped!==true)return fail('not-eligible');
   const next=model.transition(current,claim?{type:'pickup'}:{type:'select',variantId:command.itemId});if(!next)return fail('not-eligible');
   if(select&&!g.pistol)return fail('not-eligible');
   const pistol=claim?g.pistol:{...g.pistol,equipped:false},player=claim?g.player:{...g.player,weapon:'knife'};
   const ownChanged=claim||!same(current,next)||g.pistol.equipped||g.player.weapon!=='knife';
   // Reconcile all retained progression/expedition intent before this ONE write.
   const result=executeDomain({type:'save'},{...context,writeRun:candidate=>writeCandidate(candidate,select?{reward:next,pistol,player}:{reward:next})});
   if(!result.ok)return result;
   if(select&&ownChanged){g.pistol=pistol;g.player.weapon=player.weapon;}
   const ownEvents=ownChanged?[{type:claim?'unique-reward-pickup':'melee-variant-selected',itemId:claim?itemId:command.itemId}]:[];
   return{...result,changed:result.changed||changed||ownChanged,events:[...result.events,...drops,...ownEvents]};
  }
  const result=executeDomain(command,{...context,writeRun:writeCandidate});
  // Inner codecs clone their candidates. The domain swaps the original fresh run
  // only after durable success; attach the committed DTO to that new live owner.
  if(result.ok&&command.type==='retry'&&committedReward)getRun().uniqueReward=model.copy(committedReward);
  return result.ok?{...result,changed:result.changed||changed,events:[...result.events,...drops]}:result;
 };}
 function applySavedRun(g,saved){if(!model.valid(saved.uniqueReward))throw TypeError('Invalid restored unique reward');g.uniqueReward=model.copy(saved.uniqueReward);applyBaseSaved(g,saved);}
 function storageAdapter(storage){const base=baseStorageAdapter(storage);return !base?base:{getItem(key){
  if(key!==UNIQUE_REWARD_SAVE_KEY)return base.getItem(key);legacyRead=false;const raw=base.getItem(key);if(raw!=null)return raw;
  legacyRead=true;return base.getItem(baseCodec.RUN_SAVE_KEY);
 },setItem:(key,raw)=>base.setItem(key,raw)};}
 return Object.freeze({model,codec:Object.freeze(codec),wrapDomain,applySavedRun,storageAdapter});
}
