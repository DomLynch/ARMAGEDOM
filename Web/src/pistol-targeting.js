import {PISTOL_RULES,tracePistol} from './pistol.js';

export const PISTOL_TARGETING = Object.freeze({acquireDegrees:12, retainDegrees:18});
export const COMBAT_TARGETING = Object.freeze({meleeDegrees:45});
const EPS = 1e-8;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

// Stateless: caller supplies original intent, current visible cohort and weapon
// potential reach. Selection never turns an actor, starts an attack or grants a hit.
export function selectCombatTarget({position, facing, aim, targets, lineClear,
  range, rangeOffset, coneDegrees=COMBAT_TARGETING.meleeDegrees, areaId, nearest=false} = {}) {
  const intent = aim ?? facing;
  if (!point(position) || !nearest&&!point(intent) || typeof lineClear !== 'function'
      || !Number.isFinite(range) || range<=0 || !Number.isFinite(coneDegrees)
      || coneDegrees<0 || coneDegrees>=90 || rangeOffset!==undefined&&typeof rangeOffset!=='function') return null;
  const length = point(intent)?Math.hypot(intent.x,intent.z):0;
  if (!nearest&&(!Number.isFinite(length) || length<EPS)) return null;
  const forward = length>=EPS?{x:intent.x/length,z:intent.z/length}:{x:0,z:1};
  const minimumDot=Math.cos(coneDegrees*Math.PI/180);
  let best = null;
  for (const target of targets ?? []) {
    if (!target || target.id==null || !point(target.pos) || target.visible===false
        || !Number.isFinite(target.hp) || target.hp<=0
        || areaId!=null && target.areaId!=null && target.areaId!==areaId) continue;
    const x=target.pos.x-position.x, z=target.pos.z-position.z;
    const distance=Math.hypot(x,z);
    const candidateRange=range+(rangeOffset?rangeOffset(target):0);
    if (!Number.isFinite(candidateRange)||candidateRange<=0||!Number.isFinite(distance) || distance<EPS || distance>candidateRange+EPS) continue;
    const direction={x:x/distance,z:z/distance};
    const alignment=direction.x*forward.x+direction.z*forward.z;
    if (!nearest&&alignment+EPS<minimumDot || !lineClear(position,target.pos)) continue;
    const candidate={targetId:target.id,direction,alignment,distance};
    const closer=distance<(best?.distance??Infinity)-EPS, tied=best&&Math.abs(distance-best.distance)<=EPS&&String(target.id)<String(best.targetId);
    if (!best || (nearest?closer||tied:alignment>best.alignment+EPS
        || Math.abs(alignment-best.alignment)<=EPS && (closer||tied))) best=candidate;
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

// The actual shot and its presentation share selection AND the first-hit trace.
// Selection may favour a far aligned enemy; its ray can hit a nearer body first.
export function resolvePistolShot({position,aim,targets,visibleIds,lineClear,areaId}) {
  const selected=selectCombatTarget({position,aim,targets:targets.filter(t=>!visibleIds||visibleIds.includes(t.id)),
    lineClear,areaId,range:PISTOL_RULES.range,coneDegrees:PISTOL_TARGETING.acquireDegrees});
  return tracePistol(position,selected?.direction??aim,targets,lineClear);
}

// Read-only preview of the current unassisted intent. No retained ID/body turn.
export function pistolCue(game,{paused=false,visibleIds}={}) {
  const p=game.player,pistol=game.pistol;
  if(paused||game.finished||!(p.hp>0)||!pistol?.equipped)return null;
  const aim=game.mobileAiming?p.facing:game.pistolUserFacing??p.facing,length=Math.hypot(aim.x,aim.z);
  if(!Number.isFinite(length)||length<.001)return null;
  const direction={x:aim.x/length,z:aim.z/length};
  const ready=pistol.magazine>0&&!pistol.reloadingUntil&&game.time>=pistol.nextFireAt
    &&!p.swing&&game.time>=(p.hurtUntil??0)&&game.time>=p.dodgeUntil;
  const trace=typeof game.world?.lineClear==='function'?(game.mobileAiming?tracePistol(p.pos,direction,game.enemies,game.world.lineClear.bind(game.world)):resolvePistolShot({position:p.pos,aim:direction,targets:game.enemies,
    visibleIds,lineClear:game.world.lineClear?.bind(game.world),areaId:game.world.areaId})):null;
  const hit=trace&&game.enemies.find(t=>t.id===trace.targetId&&(!visibleIds||visibleIds.includes(t.id)));
  const eligible=hit&&hit.visible!==false&&(hit.areaId==null||hit.areaId===game.world.areaId)&&(game.mobileAiming?true:selectCombatTarget({position:p.pos,aim:direction,targets:[hit],
    lineClear:game.world.lineClear.bind(game.world),areaId:game.world.areaId,
    range:PISTOL_RULES.range,coneDegrees:PISTOL_TARGETING.acquireDegrees}));
  return {targetId:eligible?hit.id:null,ready,height:eligible?(hit.rig==='original-rat'?.18:hit.rig==='original-dog'?.35:1.15)*(hit.mobSize??1):1.05,position:eligible?hit.pos:
    {x:p.pos.x+direction.x*4,z:p.pos.z+direction.z*4}};
}
