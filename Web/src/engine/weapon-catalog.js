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
  const payloadFamily=['shotguns','grenades'].includes(row.family);
  if(!key(id)||!closed(row,payloadFamily?[...fields,'payload']:fields)||row.itemId!==id||typeof row.name!=='string'||!row.name||row.name.length>80||!['pistols','rifles','shotguns','grenades'].includes(row.family)||!key(row.weaponKey)||weapons.has(row.weaponKey)&&row.family!=='pistols'||row.damageType!==(row.family==='grenades'?'blast':'bullet')||row.delivery!==(row.family==='grenades'?'projectile':'ray')||row.guidance!=='none'||!['held','press'].includes(row.fireMode)||!['model-root','hand_r'].includes(row.attachment)||row.modelRef!==null&&!key(row.modelRef)||!key(row.finisherBinding)||!closed(row.rules,ruleFields))fail();
  if(row.family==='pistols'&&row.weaponKey!=='pistol')fail();
  weapons.add(row.weaponKey);
  for(const[name,min,max,integer]of[['capacity',1,64,true],['reserve',0,512,true],['damage',1,500,false],['range',1,100,false],['cadence',.1,10,false],['reload',.1,10,false],['pickupRadius',.2,3,false]]){
   const value=row.rules[name],minimum=name==='reload'&&row.family==='grenades'?0:min;if(!Number.isFinite(value)||value<minimum||value>max||integer&&!Number.isSafeInteger(value))fail();
  }
  if(row.family==='shotguns'&&(!closed(row.payload,['pelletCount','pelletDamage','range','spreadDegrees'])||row.payload.pelletCount!==8||row.payload.pelletDamage!==8||row.payload.range!==6||row.payload.spreadDegrees!==12))fail();
  if(row.family==='grenades'&&(!closed(row.payload,['itemId','capacity','maxRange','fuseSeconds','radius','maxDamage'])||row.payload.itemId!==row.itemId||row.payload.capacity!==3||row.payload.maxRange!==8||row.payload.fuseSeconds!==1||row.payload.radius!==3||row.payload.maxDamage!==60||row.rules.reload!==0||row.rules.reserve!==0))fail();
  if(row.source!==null){
   const source=row.source;if(!closed(source,['placementKey','areaId','receiptId'])||!key(source.placementKey)||!key(source.areaId)||source.receiptId!==source.placementKey+':'+id)fail();
  }
 }
 return freeze(structuredClone(input));
}
export const RANGED_WEAPON_CATALOG=validateRangedWeaponCatalog({
 'westminster-start-pistol-v1':{itemId:'westminster-start-pistol-v1',name:'Pistol',family:'pistols',weaponKey:'pistol',damageType:'bullet',delivery:'ray',guidance:'none',fireMode:'held',attachment:'model-root',modelRef:null,finisherBinding:'pistol',rules:{capacity:6,reserve:12,damage:25,range:18,cadence:1.2,reload:1.3,pickupRadius:1.3},source:null},
 [RIFLE_ITEM_ID]:{itemId:RIFLE_ITEM_ID,name:'Bridge Rifle',family:'rifles',weaponKey:'rifle',damageType:'bullet',delivery:'ray',guidance:'none',fireMode:'press',attachment:'hand_r',modelRef:'player-rifle',finisherBinding:'pistol',rules:{capacity:8,reserve:16,damage:45,range:12,cadence:.65,reload:2,pickupRadius:1.3},source:{placementKey:'boss-warden-v1',areaId:'east-bridge',receiptId:'boss-warden-v1:'+RIFLE_ITEM_ID}},
 'south-stalker-shotgun-v1':{itemId:'south-stalker-shotgun-v1',name:'Southbank Shotgun',family:'shotguns',weaponKey:'shotgun',damageType:'bullet',delivery:'ray',guidance:'none',fireMode:'press',attachment:'hand_r',modelRef:'player-shotgun',finisherBinding:'pistol',rules:{capacity:2,reserve:12,damage:64,range:6,cadence:.8,reload:2.4,pickupRadius:1.3},source:{placementKey:'boss-nightborn-v1',areaId:'south',receiptId:'boss-nightborn-v1:south-stalker-shotgun-v1'},payload:{pelletCount:8,pelletDamage:8,range:6,spreadDegrees:12}},
 'standard-grenade-v1':{itemId:'standard-grenade-v1',name:'Standard Grenades',family:'grenades',weaponKey:'grenade',damageType:'blast',delivery:'projectile',guidance:'none',fireMode:'press',attachment:'hand_r',modelRef:'player-grenade',finisherBinding:'grenade',rules:{capacity:3,reserve:0,damage:60,range:8,cadence:.8,reload:0,pickupRadius:1.3},source:{placementKey:'boss-knight-v1',areaId:'area7',receiptId:'boss-knight-v1:standard-grenade-v1'},payload:{itemId:'standard-grenade-v1',capacity:3,maxRange:8,fuseSeconds:1,radius:3,maxDamage:60}},
 'borough-marshals-pistol-v1':{itemId:'borough-marshals-pistol-v1',name:'Marshal’s Pistol',family:'pistols',weaponKey:'pistol',damageType:'bullet',delivery:'ray',guidance:'none',fireMode:'held',attachment:'model-root',modelRef:null,finisherBinding:'pistol',rules:{capacity:6,reserve:12,damage:35,range:18,cadence:1.2,reload:1.8,pickupRadius:1.3},source:{placementKey:'boss-veteran-v1',areaId:'area8',receiptId:'boss-veteran-v1:borough-marshals-pistol-v1'}},
});
export const RIFLE_PROFILE=RANGED_WEAPON_CATALOG[RIFLE_ITEM_ID];

export const SHOTGUN_PROFILE=RANGED_WEAPON_CATALOG['south-stalker-shotgun-v1'];
export const GRENADE_PROFILE=RANGED_WEAPON_CATALOG['standard-grenade-v1'];

export const MARSHAL_PISTOL_PROFILE=RANGED_WEAPON_CATALOG['borough-marshals-pistol-v1'];

export const WEAPON_AUDIO=Object.freeze({shotgun:Object.freeze({from:180,to:40,seconds:.14,gain:.24,noiseSeconds:.08,noiseGain:.17,cutoff:800}),grenade:Object.freeze({from:110,to:32,seconds:.2,gain:.2,noiseSeconds:.15,noiseGain:.2,cutoff:350})});
