// Pure standard grenade proposals. Host commits charges before spawning and
// consumes each active grenade once; this module owns no IO, clock or damage.
const profileFields=['itemId','capacity','maxRange','fuseSeconds','radius','maxDamage'];
const profileValues=['standard-grenade-v1',3,8,1,3,60];
const closed=(value,keys)=>!!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d?.enumerable&&'value'in d;});
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,159}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const point=value=>closed(value,['x','z'])&&Number.isFinite(value.x)&&Number.isFinite(value.z);
export function validateGrenadeProfile(profile){
 if(!closed(profile,profileFields)||!profileFields.every((key,i)=>profile[key]===profileValues[i]))throw TypeError('Registered standard grenade profile required');
 return Object.freeze({...profile});
}
export function createGrenadeModel({profile,areaIds}){
 const data=validateGrenadeProfile(profile);
 if(!Array.isArray(areaIds)||!areaIds.length||!areaIds.every(id)||new Set(areaIds).size!==areaIds.length)throw TypeError('Explicit registered areas required');
 const areas=new Set(areaIds),copyActive=active=>({...active,position:{...active.position}});
 const validActive=active=>closed(active,['id','areaId','position','detonateAt'])&&id(active.id)&&areas.has(active.areaId)&&point(active.position)&&Number.isFinite(active.detonateAt)&&active.detonateAt>=data.fuseSeconds;
 function proposeThrow(state,origin,aimPoint,areaId,blastId){
  if(!closed(state,['charges','time'])||!Number.isSafeInteger(state.charges)||state.charges<1||state.charges>data.capacity||!Number.isFinite(state.time)||state.time<0||!point(origin)||!point(aimPoint)||!areas.has(areaId)||!id(blastId))return null;
  const distance=Math.hypot(aimPoint.x-origin.x,aimPoint.z-origin.z),detonateAt=state.time+data.fuseSeconds;
  if(!(distance>0)||distance>data.maxRange||!Number.isFinite(detonateAt)||detonateAt<=state.time)return null;
  return{charges:state.charges-1,active:{id:blastId,areaId,position:{...aimPoint},detonateAt}};
 }
 function proposeDetonation(active,time,areaId,victims){
  if(!validActive(active)||!Number.isFinite(time)||time<0||!areas.has(areaId))return null;
  // Travel cancels the old area intent; returning later must not resurrect it.
  if(areaId!==active.areaId)return{active:null,blast:null};
  if(!Array.isArray(victims))return null;
  const seen=new Set();
  for(const victim of victims){
   if(!closed(victim,['victimId','areaId','position','hp','eligible'])||!id(victim.victimId)||seen.has(victim.victimId)||!areas.has(victim.areaId)||!point(victim.position)||!Number.isFinite(victim.hp)||victim.hp<0||typeof victim.eligible!=='boolean')return null;
   seen.add(victim.victimId);
  }
  if(time<active.detonateAt)return{active:copyActive(active),blast:null};
  const hits=[];
  for(const victim of victims){
   if(victim.areaId!==areaId||victim.hp===0||!victim.eligible)continue;
   const distance=Math.hypot(victim.position.x-active.position.x,victim.position.z-active.position.z);
   const damage=data.maxDamage*Math.max(0,1-distance/data.radius);
   if(damage>0)hits.push({victimId:victim.victimId,damage});
  }
  return{active:null,blast:{id:active.id,areaId,position:{...active.position},hits}};
 }
 return Object.freeze({proposeThrow,proposeDetonation});
}
