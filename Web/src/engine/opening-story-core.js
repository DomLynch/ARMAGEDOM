import{safehouseProp}from'./safehouse.js';
import{closedData}from'./progression-state.js';
import{storyState,validStory,matronDefeated}from'./opening-story.js';
export const OPENING_STORY_SAVE_KEY='armagedom:opening-story-run:v13';
const fields=['version','pistol','hp','supplies','vest','droneDeaths','animalCycle','progression','expedition','uniqueReward','flameFuel','rifle','bossEquipment','locker','openingStory'];
const copy=s=>({...s}),same=(a,b)=>a.commsRead===b.commsRead&&a.messageRecovered===b.messageRecovered;
export function createOpeningStoryComponent({base,getRun,readRequested}){
 let legacy=false;
 const codec={RUN_SAVE_KEY:OPENING_STORY_SAVE_KEY,get PISTOL_SAVE_KEY(){return base.codec.PISTOL_SAVE_KEY;},
  encodeRun(g){if(!validStory(storyState(g)))throw TypeError('Invalid opening story');const old=JSON.parse(base.codec.encodeRun(g));if(old.version!==12)throw TypeError('Opening story requires v12');return JSON.stringify({...old,version:13,openingStory:copy(storyState(g))});},
  restoreRun(g,raw,legacyRaw){const oldRead=legacy;legacy=false;try{
   if(oldRead){const saved=base.codec.restoreRun(g,raw,legacyRaw);return saved?{...saved,openingStory:{commsRead:false,messageRecovered:matronDefeated(saved)}}:null;}
   const saved=JSON.parse(raw);if(saved?.version!==13||!closedData(saved,fields)||!validStory(saved.openingStory))return null;
   const old={...saved,version:12};delete old.openingStory;const restored=base.codec.restoreRun(g,JSON.stringify(old),null);return restored?{...restored,openingStory:copy(saved.openingStory)}:null;
  }catch{return null;}},
  captureRunState(g){return{base:base.codec.captureRunState(g),openingStory:copy(storyState(g))};},
  isRunStateUnchanged(g,s){return validStory(storyState(g))&&same(storyState(g),s.openingStory)&&base.codec.isRunStateUnchanged(g,s.base);}};
 function wrapDomain(execute){return(command,context)=>{
  const g=getRun(),current=storyState(g),read=command.type==='save'&&readRequested(g);
  if(command.type!=='restore'&&!validStory(current))return{ok:false,code:'invalid-save',events:[]};
  if(read&&(!safehouseProp(g,'comms')||g.runSaveInvalid||g.player.hp<=0||g.finished||g.player.swing||g.time<g.player.hurtUntil||g.time<g.player.dodgeUntil))return{ok:false,code:'not-eligible',events:[]};
  let committed=null,notify=false;
  const result=execute(command,{...context,writeRun(candidate){
   const next=command.type==='reset'?{commsRead:false,messageRecovered:false}:{commsRead:current.commsRead||read,messageRecovered:current.messageRecovered||matronDefeated(candidate)};
   if(!context.writeRun({...candidate,openingStory:next}))return false;
   committed=next;candidate.openingStory=copy(next);notify=!current.messageRecovered&&next.messageRecovered;return true;
  }});
  if(result.ok&&committed)getRun().openingStory=copy(committed);
  return result.ok?{...result,changed:result.changed||!!committed&&!same(current,committed),events:[...result.events,...(notify?[{type:'story-message-recovered'}]:[])]}:result;
 };}
 return{codec,wrapDomain,storageAdapter(storage){const b=base.storageAdapter(storage);return!b?b:{getItem(key){if(key!==OPENING_STORY_SAVE_KEY)return b.getItem(key);legacy=false;const raw=b.getItem(key);if(raw!=null)return raw;legacy=true;return b.getItem(base.codec.RUN_SAVE_KEY);},setItem:(key,raw)=>b.setItem(key,raw)};},applySavedRun(g,saved){base.applySavedRun(g,saved);g.openingStory=copy(saved.openingStory);}};
}
