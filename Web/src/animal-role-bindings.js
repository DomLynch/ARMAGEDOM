import {resolveResidentIntent} from './creature-behaviour-intents.js';
import {resolveCreatureBehaviour} from './creature-behaviour-presets.js';
// Exact existing079 catalogue assignments; no species-wide activation or clocks.
const bindings=Object.freeze([
 ['rat-sewer','original-rat','east','east-roamer-7','AB','baseline'],
 ['rat-nest-defender','original-rat','south','south-roamer-3','B','baseline'],
 ['dog-gaunt-hound','original-dog','east','east-roamer-4','B','baseline'],
 ['dog-stocky-yard','original-dog','east','east-roamer-9','B','cautious'],
 ['roach-skitter','original-roach','south','south-roamer-2','B','brisk'],
].map(Object.freeze));
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
export function resolveBoundAnimalRole(e,{areaId,animalCycle,behaviourCapabilities=[]}={}){
 if(!['A','B'].includes(animalCycle)||!e||e.id==null||!Number.isFinite(e.hp)||e.hp<=0||!point(e.home)||!point(e.pos)||(e.areaId??areaId)!==areaId)return null;
 const b=bindings.find(([recipe,rig,area,key,cycles])=>e.animalRecipe===recipe&&e.rig===rig&&areaId===area&&e.placementKey===key&&cycles.includes(animalCycle));
 if(!b)return null;
 const intent=resolveResidentIntent(b[0],{behaviourCapabilities});
 const parameters=resolveCreatureBehaviour(b[5],{moveSpeed:e.moveSpeed,recoveryDelay:e.recoveryDelay??0});
 return Object.freeze({recipeId:b[0],intent,parameters});
}
const nativeBites=new Set(['rat_bite','rat_bite_low','dog_bite_calf','dog_bite_scaled','roach_bite','roach_bite_scaled']);
// Call at the existing normal native END seam, after damage/hurt resolution.
export function nativeAttackCompletion(s,{reason,time,alive,hurt=false}={}){
 if(reason!=='normal'||alive!==true||hurt===true||s?.native!==true||s.action!=='bite'||!nativeBites.has(s.clip)
  ||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start||!Number.isFinite(time)||time+1e-8<s.end)return null;
 return Object.freeze({endedAt:s.end,uninterrupted:true});
}
