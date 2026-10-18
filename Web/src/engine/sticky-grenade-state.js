// Transient x/z attachment proposals only. The host confirms real surface hits,
// commits throws and owns time, 3D presentation, cleanup and detonation.
const closed=(value,keys)=>!!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d?.enumerable&&'value'in d;});
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,159}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const point=p=>closed(p,['x','z'])&&Number.isFinite(p.x)&&Number.isFinite(p.z);
export function createStickyAttachmentModel({areaIds}){
 if(!Array.isArray(areaIds)||!areaIds.length||!areaIds.every(id)||new Set(areaIds).size!==areaIds.length)throw TypeError('Registered areas required');
 const areas=new Set(areaIds);
 const validActive=a=>closed(a,['id','areaId','position','detonateAt'])&&id(a.id)&&areas.has(a.areaId)&&point(a.position)&&Number.isFinite(a.detonateAt)&&a.detonateAt>=1;
 const validTarget=t=>closed(t,['victimId','areaId','position','yaw','hp'])&&id(t.victimId)&&areas.has(t.areaId)&&point(t.position)&&Number.isFinite(t.yaw)&&Number.isFinite(t.hp)&&t.hp>=0;
 const copyActive=a=>({...a,position:{...a.position}});
 const detached=a=>({active:copyActive(a),attachment:null});
 function attach(active,hit,target){
  if(!validActive(active)||!closed(hit,['confirmed','victimId','areaId','position'])||hit.confirmed!==true||hit.areaId!==active.areaId||!point(hit.position))return null;
  const next={...copyActive(active),position:{...hit.position}};
  if(hit.victimId===null)return target===null?detached(next):null;
  if(!id(hit.victimId)||!validTarget(target)||target.hp===0||target.victimId!==hit.victimId||target.areaId!==hit.areaId)return null;
  // Domain yaw is atan2(facing.x,facing.z). Store the inverse rotation.
  const x=hit.position.x-target.position.x,z=hit.position.z-target.position.z,c=Math.cos(target.yaw),s=Math.sin(target.yaw),localOffset={x:x*c-z*s,z:x*s+z*c};
  return point(localOffset)?{active:next,attachment:{victimId:hit.victimId,areaId:hit.areaId,localOffset}}:null;
 }
 function follow(sticky,target,currentAreaId){
  if(!closed(sticky,['active','attachment'])||!validActive(sticky.active)||!areas.has(currentAreaId))return null;
  const a=sticky.attachment;
  if(a!==null&&(!closed(a,['victimId','areaId','localOffset'])||!id(a.victimId)||a.areaId!==sticky.active.areaId||!point(a.localOffset)))return null;
  if(sticky.active.areaId!==currentAreaId)return{active:null,attachment:null};
  // Detached/surface anchors stay anchored, even if a former target returns.
  if(a===null)return detached(sticky.active);
  if(target===null)return detached(sticky.active);
  if(!validTarget(target))return null;
  if(target.hp===0||target.victimId!==a.victimId||target.areaId!==a.areaId)return detached(sticky.active);
  const c=Math.cos(target.yaw),s=Math.sin(target.yaw),position={x:target.position.x+a.localOffset.x*c+a.localOffset.z*s,z:target.position.z-a.localOffset.x*s+a.localOffset.z*c};
  return point(position)?{active:{...copyActive(sticky.active),position},attachment:{...a,localOffset:{...a.localOffset}}}:null;
 }
 return Object.freeze({attach,follow});
}
