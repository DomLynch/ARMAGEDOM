// Locker location and supply proposals only. Entitlement/ammo DTOs remain the
// existing inventory authority; host commits both sides through its one writer.
export const LOCKER_WEAPON_IDS=Object.freeze(['westminster-start-pistol-v1','bridge-warden-rifle-v1','flamethrower-area8-v1','hale-pitborn-cleaver-v1','south-stalker-shotgun-v1','standard-grenade-v1','surgeons-knife-v1','borough-butchers-rocket-launcher-v1','watchmans-pistol-v1','borough-marshals-pistol-v1']);
const weaponIdsAllowed=LOCKER_WEAPON_IDS;
const resourceOwner={'railgun-reserve':weaponIdsAllowed[9],'pistol-reserve':weaponIdsAllowed[0],'rifle-reserve':weaponIdsAllowed[1],'shotgun-reserve':weaponIdsAllowed[4],'rocket-reserve':weaponIdsAllowed[7],'grenade-charges':weaponIdsAllowed[5],'flame-fuel':weaponIdsAllowed[2]};
const resources=Object.keys(resourceOwner);
export const LOCKER_RESOURCE_RULES=Object.freeze(Object.fromEntries(Object.entries({'railgun-reserve':3,'pistol-reserve':12,'rifle-reserve':16,'shotgun-reserve':12,'rocket-reserve':3,'grenade-charges':3,'flame-fuel':1000}).map(([key,cap])=>[key,Object.freeze({carryCap:cap,stashCap:cap,integer:key!=='flame-fuel'})])));
const closed=(value,keys)=>!!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d?.enumerable&&'value'in d;});
const dense=rows=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(d=>d?.enumerable&&'value'in d);
export function createLockerModel({weaponIds,resourceRules}){
 if(!dense(weaponIds)||weaponIds.length!==weaponIdsAllowed.length||new Set(weaponIds).size!==weaponIds.length||!weaponIds.every(id=>weaponIdsAllowed.includes(id))||!closed(resourceRules,resources))throw TypeError('Fixed physical weapons and supply rules required');
 const ids=[...weaponIds],rules={};
 for(const resource of resources){const rule=resourceRules[resource];if(!closed(rule,['carryCap','stashCap','integer'])||typeof rule.integer!=='boolean'||rule.integer!==(resource!=='flame-fuel')||![rule.carryCap,rule.stashCap].every(n=>Number.isFinite(n)&&n>0&&(!rule.integer||Number.isSafeInteger(n))))throw TypeError('Finite supply caps required');rules[resource]={...rule};}
 const counts=(value,side)=>closed(value,resources)&&resources.every(resource=>{const n=value[resource],rule=rules[resource];return Number.isFinite(n)&&n>=0&&n<=rule[side]&&(!rule.integer||Number.isSafeInteger(n));});
 const freshState=()=>({version:1,weapons:[],ammo:Object.fromEntries(resources.map(resource=>[resource,0]))});
 function valid(state){return closed(state,['version','weapons','ammo'])&&state.version===1&&dense(state.weapons)&&new Set(state.weapons).size===state.weapons.length&&state.weapons.every(id=>ids.includes(id))&&counts(state.ammo,'stashCap');}
 function copy(state){if(!valid(state))throw TypeError('Invalid locker');return{version:1,weapons:[...state.weapons],ammo:{...state.ammo}};}
 const restoreState=raw=>raw===undefined?freshState():valid(raw)?copy(raw):null;
 function validInventory(locker,inventory){
  return valid(locker)&&closed(inventory,['weapons','ammo'])&&closed(inventory.weapons,ids)&&ids.every(id=>{const item=inventory.weapons[id];return closed(item,['owned','equipped'])&&typeof item.owned==='boolean'&&typeof item.equipped==='boolean'&&(!item.equipped||item.owned)&&(!locker.weapons.includes(id)||item.owned&&!item.equipped);})&&counts(inventory.ammo,'carryCap')&&resources.every(resource=>inventory.weapons[resourceOwner[resource]].owned||(inventory.ammo[resource]===0&&locker.ammo[resource]===0));
 }
 function propose(locker,inventory,action){
  if(!validInventory(locker,inventory)||!action)return null;const descriptor=Object.getOwnPropertyDescriptor(action,'type');if(!descriptor||!('value'in descriptor))return null;
  const weapon=['depositWeapon','withdrawWeapon'].includes(descriptor.value),supply=['depositSupply','withdrawSupply'].includes(descriptor.value);if(!weapon&&!supply||!closed(action,weapon?['type','itemId']:['type','resource','amount']))return null;
  const next=copy(locker),ammo={...inventory.ammo};
  if(weapon){
   const id=action.itemId;if(!ids.includes(id)||!inventory.weapons[id].owned||inventory.weapons[id].equipped)return null;const stored=next.weapons.includes(id);
   if(action.type==='depositWeapon'){if(stored)return null;next.weapons.push(id);next.weapons.sort((a,b)=>ids.indexOf(a)-ids.indexOf(b));}
   else{if(!stored)return null;next.weapons=next.weapons.filter(value=>value!==id);}
  }else{
   const {resource,amount}=action;if(!resources.includes(resource)||!inventory.weapons[resourceOwner[resource]].owned||!Number.isFinite(amount)||amount<=0||rules[resource].integer&&!Number.isSafeInteger(amount))return null;
   const deposit=action.type==='depositSupply',from=deposit?ammo:next.ammo,to=deposit?next.ammo:ammo;
   if(amount>from[resource]||to[resource]+amount>rules[resource][deposit?'stashCap':'carryCap'])return null;
   from[resource]-=amount;to[resource]+=amount;
  }
  return validInventory(next,{weapons:inventory.weapons,ammo})?{locker:next,ammo}:null;
 }
 return Object.freeze({freshState,valid,copy,restoreState,validInventory,propose});
}
