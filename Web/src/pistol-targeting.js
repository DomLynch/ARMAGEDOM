import {PISTOL_RULES} from './pistol.js';

export const PISTOL_TARGETING = Object.freeze({acquireDegrees:12, retainDegrees:18});
const EPS = 1e-8;
const acquireDot = Math.cos(PISTOL_TARGETING.acquireDegrees*Math.PI/180);
const retainDot = Math.cos(PISTOL_TARGETING.retainDegrees*Math.PI/180);
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

// Use original movement/aim intent, never the previously resolved shot direction.
// Caller owns retained ID lifetime and signals a deliberate turn with switchTarget.
// Manual drag may bypass this selector. This helper never fires or changes enemy state.
export function selectPistolTarget({position, facing, aim, targets,
  lineClear, retainedTargetId=null, switchTarget=false} = {}) {
  const intent = aim ?? facing;
  if (!point(position) || !point(intent) || typeof lineClear !== 'function') return null;
  const length = Math.hypot(intent.x,intent.z);
  if (!Number.isFinite(length) || length<EPS) return null;
  const forward = {x:intent.x/length,z:intent.z/length};
  let best = null, retained = null;
  for (const target of targets ?? []) {
    if (!target || target.id==null || !point(target.pos) || target.visible===false
        || !Number.isFinite(target.hp) || target.hp<=0) continue;
    const x=target.pos.x-position.x, z=target.pos.z-position.z;
    const distance=Math.hypot(x,z);
    if (!Number.isFinite(distance) || distance<EPS || distance>PISTOL_RULES.range+EPS) continue;
    const direction={x:x/distance,z:z/distance};
    const alignment=direction.x*forward.x+direction.z*forward.z;
    const canRetain=!switchTarget && target.id===retainedTargetId;
    if (alignment+EPS<(canRetain?retainDot:acquireDot) || !lineClear(position,target.pos)) continue;
    const candidate={targetId:target.id,direction,alignment,distance};
    if (canRetain) retained=candidate;
    if (alignment+EPS<acquireDot) continue;
    if (!best || alignment>best.alignment+EPS
        || Math.abs(alignment-best.alignment)<=EPS && (distance<best.distance-EPS
          || Math.abs(distance-best.distance)<=EPS && String(target.id)<String(best.targetId))) best=candidate;
  }
  const selected=retained ?? best;
  return selected ? {targetId:selected.targetId,direction:selected.direction} : null;
}
