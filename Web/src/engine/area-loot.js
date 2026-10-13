import {closed,freeze} from './content-schema.js';
import {AREA1_SUPPLIES} from '../supplies.js';
import {AREA_MOB_SPAWNS} from '../area-mob-spawns.js';
const fail=()=>{throw Error('Invalid registered loot table');};
const object=x=>x&&Object.getPrototypeOf(x)===Object.prototype;
const name=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,95}$/.test(x);
const conditions={'westminster-start-pistol-v1':['pistol-unowned'],'westminster-worn-vest-v1':['vest-not-equipped'],rounds:['pistol-owned','reserve-space'],dressing:['health-missing'],none:[]};
const outcome=rule=>({itemId:rule?.kind??null,quantity:rule?.amount??0,weight:1,conditions:[...conditions[rule?.kind??'none']]});
export const DEFAULT_LOOT_RULES=freeze(Object.fromEntries(Object.entries(AREA1_SUPPLIES).map(([key,rule])=>[key,{areaId:'westminster',tableRef:'legacy-'+key,dropId:'area1-supply-v1:'+key,outcomes:[outcome(rule)],legacy:true}])));
export function validateAreaLoot(input,registry,residents={}){
 if(input===undefined)return DEFAULT_LOOT_RULES;
 closed(input,['version','tables','placements']);if(input.version!==1||!object(input.tables)||!object(input.placements)||Object.keys(input.tables).length>32)fail();
 const tables=Object.create(null),result=Object.assign(Object.create(null),DEFAULT_LOOT_RULES);
 for(const [id,t]of Object.entries(input.tables)){
  if(!name(id))fail();closed(t,['outcomes']);if(!Array.isArray(t.outcomes)||t.outcomes.length<1||t.outcomes.length>4)fail();
  for(const row of t.outcomes){
   closed(row,['itemId','quantity','weight','conditions']);if(![null,'rounds','dressing','westminster-start-pistol-v1','westminster-worn-vest-v1'].includes(row.itemId)||!Number.isInteger(row.quantity)||row.quantity<(row.itemId?1:0)||row.quantity>(row.itemId==='rounds'?3:row.itemId?1:0)||!Number.isFinite(row.weight)||row.weight<=0||row.weight>1000000)fail();
   const expected=conditions[row.itemId??'none'];if(!Array.isArray(row.conditions)||JSON.stringify(row.conditions)!==JSON.stringify(expected))fail();
  }
  tables[id]=freeze(structuredClone(t.outcomes));
 }
 for(const [area,placements]of Object.entries(input.placements)){
  if(!registry.has(area)||!object(placements))fail();const keys=new Set((residents[area]??AREA_MOB_SPAWNS[area]??[]).map(r=>r.key));
  for(const [key,ref]of Object.entries(placements)){
   if(!name(key)||!keys.has(key)||typeof ref!=='string'||!Object.hasOwn(tables,ref))fail();
   const legacy=Object.hasOwn(DEFAULT_LOOT_RULES,key);
   if(legacy&&(area!==DEFAULT_LOOT_RULES[key].areaId||JSON.stringify(tables[ref])!==JSON.stringify(DEFAULT_LOOT_RULES[key].outcomes)))fail();
   if(!legacy&&Object.hasOwn(result,key))fail();
   const dropId=legacy?DEFAULT_LOOT_RULES[key].dropId:'area-supply-v2:'+key;if(dropId.length>128)fail();
   result[key]=freeze({areaId:area,tableRef:ref,dropId,outcomes:tables[ref],legacy});if(Object.keys(result).length>32)fail();
  }
 }
 return freeze(result);
}
