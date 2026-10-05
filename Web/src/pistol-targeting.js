import {PISTOL_RULES} from './pistol.js';

export const PISTOL_TARGETING = Object.freeze({acquireDegrees:12, retainDegrees:18});
export const COMBAT_TARGETING = Object.freeze({meleeDegrees:45});
const EPS = 1e-8;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

// Stateless: caller supplies original intent, current visible cohort and weapon
// potential reach. Selection never turns an actor, starts an attack or grants a hit.
export function selectCombatTarget({position, facing, aim, targets, lineClear,
  range, coneDegrees=COMBAT_TARGETING.meleeDegrees, areaId} = {}) {
  const intent = aim ?? facing;
  if (!point(position) || !point(intent) || typeof lineClear !== 'function'
      || !Number.isFinite(range) || range<=0 || !Number.isFinite(coneDegrees)
      || coneDegrees<0 || coneDegrees>=90) return null;
  const length = Math.hypot(intent.x,intent.z);
  if (!Number.isFinite(length) || length<EPS) return null;
  const forward = {x:intent.x/length,z:intent.z/length};
  const minimumDot=Math.cos(coneDegrees*Math.PI/180);
  let best = null;
  for (const target of targets ?? []) {
    if (!target || target.id==null || !point(target.pos) || target.visible===false
        || !Number.isFinite(target.hp) || target.hp<=0
        || areaId!=null && target.areaId!=null && target.areaId!==areaId) continue;
    const x=target.pos.x-position.x, z=target.pos.z-position.z;
    const distance=Math.hypot(x,z);
    if (!Number.isFinite(distance) || distance<EPS || distance>range+EPS) continue;
    const direction={x:x/distance,z:z/distance};
    const alignment=direction.x*forward.x+direction.z*forward.z;
    if (alignment+EPS<minimumDot || !lineClear(position,target.pos)) continue;
    const candidate={targetId:target.id,direction,alignment,distance};
    if (!best || alignment>best.alignment+EPS
        || Math.abs(alignment-best.alignment)<=EPS && (distance<best.distance-EPS
          || Math.abs(distance-best.distance)<=EPS && String(target.id)<String(best.targetId))) best=candidate;
  }
  return best ? {targetId:best.targetId,direction:best.direction} : null;
}

// Compatible pistol policy. New runtime resolves each actual shot without a
// retained ID; legacy opt-in hysteresis stays available to unchanged callers.
export function selectPistolTarget({retainedTargetId=null, switchTarget=false, ...input} = {}) {
  const policy={...input,range:PISTOL_RULES.range,coneDegrees:PISTOL_TARGETING.acquireDegrees};
  const retained=!switchTarget && retainedTargetId!=null ? selectCombatTarget({
    ...policy,coneDegrees:PISTOL_TARGETING.retainDegrees,
    targets:Array.from(input.targets ?? []).filter(target=>target?.id===retainedTargetId),
  }) : null;
  return retained ?? selectCombatTarget(policy);
}
