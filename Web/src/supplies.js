// Area1-only rules; caller owns actual kill authority and atomic run persistence.
export const SUPPLY_RULES = Object.freeze({pickupRadius:1.3,reserveCap:12,healFraction:.2});
export const AREA1_SUPPLIES = Object.freeze({
  'westminster-roamer-1':Object.freeze({kind:'rounds',amount:3}),
  'westminster-roamer-2':null,
  'westminster-roamer-3':Object.freeze({kind:'rounds',amount:2}),
  'westminster-roamer-4':null,
  'westminster-roamer-5':Object.freeze({kind:'dressing',amount:1}),
  'westminster-roamer-6':null,
});
const point=p=>p && Number.isFinite(p.x) && Number.isFinite(p.z);
const copy=p=>({x:p.x,z:p.z});
const dropId=key=>`area1-supply-v1:${key}`;

// Validate this bounded three-drop DTO; never repair/reset a broken saved ledger.
export function isSuppliesState(s){
  if(s?.version!==1 || !Array.isArray(s.issued) || !Array.isArray(s.collected) || !Array.isArray(s.pending)
      || s.issued.length>6 || s.collected.length>3 || s.pending.length>3
      || new Set(s.issued).size!==s.issued.length || new Set(s.collected).size!==s.collected.length
      || s.issued.some(key=>!Object.hasOwn(AREA1_SUPPLIES,key)))return false;
  const keys=s.issued.filter(key=>AREA1_SUPPLIES[key]);
  if(s.collected.some(id=>!keys.some(key=>dropId(key)===id)))return false;
  const seen=new Set(s.collected);
  for(const drop of s.pending){
    const rule=drop && AREA1_SUPPLIES[drop.placementKey];
    if(!rule || !keys.includes(drop.placementKey) || drop.id!==dropId(drop.placementKey)
        || seen.has(drop.id) || drop.areaId!=='westminster' || drop.kind!==rule.kind
        || !point(drop.position) || !Number.isInteger(drop.remaining)
        || drop.remaining<1 || drop.remaining>rule.amount)return false;
    seen.add(drop.id);
  }
  return keys.every(key=>seen.has(dropId(key)));
}

export function createSuppliesState(){return {version:1,issued:[],collected:[],pending:[]};}

// Call on a resolved dead resident, not on an attack/selected target/area clear.
export function issueSupply(state,{areaId,placementKey,position,hp}={}){
  if(!isSuppliesState(state) || areaId!=='westminster' || !Object.hasOwn(AREA1_SUPPLIES,placementKey)
      || !point(position) || !Number.isFinite(hp) || hp>0 || state.issued.includes(placementKey))
    return {state,drop:null};
  const rule=AREA1_SUPPLIES[placementKey];
  const drop=rule?{id:dropId(placementKey),areaId,placementKey,
    kind:rule.kind,position:copy(position),remaining:rule.amount}:null;
  return {state:{...state,issued:[...state.issued,placementKey],
    pending:drop?[...state.pending,drop]:state.pending},drop};
}

// Small flat resource DTO. No magazine, reload, player or pistol object writes.
export function collectSupply(state,{dropId,areaId,position,resources,lineClear}={}){
  const deny=reason=>({state,resources,award:null,reason});
  if(!isSuppliesState(state) || !point(position) || typeof lineClear!=='function'
      || !resources || !Number.isFinite(resources.hp) || !Number.isFinite(resources.maxHP)
      || resources.maxHP<=0 || resources.hp<0 || resources.hp>resources.maxHP
      || typeof resources.pistolOwned!=='boolean' || !Number.isInteger(resources.reserve)
      || resources.reserve<0 || resources.reserve>SUPPLY_RULES.reserveCap
      || !resources.pistolOwned && resources.reserve!==0) return deny('invalid');
  if(resources.hp===0)return deny('dead');
  const drop=state.pending.find(d=>d.id===dropId);
  if(!drop || state.collected.includes(dropId))return deny('missing');
  if(areaId!==drop.areaId)return deny('wrong-area');
  if(Math.hypot(position.x-drop.position.x,position.z-drop.position.z)>SUPPLY_RULES.pickupRadius)
    return deny('out-of-range');
  if(!lineClear(position,drop.position))return deny('blocked');
  const nextResources={...resources};
  let amount,remaining;
  if(drop.kind==='rounds'){
    if(!resources.pistolOwned)return deny('pistol-required');
    amount=Math.min(drop.remaining,SUPPLY_RULES.reserveCap-resources.reserve);
    if(amount<=0)return deny('reserve-full');
    nextResources.reserve+=amount;remaining=drop.remaining-amount;
  }else if(drop.kind==='dressing'){
    amount=Math.min(resources.maxHP-resources.hp,resources.maxHP*SUPPLY_RULES.healFraction);
    if(amount<=0)return deny('health-full');
    nextResources.hp+=amount;remaining=0;
  }else return deny('invalid');
  const nextDrop={...drop,remaining};
  return {state:{...state,pending:state.pending.flatMap(d=>d.id!==dropId?[d]:remaining?[nextDrop]:[]),
    collected:remaining?state.collected:[...state.collected,dropId]},resources:nextResources,
    award:{dropId,kind:drop.kind,amount},reason:null};
}
