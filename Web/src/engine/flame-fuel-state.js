// Required-config local fuel model. Runtime validates pickup and active flame;
// the existing single writer must commit each proposal before effects/damage.
export const FLAME_PILOT_PROFILE=Object.freeze({
 pickupId:'flamethrower-area8-v1',areaId:'area8',capacity:1000,unitsPerSecond:100,
 contact:Object.freeze({range:3,coneDegrees:40,interval:.2,damage:8,afterburnDamage:0}),
 presentation:Object.freeze({emitterCapacity:1,dynamicLights:false,recoil:0}),
});
function closed(value,keys){return !!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return !!d&&d.enumerable&&'value'in d;});}
export function createFlameFuelModel({pickupId,capacity,unitsPerSecond}={}){
 if(typeof pickupId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(pickupId)||!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(unitsPerSecond)||unitsPerSecond<=0)throw TypeError('Explicit finite fuel config and pickup identity required');
 const freshState=()=>({version:1,collected:false,fuelUnits:0});
 function valid(state){return closed(state,['version','collected','fuelUnits'])&&state.version===1&&typeof state.collected==='boolean'&&Number.isFinite(state.fuelUnits)&&state.fuelUnits>=0&&state.fuelUnits<=capacity&&(state.collected||state.fuelUnits===0);}
 function copy(state){if(!valid(state))throw TypeError('Invalid flame fuel state');return {...state};}
 const restoreState=raw=>raw===undefined?freshState():valid(raw)?copy(raw):null;
 const proposal=(state,spent)=>({state,remaining:state.fuelUnits,spent,empty:state.collected&&state.fuelUnits===0});
 function pickup(state,sourceId){
  if(!valid(state)||state.collected||sourceId!==pickupId)return null;
  return proposal({version:1,collected:true,fuelUnits:capacity},0);
 }
 function consume(state,step){
  if(!valid(state)||!closed(step,['seconds','active'])||!Number.isFinite(step.seconds)||step.seconds<0||typeof step.active!=='boolean'||step.active&&!state.collected)return null;
  if(!step.active||step.seconds===0)return proposal(copy(state),0);
  let spent=Math.min(state.fuelUnits,unitsPerSecond*step.seconds),remaining=Math.max(0,state.fuelUnits-spent);
  // Repeated fractional steps can leave a few ULPs after mathematical exhaustion.
  // Bound correction by both capacity precision and 1e-10 seconds of fuel.
  const tolerance=Math.min(capacity*Number.EPSILON*4096,unitsPerSecond*1e-10);
  if(remaining>0&&remaining<=tolerance&&state.fuelUnits>tolerance){remaining=0;spent=state.fuelUnits;}
  return proposal({...state,fuelUnits:remaining},spent);
 }
 return Object.freeze({freshState,valid,copy,restoreState,pickup,consume});
}
