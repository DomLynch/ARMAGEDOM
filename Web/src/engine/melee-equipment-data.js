import{KNIFE_MOVES,KNIFE_STAMINA_COSTS,KNIFE_RULES}from'../donor/knife.js';
import{knifePaths}from'../donor/knife-paths.js';
import cleaverPaths from'../donor/cleaver-paths.json'with{type:'json'};
import{CLEAVER_ITEM_ID,UNIQUE_REWARDS}from'./unique-reward-runtime.js';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const low=(clip,slashMoveId,includeRadius)=>({clip,slashMoveId,includeRadius,windupTicks:20,activeTicks:6,recoveryTicks:28,range:KNIFE_MOVES.light_right.range});
const cleaverLow=freeze({'original-rat':low('RatLowSlash','rat_low',false),'original-roach':low('RatLowSlash','roach_low',true),'original-dog':low('DogMidSlash','dog_low',true),'low-hover-drone':low('DogMidSlash','drone_low',true)});
// The same source age drives both measured blade samples and the displayed pose.
export function retimedMeleeAge(age,timing,source){
 const w=timing.windup,a=timing.active,r=timing.recovery;
 if(!Number.isFinite(age)||![w,a,r,source.windup,source.active,source.recovery].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid melee retiming');
 const t=Math.max(0,Math.min(w+a+r,age));
 return t<w?t/w*source.windup:t<w+a?source.windup+(t-w)/a*source.active:source.windup+source.active+(t-w-a)/r*source.recovery;
}
const changes={light_right:[14,22,24,6,26,24],light_left:[14,22,24,6,26,24],thrust:[12,18,20,4,30,20],heavy_overhead:[20,34,34,5,40,32]};
function reach(rows,move){return Math.max(...rows.slice(move.windupTicks,move.windupTicks+move.activeTicks).flatMap(r=>[Math.hypot(r[0],r[2]),Math.hypot(r[3],r[5])]));}
export const CLEAVER_MOVES=freeze(Object.fromEntries(Object.entries(KNIFE_MOVES).map(([id,base])=>{
 if(!changes[id])return[id,base];
 const[damage,stamina,windupTicks,activeTicks,recoveryTicks,staggerTicks]=changes[id];
 return[id,{...base,damage,stamina,windupTicks,activeTicks,recoveryTicks,windup:windupTicks/60,active:activeTicks/60,recovery:recoveryTicks/60,stagger:staggerTicks/60,audioWeight:'heavy',
  sourceTiming:{windup:base.windupTicks,active:base.activeTicks,recovery:base.recoveryTicks},
  stepIn:base.stepIn*(base.windupTicks-KNIFE_RULES.stepInFrom-1)/(windupTicks-KNIFE_RULES.stepInFrom-1),
  range:base.range+Math.max(0,reach(cleaverPaths.hero[id],base)-reach(knifePaths.hero[id],base))}];
})));
const contactPaths=freeze(Object.fromEntries(Object.entries(cleaverPaths.hero).map(([id,rows])=>{
 const move=CLEAVER_MOVES[id],timing={windup:move.windupTicks,active:move.activeTicks,recovery:move.recoveryTicks};
 return[id,Array.from({length:timing.windup+timing.active+timing.recovery+1},(_,age)=>{
  const at=retimedMeleeAge(age,timing,move.sourceTiming),index=Math.floor(at),next=rows[Math.min(index+1,rows.length-1)];
  return rows[index].map((value,i)=>value+(next[i]-value)*(at-index));
 })];
})));
const surgeonMoves=freeze(Object.fromEntries(Object.entries(KNIFE_MOVES).map(([id,base])=>[id,['light_right','light_left','thrust','heavy_overhead'].includes(id)?{...base,damage:id==='thrust'?16:id==='heavy_overhead'?16:12,stamina:id==='heavy_overhead'?26:18}:base])));
export const MELEE_VARIANTS=freeze({'surgeons-knife-v1':{itemId:'surgeons-knife-v1',name:'Surgeon’s Knife',moves:surgeonMoves,costs:{...KNIFE_STAMINA_COSTS,slash:18,stab:18,heavy:26},modelRef:null,modelVariantId:'knife',contact:[.12,.52],contactPaths:null,clipOverrides:null},knife:{itemId:'knife',name:'Knife',moves:KNIFE_MOVES,costs:KNIFE_STAMINA_COSTS,contactPaths:null,clipOverrides:null},[CLEAVER_ITEM_ID]:{...UNIQUE_REWARDS[CLEAVER_ITEM_ID],moves:CLEAVER_MOVES,costs:{slash:22,stab:18,heavy:34,special:40,dodge:30},contact:[.14,.86],contactPaths,targeting:{nearest:false,coneDegrees:45},lowMoves:cleaverLow,clipOverrides:{RatLowSlash:'CleaverRatLowSlash'}}});

function checkedPose(pose){if(!pose||typeof pose.clip!=='string'||!pose.clip||!['windupTicks','activeTicks','recoveryTicks'].every(k=>Number.isSafeInteger(pose[k])&&pose[k]>0)||!Number.isFinite(pose.range)||pose.range<=0)throw Error('Invalid melee contact pose');return pose.windupTicks+pose.activeTicks+pose.recoveryTicks;}
// A weapon selects existing pose data; damage, energy and ordinary action cadence
// remain the selected weapon move's authority; its low pose is retimed with contact.
export function posedMeleeMove(base,action,pose){const total=checkedPose(pose);if(!['slash','stab','heavy'].includes(action))return base;return{...base,clip:pose.clip,path:null,ratLow:true,sourceContact:pose.windupTicks/total,native:false,contactPose:pose,...(action==='slash'?{moveId:pose.slashMoveId,range:pose.range,stepIn:0,knockback:0}:{})};}
export function meleeContactPosePhase(swing){const pose=swing?.def?.contactPose,total=checkedPose(pose),t=swing.timing,age=swing.ageTicks;if(swing.clip!==pose.clip||swing.native!==false||!t||!['windup','active','recovery'].every(k=>Number.isFinite(t[k])&&t[k]>0)||!Number.isFinite(age))throw Error('Invalid retimed melee contact pose');const start=pose.windupTicks/total,last=(pose.windupTicks+pose.activeTicks-1)/total,end=(pose.windupTicks+pose.activeTicks)/total,phase=age<t.windup?age/t.windup*start:age<t.windup+t.active?t.active===1?start:start+(age-t.windup)/(t.active-1)*(last-start):end+(age-t.windup-t.active)/t.recovery*(1-end);return Math.max(0,Math.min(1,phase));}
