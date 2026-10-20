import{safehouseProp,safehouseProtected}from'./safehouse.js';
import{closedData}from'./progression-state.js';
import{storyState,validStory}from'./opening-story.js';
export const OPENING_STORY_SAVE_KEY='armagedom:opening-story-run:v14';
const previousKey='armagedom:opening-story-run:v13',fields=['version','pistol','hp','supplies','vest','droneDeaths','animalCycle','progression','expedition','uniqueReward','flameFuel','rifle','bossEquipment','locker','openingStory'];
const copy=s=>({...s}),same=(a,b)=>a.commsRead===b.commsRead&&a.bountyStage===b.bountyStage;
export function createOpeningStoryComponent({base,getRun,readRequested}){
 let format='current',owner=null,insideCommitted=false;
 const migrate=(saved,commsRead=false)=>({...saved,openingStory:{commsRead,bountyStage:commsRead?2:saved.progression?.awards?.length?1:0}});
 const codec={RUN_SAVE_KEY:OPENING_STORY_SAVE_KEY,get PISTOL_SAVE_KEY(){return base.codec.PISTOL_SAVE_KEY;},
  encodeRun(g){if(!validStory(storyState(g)))throw TypeError('Invalid bounty story');const old=JSON.parse(base.codec.encodeRun(g));if(old.version!==12)throw TypeError('Bounty story requires v12 foundation');return JSON.stringify({...old,version:14,openingStory:copy(storyState(g))});},
  restoreRun(g,raw,legacyRaw){const source=format;format='current';try{
   if(source==='older'){const saved=base.codec.restoreRun(g,raw,legacyRaw);return saved?migrate(saved):null;}
   const saved=JSON.parse(raw);if(!closedData(saved,fields))return null;
   if(source==='v13'){if(saved.version!==13||!closedData(saved.openingStory,['commsRead','messageRecovered'])||typeof saved.openingStory.commsRead!=='boolean'||typeof saved.openingStory.messageRecovered!=='boolean')return null;}
   else if(saved.version!==14||!validStory(saved.openingStory))return null;
   const old={...saved,version:12};delete old.openingStory;const restored=base.codec.restoreRun(g,JSON.stringify(old),null);return!restored?null:source==='v13'?migrate(restored,saved.openingStory.commsRead):{...restored,openingStory:copy(saved.openingStory)};
  }catch{return null;}},
  captureRunState(g){return{base:base.codec.captureRunState(g),openingStory:copy(storyState(g))};},
  isRunStateUnchanged(g,s){return validStory(storyState(g))&&same(storyState(g),s.openingStory)&&base.codec.isRunStateUnchanged(g,s.base);}};
 function wrapDomain(execute){return(command,context)=>{
  const g=getRun();if(owner!==g){owner=g;insideCommitted=false;}const current=storyState(g),read=command.type==='save'&&readRequested(g);
  if(command.type!=='restore'&&!validStory(current))return{ok:false,code:'invalid-save',events:[]};
  if(read&&(!safehouseProp(g,'comms')||g.runSaveInvalid||g.player.hp<=0||g.finished||g.player.swing||g.time<g.player.hurtUntil||g.time<g.player.dodgeUntil))return{ok:false,code:'not-eligible',events:[]};
  let committed=null;
  const result=execute(command,{...context,writeRun(candidate){
   const retry=command.type==='retry',inside=!retry&&safehouseProtected(candidate),alive=candidate.player.hp>0&&!candidate.finished;
   // This is an existing validated player-earned death receipt, not XP, a corpse
   // count or a per-kill currency. Its first commit advances one durable stage.
   const awards=candidate.progression?.awards??[],prior=g.progression?.awards??[];
   const awarded=!retry&&awards.length>prior.length&&awards.some(row=>!prior.some(old=>old.placementKey===row.placementKey));
   const departed=!retry&&alive&&current.commsRead&&insideCommitted&&!inside&&candidate.world.areaId==='westminster';
   const next={commsRead:current.commsRead||read,bountyStage:Math.max(current.bountyStage,departed?2:awarded?1:0)};
   if(!context.writeRun({...candidate,openingStory:next}))return false;
   committed=next;candidate.openingStory=copy(next);insideCommitted=alive&&inside&&next.commsRead;return true;
  }});
  if(result.ok&&committed)getRun().openingStory=copy(committed);
  if(result.ok&&command.type==='restore')insideCommitted=false;
  const raised=committed&&committed.bountyStage>current.bountyStage;
  return result.ok?{...result,changed:result.changed||!!committed&&!same(current,committed),events:[...result.events,...(raised?[{type:'bounty-raised',amount:[250,400,750][committed.bountyStage]}]:[])]}:result;
 };}
 return{codec,wrapDomain,storageAdapter(storage){const b=base.storageAdapter(storage);return!b?b:{getItem(key){if(key!==OPENING_STORY_SAVE_KEY)return b.getItem(key);format='current';const raw=b.getItem(key);if(raw!=null)return raw;const prior=b.getItem(previousKey);if(prior!=null){format='v13';return prior;}format='older';return b.getItem(base.codec.RUN_SAVE_KEY);},setItem:(key,raw)=>b.setItem(key,raw)};},applySavedRun(g,saved){base.applySavedRun(g,saved);g.openingStory=copy(saved.openingStory);}};
}
