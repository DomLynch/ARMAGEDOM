import {isSuppliesState} from './supplies.js';

export const VEST_RULES=Object.freeze({itemId:'westminster-worn-vest-v1',
  areaId:'westminster',requiredKills:2,pickupRadius:1.3,reduction:.1});

export function createVestState(){return {version:1,itemId:VEST_RULES.itemId,equipped:false};}
export function isVestState(state){return state?.version===1 && state.itemId===VEST_RULES.itemId
  && typeof state.equipped==='boolean';}

// Existing issued keys include empty kills; no second kill/unlock ledger.
export function vestAvailable(state,supplies){return isVestState(state) && !state.equipped
  && isSuppliesState(supplies) && supplies.issued.length>=VEST_RULES.requiredKills;}

// Caller provides the verified near-stash bag position; collection equips once.
export function collectVest(state,{supplies,areaId,position,bagPosition,lineClear,hp}={}){
  const deny=reason=>({state,equipped:false,reason});
  const point=p=>p && Number.isFinite(p.x) && Number.isFinite(p.z);
  if(!isVestState(state) || !isSuppliesState(supplies) || !point(position) || !point(bagPosition)
      || typeof lineClear!=='function' || !Number.isFinite(hp) || hp<0)return deny('invalid');
  if(state.equipped)return deny('already-equipped');
  if(hp===0)return deny('dead');
  if(!vestAvailable(state,supplies))return deny('locked');
  if(areaId!==VEST_RULES.areaId)return deny('wrong-area');
  if(Math.hypot(position.x-bagPosition.x,position.z-bagPosition.z)>VEST_RULES.pickupRadius)
    return deny('out-of-range');
  if(!lineClear(position,bagPosition))return deny('blocked');
  return {state:{...state,equipped:true},equipped:true,reason:null};
}

// Invoke once at final player HP damage after guard/parry resolution. Block chip
// stays unchanged; ordinary positives have floor1 without increasing tiny hits.
export function damageAfterVest(amount,state,{blocked=false}={}){
  if(!Number.isFinite(amount) || amount<0)throw RangeError('Damage must be finite and nonnegative');
  if(amount===0 || blocked || !isVestState(state) || !state.equipped)return amount;
  return Math.min(amount,Math.max(1,amount*(1-VEST_RULES.reduction)));
}
