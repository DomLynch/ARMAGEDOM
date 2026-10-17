import {closedData} from './progression-state.js';
import {FLAME_PILOT_PROFILE} from './flame-fuel-state.js';
export const FLAME_SAVE_KEY='armagedom:flame-run:v8';
const envelope=['version','pistol','hp','supplies','vest','droneDeaths','animalCycle','progression','expedition','uniqueReward','flameFuel'];
const same=(a,b)=>a.version===b.version&&a.collected===b.collected&&a.fuelUnits===b.fuelUnits;
const fail=code=>({ok:false,code,events:[]});
// Outer flame(unique(expedition(progression(domain)))); the existing Core writes once.
export function createFlameComponent({baseCodec,getRun,model,applyBaseSaved,baseStorageAdapter=storage=>storage,canPickup,getConsumption,unitsPerSecond}){
 if([getRun,applyBaseSaved,baseStorageAdapter,canPickup,getConsumption,baseCodec?.encodeRun,baseCodec?.restoreRun,baseCodec?.captureRunState,baseCodec?.isRunStateUnchanged,model?.freshState,model?.valid,model?.copy,model?.pickup,model?.consume].some(fn=>typeof fn!=='function')||!Number.isFinite(unitsPerSecond)||unitsPerSecond<=0)throw TypeError('Existing codec, fuel model and explicit runtime authorities required');
 let legacyRead=false;
 const state=g=>g.flameFuel===undefined?model.freshState():g.flameFuel;
 const codec={RUN_SAVE_KEY:FLAME_SAVE_KEY,get PISTOL_SAVE_KEY(){return baseCodec.PISTOL_SAVE_KEY;},
  encodeRun(g){const fuel=state(g);if(!model.valid(fuel))throw TypeError('Invalid flame fuel envelope');const old=JSON.parse(baseCodec.encodeRun(g));if(old.version!==7)throw TypeError('Flame requires base v7');return JSON.stringify({...old,version:8,flameFuel:model.copy(fuel)});},
  restoreRun(g,raw,legacyRaw){
   const legacy=legacyRead;legacyRead=false;
   try{
    const saved=raw==null?null:JSON.parse(raw);
    if(legacy){
     // Historical <=v7 could never contain this weapon, even if today's model accepts it.
     if((saved?.progression?.awards??[]).some(row=>row?.weaponId===FLAME_PILOT_PROFILE.pickupId))return null;
     const restored=baseCodec.restoreRun(g,raw,legacyRaw);return restored?{...restored,flameFuel:model.freshState()}:null;
    }
    if(saved?.version!==8||!closedData(saved,envelope)||!model.valid(saved.flameFuel))return null;
    const previous={...saved,version:7};delete previous.flameFuel;
    const restored=baseCodec.restoreRun(g,JSON.stringify(previous),null);return restored?{...restored,flameFuel:model.copy(saved.flameFuel)}:null;
   }catch{return null;}
  },
  captureRunState(g){return{base:baseCodec.captureRunState(g),flameFuel:model.copy(state(g))};},
  isRunStateUnchanged(g,snapshot){return model.valid(state(g))&&same(state(g),snapshot.flameFuel)&&baseCodec.isRunStateUnchanged(g,snapshot.base);},
 };
 function wrapDomain(executeDomain){return(command,context)=>{
  const g=getRun();if(!g)return fail('not-eligible');
  if(command.type!=='restore'&&(g.runSaveInvalid||!model.valid(state(g))))return fail('invalid-save');
  const claim=command.type==='claimPickup'&&command.pickupId===FLAME_PILOT_PROFILE.pickupId;
  if(claim){if(state(g).collected)return fail('already-collected');if(canPickup(g)!==true)return fail('not-eligible');}
  let changed=false,committedFuel=null;const events=[];
  const result=executeDomain(claim?{type:'save'}:command,{...context,writeRun(candidate){
   // Propose only inside the actual composed write, from the current live fuel.
   const current=state(g);
   if(!model.valid(current)||command.type!=='retry'&&candidate.flameFuel!==undefined&&(!model.valid(candidate.flameFuel)||!same(candidate.flameFuel,current)))return false;
   let next=model.copy(current),spent=null;
   if(claim){const proposal=model.pickup(current,FLAME_PILOT_PROFILE.pickupId);if(!proposal)return false;next=proposal.state;}
   else if(command.type==='save'){
    // Caller scopes this callback to one dispatch and clears it in finally,
    // including failures. Ordinary saves return null; no retained elapsed queue.
    const request=getConsumption(g);
    if(request!==null){const proposal=model.consume(current,request);if(!proposal)return false;next=proposal.state;if(proposal.spent>0)spent={type:'flame-fuel-spent',spent:proposal.spent,activeSeconds:Math.min(request.seconds,proposal.spent/unitsPerSecond),empty:proposal.empty};}
   }
   if(!context.writeRun({...candidate,flameFuel:next}))return false;
   changed ||= !same(current,next);committedFuel=model.copy(next);candidate.flameFuel=model.copy(next);if(command.type!=='retry')g.flameFuel=model.copy(next);
   if(claim)events.push({type:'flame-pickup',pickupId:FLAME_PILOT_PROFILE.pickupId});if(spent)events.push(spent);
   return true;
  }});
  // Inner wrappers clone the fresh Retry candidate before the domain swaps it.
  if(result.ok&&command.type==='retry'&&committedFuel)getRun().flameFuel=model.copy(committedFuel);
  return result.ok?{...result,changed:result.changed||changed,events:[...result.events,...events]}:result;
 };}
 function applySavedRun(g,saved){if(!model.valid(saved.flameFuel))throw TypeError('Invalid restored flame fuel');g.flameFuel=model.copy(saved.flameFuel);applyBaseSaved(g,saved);}
 function storageAdapter(storage){const base=baseStorageAdapter(storage);return !base?base:{getItem(key){
  if(key!==FLAME_SAVE_KEY)return base.getItem(key);legacyRead=false;const raw=base.getItem(key);if(raw!=null)return raw;
  legacyRead=true;return base.getItem(baseCodec.RUN_SAVE_KEY);
 },setItem:(key,raw)=>base.setItem(key,raw)};}
 return Object.freeze({model,codec:Object.freeze(codec),wrapDomain,applySavedRun,storageAdapter});
}
