import {droneHoverHeight} from './drone-mechanics.js';
import {PISTOL_RULES,tracePistol} from './pistol.js';

export function combatTargetHeight(target,time){return target.rig==='low-hover-drone'?droneHoverHeight(time):(target.rig==='original-rat'?.54:target.rig==='original-dog'?(target.contactGoalReach?.70:.35):target.rig==='original-roach'?(target.contactGoalReach?.24:.08):1.15)*(target.mobSize??1);}
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
export function resolvePistolShot({position,aim,targets,visibleIds,lineClear,areaId,rules=PISTOL_RULES}) {
  const selected=selectCombatTarget({position,aim,targets:targets.filter(t=>!visibleIds||visibleIds.includes(t.id)),
    lineClear,areaId,range:rules.range,coneDegrees:PISTOL_TARGETING.acquireDegrees});
  return tracePistol(position,selected?.direction??aim,targets,lineClear,rules);
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
  // The resolved ray already identifies the first body hit, including body edges.
  const eligible=hit&&hit.visible!==false&&(hit.areaId==null||hit.areaId===game.world.areaId);
  return {targetId:eligible?hit.id:null,ready,height:eligible?combatTargetHeight(hit,game.time):1.05,position:eligible?hit.pos:
    {x:p.pos.x+direction.x*4,z:p.pos.z+direction.z*4}};
}

// Raised drones use their visible rigid surface for mouse projection. Shot
// selection, first-body trace, cover and damage stay in the existing domain path.
export function pistolPointerPoint(world,views,enemies,x,y){
 const ground=world.screenToGround(x,y),frames=enemies.filter(e=>e.hp>0&&e.rig==='low-hover-drone').map(e=>views.get(e.id)?.model.getObjectByName('ARM_Drone_Rigid_Frame')).filter(Boolean);
 if(!frames.length)return ground;
 const hit=world.ray.intersectObjects([...(world.masks??[]),...frames],false)[0];
 return frames.includes(hit?.object)?{x:hit.point.x,z:-hit.point.z}:ground;
}

// Flame mouse intent may point at the visible body rather than its feet.
// Use the existing registered body envelope, not an enlarged hit volume.
// This selects intent only; the actual posed flame/LOS still owns damage.
export function flamePointerPoint(world,views,enemies,x,y,{assist=true,time=0,visibleIds}={}){
 const ground=pistolPointerPoint(world,views,enemies,x,y);if(!assist)return ground;
 const ray=world.ray.ray,mask=world.ray.intersectObjects(world.masks??[],false)[0]?.distance??Infinity;let best=null;
 for(const e of enemies){
  if(e.visible===false||visibleIds&&!visibleIds.includes(e.id)||!(e.hp>0)||!Number.isFinite(e.radius)||e.radius<=0||(e.areaId??world.areaId)!==world.areaId)continue;
  const height=combatTargetHeight(e,time),r=e.radius,v=Math.max(.1,height*.65),o={x:ray.origin.x-e.pos.x,y:ray.origin.y-height,z:ray.origin.z+e.pos.z},d=ray.direction,a=(d.x/r)**2+(d.y/v)**2+(d.z/r)**2,b=o.x*d.x/r**2+o.y*d.y/v**2+o.z*d.z/r**2,c=(o.x/r)**2+(o.y/v)**2+(o.z/r)**2-1,disc=b*b-a*c;
  if(!Number.isFinite(disc)||disc<0)continue;const near=(-b-Math.sqrt(disc))/a,far=(-b+Math.sqrt(disc))/a,at=near>=0?near:far;
  if(at<0||at>=mask||best&&at>=best.distance)continue;best={position:e.pos,distance:at};
 }
 return best?{...best.position}:ground;
}
