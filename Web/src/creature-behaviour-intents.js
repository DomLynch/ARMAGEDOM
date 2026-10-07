// Preparation for existing residentPatrol/attack/recovery seams. No actor loop or timers.
const intent=(extra={})=>Object.freeze({wakeDistance:6,homeLeash:12,holdUntilWake:false,
 retreatSeconds:0,companionDistance:0,isolationDistance:0,burstSeconds:0,pauseSeconds:0,...extra});
export const RESIDENT_INTENTS=Object.freeze({
 baseline:intent(),ambush:intent({wakeDistance:2,holdUntilWake:true}),
 territorial:intent({wakeDistance:4,homeLeash:5}),
 withdraw:intent({retreatSeconds:.55}),
 companion:intent({wakeDistance:2.5,companionDistance:6,isolationDistance:2}),
 skitter:intent({burstSeconds:.45,pauseSeconds:.35}),
 'short-burst':intent({burstSeconds:.75,pauseSeconds:.65}),
});
export const RECIPE_INTENTS=Object.freeze({
 'human-street-scavenger':'baseline','human-crooked-hollow':'baseline',
 'human-gaunt-skulker':'withdraw','human-stocky-brute':'baseline',
 'human-limping-lurker':'short-burst','human-tunnel-dweller':'ambush',
 'human-ragged-runner':'baseline','human-corner-ambusher':'ambush',
 'human-territorial-brawler':'territorial','human-pack-scavenger':'companion',
 'human-wounded-straggler':'baseline','human-scarred-veteran':'baseline',
 'rat-sewer':'withdraw','rat-ash':'baseline','rat-soot':'ambush',
 'rat-mangy':'baseline','rat-heavy':'baseline','rat-nest-defender':'territorial',
 'dog-street-mongrel':'baseline','dog-gaunt-hound':'withdraw','dog-stocky-yard':'baseline',
 'dog-ash-coated':'baseline','dog-mangy-stray':'baseline','dog-pack-chaser':'companion',
 'roach-sewer':'baseline','roach-ash':'baseline','roach-rust-shell':'baseline',
 'roach-heavy-shell':'baseline','roach-skitter':'skitter','roach-nest-guard':'territorial',
});
export function resolveResidentIntent(recipe,foundation){
 const name=Object.hasOwn(RECIPE_INTENTS,recipe)?RECIPE_INTENTS[recipe]:null;
 if(!name)throw Error('Unknown resident recipe');
 const p=RESIDENT_INTENTS[name],needed=['home','lineOfSight'];
 if(p.retreatSeconds)needed.push('completedAttack','collisionMove');
 if(p.companionDistance)needed.push('eligibleCompanions','collisionMove');
 if(p.burstSeconds)needed.push('wakeTime','nativeLocomotion');
 if(!Array.isArray(foundation?.behaviourCapabilities)||!needed.every(c=>foundation.behaviourCapabilities.includes(c)))throw Error('Unsupported resident intent');
 return p;
}
const distance=value=>Number.isFinite(value)&&value>=0;
export function canWakeResident(p,o){
 if(o.alive!==true||o.playerAlive!==true||o.sameArea!==true||o.lineClear!==true||!distance(o.distance)||!distance(o.playerHomeDistance)||o.playerHomeDistance>p.homeLeash)return false;
 return o.distance<=p.wakeDistance||!!(p.companionDistance&&o.distance<=p.companionDistance&&o.eligibleCompanionAlerted===true);
}
export function recoveryMovement(p,o){
 // Native active swings, injury and death always own their pose/clock.
 if(o.alive!==true||o.alerted!==true||o.swingActive===true||o.hurt===true)return 'native';
 if(!distance(o.distance))return 'hold';
 if(p.isolationDistance&&o.hasEligibleCompanion!==true)return o.distance>=p.isolationDistance||o.retreatPathClear!==true?'hold':'withdraw';
 const a=o.completedAttack;
 if(p.retreatSeconds&&a?.uninterrupted===true&&Number.isFinite(a.endedAt)&&Number.isFinite(o.time)&&o.time>=a.endedAt&&o.time<a.endedAt+p.retreatSeconds-1e-9)return o.retreatPathClear===true?'withdraw':'hold';
 return 'native';
}
export function approachRhythm(p,o){
 if(!p.burstSeconds)return 'native';
 if(o.alive!==true||o.alerted!==true||o.swingActive===true||o.hurt===true)return 'native';
 if(!Number.isFinite(o.time)||!Number.isFinite(o.wokeAt)||o.time<o.wokeAt)return 'hold';
 return (o.time-o.wokeAt)%(p.burstSeconds+p.pauseSeconds)<p.burstSeconds?'native':'hold';
}
// Read current active hostile RESIDENTS only, never the player, corpses or area caches.
// Uses the existing live list and World LOS; no retained neighbor state or movement.
export function observeResidentCompanions(p,actor,residents,{areaId,lineClear}={}){
 const none={hasEligibleCompanion:false,eligibleCompanionAlerted:false};
 const point=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.z);
 const valid=e=>e&&e.id!=null&&typeof e.placementKey==='string'&&e.placementKey.length>0
  &&Number.isFinite(e.hp)&&e.hp>0&&point(e.pos)&&point(e.home)&&(e.areaId??areaId)===areaId;
 if(typeof areaId!=='string'||!areaId||typeof lineClear!=='function'||!valid(actor)
  ||!Number.isFinite(p?.companionDistance)||p.companionDistance<=0)return none;
 let hasEligibleCompanion=false,eligibleCompanionAlerted=false;
 for(const other of residents??[]){
  if(!valid(other)||other.id===actor.id||other.placementKey===actor.placementKey
   ||Math.hypot(other.pos.x-actor.pos.x,other.pos.z-actor.pos.z)>p.companionDistance
   ||!lineClear(actor.pos,other.pos))continue;
  hasEligibleCompanion=true;if(other.alerted===true)eligibleCompanionAlerted=true;
 }
 return {hasEligibleCompanion,eligibleCompanionAlerted};
}
