// One finite phase selector for existing resident movement + projectile authority.
export const DRONE_RULES=Object.freeze({hoverHeight:.90,hp:20,radius:.55,moveSpeed:1.6,wakeDistance:6,homeLeash:12,
 attackRange:3,warningSeconds:.6,recoverySeconds:1.4,damage:6,boltSpeed:8,boltRange:6});
export const droneHoverHeight=time=>DRONE_RULES.hoverHeight+Math.sin(time*3)*.025;
export const DRONE_KEYS=Object.freeze({'westminster-drone-1':'westminster','east-drone-1':'east','south-drone-1':'south'});
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const live=a=>a&&Number.isFinite(a.hp)&&a.hp>0&&point(a.pos);
const copy=p=>({x:p.x,z:p.z});
export function createDroneState(){return {phase:'idle',readyAt:0,warning:null};}
export function droneIntent(state,{time,areaId,actor,player,lineClear,hurt=false}={}){
 if(!state||!Number.isFinite(state.readyAt)||!Number.isFinite(time)||time<0)throw Error('Invalid drone clock/state');
 const idle={...state,phase:'idle',warning:null},out=(next,action,extra={})=>({state:next,action,...extra});
 if(!live(actor)||!live(player)||actor.areaId!==areaId||!Object.hasOwn(DRONE_KEYS,actor.placementKey)
  ||DRONE_KEYS[actor.placementKey]!==areaId||typeof lineClear!=='function')return out(idle,'idle');
 if(hurt||actor.alerted!==true||actor.returning===true)return out({...idle,readyAt:Math.max(state.readyAt,time+DRONE_RULES.recoverySeconds)},'idle');
 if(state.warning){
  const w=state.warning;
  if(time+1e-8<w.releaseAt)return out(state,'warning');
  const next={phase:'recover',readyAt:time+DRONE_RULES.recoverySeconds,warning:null};
  if(!lineClear(actor.pos,player.pos)||!lineClear(w.origin,w.target))return out(next,'recover');
  return out(next,'emit-bolt',{bolt:{pos:copy(w.origin),dir:copy(w.direction),amount:DRONE_RULES.damage,height:droneHoverHeight(time),
   expires:time+DRONE_RULES.boltRange/DRONE_RULES.boltSpeed}});
 }
 if(time+1e-8<state.readyAt)return out({...state,phase:'recover'},'recover');
 const x=player.pos.x-actor.pos.x,z=player.pos.z-actor.pos.z,distance=Math.hypot(x,z);
 if(distance<1e-8)return out(idle,'idle');
 const direction={x:x/distance,z:z/distance};
 if(distance>DRONE_RULES.attackRange||!lineClear(actor.pos,player.pos))return out(idle,'approach',{direction});
 const warning={start:time,releaseAt:time+DRONE_RULES.warningSeconds,origin:copy(actor.pos),target:copy(player.pos),direction};
 return out({...state,phase:'warning',warning},'warning',{direction});
}
export function recordDroneDeath(keys,{placementKey,areaId,hp}={}){
 if(!Array.isArray(keys)||keys.some(k=>!Object.hasOwn(DRONE_KEYS,k))||new Set(keys).size!==keys.length)throw Error('Invalid drone death ledger');
 if(!Object.hasOwn(DRONE_KEYS,placementKey)||DRONE_KEYS[placementKey]!==areaId||!Number.isFinite(hp)||hp>0||keys.includes(placementKey))return {keys,grantKillCredit:false};
 return {keys:[...keys,placementKey],grantKillCredit:true};
}
