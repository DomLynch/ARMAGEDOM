// One player pistol; deterministic domain rules, no renderer/input/game writes.
export const PISTOL_RULES = Object.freeze({
  capacity: 6, reserve: 12, damage: 25, range: 18,
  cadence: .3, reload: 1.3, pickupRadius: 1.3,
});
const EPS = 1e-8;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const copy = p => ({ x: p.x, z: p.z });

export function createPistolState({pickupPos, pickupAreaId = 'westminster'} = {}) {
  if (!point(pickupPos)) throw Error('Pistol pickup requires finite position');
  return {collected:false, equipped:false, magazine:0, reserve:0,
    reloadingUntil:0, nextFireAt:0, pickupPos:copy(pickupPos), pickupAreaId};
}

export function collectPistol(state, {areaId, position} = {}) {
  if (state.collected || areaId !== state.pickupAreaId || !point(position)
      || Math.hypot(position.x-state.pickupPos.x, position.z-state.pickupPos.z) > PISTOL_RULES.pickupRadius+EPS)
    return {state, events:[]};
  return {state:{...state, collected:true, equipped:true,
    magazine:PISTOL_RULES.capacity, reserve:PISTOL_RULES.reserve},
    events:[{type:'pickup'}, {type:'equip'}]};
}

export function equipPistol(state, equipped = true) {
  if (equipped && !state.collected || state.equipped === equipped) return {state, events:[]};
  const events = state.reloadingUntil ? [{type:'reload-cancel'}] : [];
  events.push({type:equipped?'equip':'holster'});
  return {state:{...state, equipped, reloadingUntil:0}, events};
}

// First circle along an explicit ray; walls are checked before target selection.
// lineClear must test the whole segment (World's existing collision contract).
export function tracePistol(origin, aim, targets, lineClear) {
  if (!point(origin) || !point(aim) || typeof lineClear !== 'function') return null;
  const length = Math.hypot(aim.x, aim.z);
  if (length < EPS || !Number.isFinite(length)) return null;
  const direction = {x:aim.x/length, z:aim.z/length};
  const at = distance => ({x:origin.x+direction.x*distance, z:origin.z+direction.z*distance});
  if (!lineClear(origin, origin)) return null;
  let limit = PISTOL_RULES.range;
  if (!lineClear(origin, at(limit))) {
    let low = 0, high = limit;
    for (let i=0; i<20; i++) {
      const middle = (low+high)/2;
      if (lineClear(origin, at(middle))) low=middle; else high=middle;
    }
    limit=low;
  }
  let targetId = null, nearest = limit;
  for (const target of targets ?? []) {
    if (target.id == null || !point(target.pos) || !Number.isFinite(target.hp) || !(target.hp>0)
        || !Number.isFinite(target.radius) || target.radius<=0) continue;
    const x=target.pos.x-origin.x, z=target.pos.z-origin.z;
    const along=x*direction.x+z*direction.z, side=x*x+z*z-along*along;
    const squared=target.radius*target.radius;
    if (side>squared+EPS) continue;
    const half=Math.sqrt(Math.max(0,squared-side));
    if (along+half<0) continue;
    const distance=Math.max(0,along-half);
    if (distance<=nearest+EPS && lineClear(origin, at(distance))) {
      // Equal-distance targets retain caller order; no enemy-directed aim.
      if (targetId!==null && distance>=nearest-EPS) continue;
      nearest=distance; targetId=target.id;
    }
  }
  return {origin:copy(origin), end:at(nearest), targetId, direction};
}

// time is the authoritative fixed-tick game's seconds, never a browser clock.
// Cancellation is processed before reload completion/fire; menu callbacks may
// call this at the current time even when the simulation is not advancing.
export function stepPistol(state, input = {}) {
  const {time, canAct=true} = input;
  if (!Number.isFinite(time) || time<0) throw Error('Pistol requires finite simulation time');
  let next = {...state};
  const events = [];
  const accept = out => {next=out.state; events.push(...out.events);};
  const cancelReload = () => {
    if (next.reloadingUntil) {next.reloadingUntil=0; events.push({type:'reload-cancel'});}
  };
  if (input.cancel || !canAct) {
    cancelReload();
    return {state:next, events};
  }
  if (input.holster) {accept(equipPistol(next,false)); return {state:next,events};}
  if (input.collect) accept(collectPistol(next,input));
  if (input.equip) accept(equipPistol(next,true));
  if (!next.equipped) return {state:next,events};
  if (next.reloadingUntil && time+EPS>=next.reloadingUntil) {
    const rounds=Math.min(PISTOL_RULES.capacity-next.magazine,next.reserve);
    next.magazine+=rounds; next.reserve-=rounds; next.reloadingUntil=0;
    events.push({type:'reload-complete',rounds});
  }
  if (input.reload && !next.reloadingUntil && next.reserve>0
      && next.magazine<PISTOL_RULES.capacity && time+EPS>=next.nextFireAt) {
    next.reloadingUntil=time+PISTOL_RULES.reload;
    events.push({type:'reload-start',until:next.reloadingUntil});
  }
  if (!input.fire || next.reloadingUntil || time+EPS<next.nextFireAt) return {state:next,events};
  const origin=input.origin ?? input.position, aim=input.aim ?? input.facing;
  const trace=tracePistol(origin,aim,input.targets,input.lineClear);
  if (!trace) return {state:next,events};
  next.nextFireAt=time+PISTOL_RULES.cadence;
  if (!next.magazine) {events.push({type:'dry'}); return {state:next,events};}
  next.magazine--;
  events.push({type:'shot',...trace,damage:PISTOL_RULES.damage,kind:'bullet',parry:false});
  return {state:next,events};
}
