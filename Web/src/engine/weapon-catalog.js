import {freeze} from './content-schema.js';

// Family vocabulary is not a promise that every family is playable.
export const WEAPON_FAMILY_IDS=Object.freeze(['blades','blunt','pistols','rifles','shotguns','grenades','traps','flamethrowers','launchers','drones']);
export const RIFLE_ITEM_ID='bridge-warden-rifle-v1';
const key=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,95}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const closed=(value,fields)=>!!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===fields.length&&fields.every(name=>{const d=Object.getOwnPropertyDescriptor(value,name);return d&&d.enumerable&&'value'in d;});
const fields=['itemId','name','family','weaponKey','damageType','delivery','guidance','fireMode','attachment','modelRef','finisherBinding','rules','source'];
const ruleFields=['capacity','reserve','damage','range','cadence','reload','pickupRadius'];
export function validateRangedWeaponCatalog(input){
 const fail=()=>{throw TypeError('Invalid ranged weapon catalogue');};
 if(!input||Object.getPrototypeOf(input)!==Object.prototype)fail();
 const entries=Reflect.ownKeys(input).map(id=>{const d=Object.getOwnPropertyDescriptor(input,id);if(typeof id!=='string'||!d?.enumerable||!('value'in d))fail();return[id,d.value];}),weapons=new Set();
 if(!entries.length||entries.length>16)fail();
 for(const[id,row]of entries){
  if(!key(id)||!closed(row,fields)||row.itemId!==id||typeof row.name!=='string'||!row.name||row.name.length>80||!['pistols','rifles'].includes(row.family)||!key(row.weaponKey)||weapons.has(row.weaponKey)||row.damageType!=='bullet'||row.delivery!=='ray'||row.guidance!=='none'||!['held','press'].includes(row.fireMode)||!['model-root','hand_r'].includes(row.attachment)||row.modelRef!==null&&!key(row.modelRef)||!key(row.finisherBinding)||!closed(row.rules,ruleFields))fail();
  weapons.add(row.weaponKey);
  for(const[name,min,max,integer]of[['capacity',1,64,true],['reserve',0,512,true],['damage',1,500,false],['range',1,100,false],['cadence',.1,10,false],['reload',.1,10,false],['pickupRadius',.2,3,false]]){
   const value=row.rules[name];if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isSafeInteger(value))fail();
  }
  if(row.source!==null){
   const source=row.source;if(!closed(source,['placementKey','areaId','receiptId'])||!key(source.placementKey)||!key(source.areaId)||source.receiptId!==source.placementKey+':'+id)fail();
  }
 }
 return freeze(structuredClone(input));
}
export const RANGED_WEAPON_CATALOG=validateRangedWeaponCatalog({
 'westminster-start-pistol-v1':{itemId:'westminster-start-pistol-v1',name:'Pistol',family:'pistols',weaponKey:'pistol',damageType:'bullet',delivery:'ray',guidance:'none',fireMode:'held',attachment:'model-root',modelRef:null,finisherBinding:'pistol',rules:{capacity:6,reserve:12,damage:25,range:18,cadence:1.2,reload:1.3,pickupRadius:1.3},source:null},
 [RIFLE_ITEM_ID]:{itemId:RIFLE_ITEM_ID,name:'Bridge Rifle',family:'rifles',weaponKey:'rifle',damageType:'bullet',delivery:'ray',guidance:'none',fireMode:'press',attachment:'hand_r',modelRef:'player-rifle',finisherBinding:'pistol',rules:{capacity:8,reserve:16,damage:45,range:12,cadence:.65,reload:2,pickupRadius:1.3},source:{placementKey:'boss-warden-v1',areaId:'east-bridge',receiptId:'boss-warden-v1:'+RIFLE_ITEM_ID}},
});
export const RIFLE_PROFILE=RANGED_WEAPON_CATALOG[RIFLE_ITEM_ID];
