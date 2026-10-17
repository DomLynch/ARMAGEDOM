import {ATTRIBUTE_IDS,DEFAULT_ATTRIBUTES,DEFAULT_PROFICIENCY,validateProgressionPilot,pilotBonuses,nextProficiencyScore} from './progression-rules.js';
import {deathWeaponDescriptor} from './weapon-credit-policy.js';
const weaponIds=Object.keys(DEFAULT_PROFICIENCY);
export function closedData(value,keys){
 return !!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return !!d&&'value'in d;});
}
const dense=rows=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(d=>d&&'value'in d);
const stateFields=['version','rulesStamp','attributes','proficiency','awards'],awardFields=['placementKey','areaId','weaponId'];
export const copyProgression=s=>({...s,attributes:{...s.attributes},proficiency:{...s.proficiency},awards:s.awards.map(row=>({...row}))});
export function createProgressionModel({data,placements,baseMaxHP=150,baseMaxStamina=100}){
 data=validateProgressionPilot(data);
 if(!Number.isFinite(baseMaxHP)||baseMaxHP<=0||!Number.isFinite(baseMaxStamina)||baseMaxStamina<=0)throw TypeError('Invalid underlying character caps');
 const registry=new Map();
 for(const [area,rows]of Object.entries(placements)){
  if(!/^[a-z][a-z0-9-]{0,95}$/.test(area)||!Array.isArray(rows))throw TypeError('Invalid placement registry');
  for(const row of rows){if(typeof row?.key!=='string'||!/^[a-z][a-z0-9-]{0,95}$/.test(row.key)||registry.has(row.key)||registry.size>=128)throw TypeError('Invalid placement registry');registry.set(row.key,area);}
 }
 const rulesStamp=JSON.stringify([data.version,data.killScore,data.scoreCap,data.damagePerPoint,data.hpPerVitality,data.staminaPerEndurance,data.damagePerAttribute,...weaponIds.map(id=>[id,data.weapons[id].damageAttribute])]);
 const freshState=()=>({version:1,rulesStamp,attributes:{...DEFAULT_ATTRIBUTES},proficiency:{...DEFAULT_PROFICIENCY},awards:[]});
 function valid(state){
  try{
   if(!closedData(state,stateFields)||state.version!==1||state.rulesStamp!==rulesStamp||!closedData(state.attributes,ATTRIBUTE_IDS)||!closedData(state.proficiency,weaponIds)||!Array.isArray(state.awards)||state.awards.length>registry.size||!dense(state.awards))return false;
   for(const id of weaponIds)pilotBonuses(data,state.attributes,id,state.proficiency[id]);
   const seen=new Set(),scores={...DEFAULT_PROFICIENCY};
   for(const row of state.awards){
    if(!closedData(row,awardFields)||!registry.has(row.placementKey)||registry.get(row.placementKey)!==row.areaId||!deathWeaponDescriptor(row.weaponId)||seen.has(row.placementKey))return false;
    seen.add(row.placementKey);if(deathWeaponDescriptor(row.weaponId).creditPolicy==='mastery')scores[row.weaponId]=nextProficiencyScore(data,scores[row.weaponId]);
   }
   return weaponIds.every(id=>scores[id]===state.proficiency[id]);
  }catch{return false;}
 }
 // Only compare against a private snapshot already validated by the codec.
 function sameState(a,b){
  return closedData(a,stateFields)&&a.version===b.version&&a.rulesStamp===b.rulesStamp&&closedData(a.attributes,ATTRIBUTE_IDS)&&closedData(a.proficiency,weaponIds)&&ATTRIBUTE_IDS.every(id=>a.attributes[id]===b.attributes[id])&&weaponIds.every(id=>a.proficiency[id]===b.proficiency[id])&&Array.isArray(a.awards)&&a.awards.length===b.awards.length&&dense(a.awards)&&a.awards.every((row,i)=>closedData(row,awardFields)&&awardFields.every(key=>row[key]===b.awards[i][key]));
 }
 function award(state,rows){
  if(!valid(state))throw TypeError('Invalid progression state');
  const next=copyProgression(state),events=[];
  for(const row of rows){
   if(!closedData(row,awardFields)||!registry.has(row.placementKey)||registry.get(row.placementKey)!==row.areaId||!deathWeaponDescriptor(row.weaponId))throw TypeError('Invalid award identity');
   if(next.awards.some(r=>r.placementKey===row.placementKey))continue;
   next.awards.push({...row});
   if(deathWeaponDescriptor(row.weaponId).creditPolicy==='none')continue;
   const previous=next.proficiency[row.weaponId],score=nextProficiencyScore(data,previous);
   next.proficiency[row.weaponId]=score;
   if(score>previous)events.push({type:'proficiency-gain',...row,score,amount:score-previous});
  }
  return {state:next,events};
 }
 function bonuses(state,weaponId){if(!valid(state))throw TypeError('Invalid progression state');return pilotBonuses(data,state.attributes,weaponId,state.proficiency[weaponId]);}
 const maxHP=state=>baseMaxHP+bonuses(state,'knife').healthBonus;
 const maxStamina=state=>baseMaxStamina+bonuses(state,'knife').staminaBonus;
 return Object.freeze({freshState,valid,sameState,award,bonuses,maxHP,maxStamina,hasPlacement:(key,area)=>registry.has(key)&&registry.get(key)===area,placementCount:registry.size,
  deadPlacements(state,area){if(!valid(state))throw TypeError('Invalid progression state');return state.awards.filter(r=>r.areaId===area).map(r=>r.placementKey);}});
}
