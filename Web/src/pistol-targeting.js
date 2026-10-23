import {droneHoverHeight} from './drone-mechanics.js';
import {PISTOL_RULES,tracePistol} from './pistol.js';

export function combatTargetHeight(target,time){return target.rig==='low-hover-drone'?droneHoverHeight(time):(target.rig==='original-wolf'?.65:target.rig==='giant-salamander'?1.08:target.rig==='original-rat'?.54:target.rig==='original-dog'?(target.contactGoalReach?.70:.35):target.rig==='original-roach'?(target.contactGoalReach?.24:.08):1.15)*(target.mobSize??1);}
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

// One selected profile and first-body resolution for presentation and paid shots.
export function selectedRangedProfile(g){
 if(g.flame?.equipped)return null;
 const field=['shotgun','grenade','rocketLauncher','commanderPistol'].find(k=>g.bossEquipment?.[k]?.selected);
 if(field)return{...g.world.bossEquipmentData[field],field};
 if(g.rifle?.selected)return{...g.world.rifleData,field:'rifle'};
 if(g.pistol?.equipped)return{field:'pistol',rules:g.bossEquipment?.commanderPistol?.selected?g.world.bossEquipmentData.commanderPistol.rules:PISTOL_RULES};
 return null;
}
export function rangedTargets(g,visibleIds){return(g.enemies??[]).filter(t=>t.hp>0&&t.hostile!==false&&t.visible!==false&&(!visibleIds||visibleIds.includes(t.id))&&(t.areaId==null||t.areaId===g.world.areaId));}
export function resolveRangedAim(g,aim,{visibleIds,aimPoint,aimTargetId,assist=g.mobileAssistEnabled!==false&&!g.mobileAiming}={}){
 if(typeof g.world?.lineClear!=='function')return null;
 const profile=selectedRangedProfile(g),p=g.player.pos,length=Math.hypot(aim?.x??0,aim?.z??0);if(!profile||length<EPS||!Number.isFinite(length))return null;
 const direction={x:aim.x/length,z:aim.z/length},targets=rangedTargets(g,visibleIds),lineClear=g.world.lineClear.bind(g.world),projectile=['grenade','rocketLauncher'].includes(profile.field),rules=profile.rules;
 const explicitTarget=g.touchTarget?.areaId===g.world.areaId?targets.find(t=>t.id===g.touchTarget.id&&(t.placementKey??String(t.id))===g.touchTarget.key):null;if(explicitTarget){const dx=explicitTarget.pos.x-p.x,dz=explicitTarget.pos.z-p.z,n=Math.hypot(dx,dz);if(n>EPS){direction.x=dx/n;direction.z=dz/n;}assist=false;}
 const trace=assist?resolvePistolShot({position:p,aim:direction,targets,visibleIds,lineClear,areaId:g.world.areaId,rules}):tracePistol(p,direction,targets,lineClear,rules);if(!trace)return null;
 let target=targets.find(t=>t.id===trace.targetId)??null,position=target?{...target.pos}:{...trace.end},height=target?combatTargetHeight(target,g.time):1.05;
 if(projectile){
  if(g.mobileAssistEnabled===false&&!explicitTarget)target=null;
  if(point(aimPoint)){
   const x=aimPoint.x-p.x,z=aimPoint.z-p.z,n=Math.hypot(x,z);if(n<EPS)return null;const distance=Math.min(rules.range,n);position={x:p.x+x/n*distance,z:p.z+z/n*distance};
   target=g.mobileAssistEnabled!==false||explicitTarget?targets.find(t=>t.id===aimTargetId&&Math.hypot(t.pos.x-position.x,t.pos.z-position.z)<1e-6&&lineClear(p,t.pos))??null:null;
   if(target&&profile.field==='rocketLauncher'&&trace.targetId!==target.id){const first=targets.find(t=>t.id===trace.targetId);if(first){target=first;position={...first.pos};}}
  }else if(target&&Math.hypot(target.pos.x-p.x,target.pos.z-p.z)>rules.range+EPS)target=null;
  if(!point(aimPoint)&&!target){const distance=profile.field==='grenade'?Math.min(rules.range,g.grenadeThrowRange??5)-EPS:rules.range;position={x:p.x+direction.x*distance,z:p.z+direction.z*distance};}
  height=profile.field==='grenade'?.08:target?combatTargetHeight(target,g.time):.05;
 }
 return{profile,trace,target,targetId:target?.id??null,position,height,direction:target?trace.direction:direction};
}
// Preview uses the exact resolver used when an actual round is paid.
export function pistolCue(game,{paused=false,visibleIds}={}){
 const profile=selectedRangedProfile(game),p=game.player;if(paused||game.finished||!(p.hp>0)||!['pistol','rifle'].includes(profile?.field))return null;
 const rifle=profile.field==='rifle',state=rifle?game.rifle:game.pistol,clock=rifle?game.rifleAction??{}:state,aim=game.mobileAiming?p.facing:(rifle?game.rifleUserFacing:game.pistolUserFacing)??p.facing;
 const result=resolveRangedAim(game,aim,{visibleIds});if(!result)return null;
 return{targetId:result.targetId,position:result.position,height:result.height,ready:state.magazine>0&&!clock.reloadingUntil&&game.time>=(clock.nextFireAt??0)&&!p.swing&&game.time>=(p.hurtUntil??0)&&game.time>=(p.dodgeUntil??0)&&(!rifle||game.rifleAssetReady&&game.time>=(p.ready??0))};
}

// Raised drones retain their registered contact surface for mouse projection. Shot
// selection, first-body trace, cover and damage stay in the existing domain path.
function groundPointerPoint(world,views,enemies,x,y){
 const ground=world.screenToGround(x,y),frames=enemies.filter(e=>e.hp>0&&e.rig==='low-hover-drone').map(e=>{const v=views.get(e.id);return(v?.contactModel??v?.model)?.getObjectByName('ARM_Drone_Rigid_Frame');}).filter(Boolean);
 if(!frames.length)return ground;
 const hit=world.ray.intersectObjects([...(world.masks??[]),...frames],false)[0];
 return frames.includes(hit?.object)?{x:hit.point.x,z:-hit.point.z}:ground;
}

// Flame mouse intent may point at the visible body rather than its feet.
// Use the existing registered body envelope, not an enlarged hit volume.
// This selects intent only; the actual posed flame/LOS still owns damage.
export function flamePointerPoint(world,views,enemies,x,y,{assist=true,time=0,visibleIds}={}){
 const ground=groundPointerPoint(world,views,enemies,x,y);if(!assist)return ground;
 const ray=world.ray.ray,mask=world.ray.intersectObjects(world.masks??[],false)[0]?.distance??Infinity;let best=null;
 for(const e of enemies){
  if(e.visible===false||visibleIds&&!visibleIds.includes(e.id)||!(e.hp>0)||!Number.isFinite(e.radius)||e.radius<=0||(e.areaId??world.areaId)!==world.areaId)continue;
  const height=combatTargetHeight(e,time),r=e.radius,v=Math.max(.1,height*.65),o={x:ray.origin.x-e.pos.x,y:ray.origin.y-height,z:ray.origin.z+e.pos.z},d=ray.direction,a=(d.x/r)**2+(d.y/v)**2+(d.z/r)**2,b=o.x*d.x/r**2+o.y*d.y/v**2+o.z*d.z/r**2,c=(o.x/r)**2+(o.y/v)**2+(o.z/r)**2-1,disc=b*b-a*c;
  if(!Number.isFinite(disc)||disc<0)continue;const near=(-b-Math.sqrt(disc))/a,far=(-b+Math.sqrt(disc))/a,at=near>=0?near:far;
  if(at<0||at>=mask||best&&at>=best.distance)continue;best={position:e.pos,distance:at};
 }
 return best?{...best.position}:ground;
}

// Guns share the posed-body intent envelope. Registered render scale affects
// pointer intent only; original domain radii and actual damage traces stay unchanged.
export function pistolPointerPoint(world,views,enemies,x,y,options={}){return flamePointerPoint(world,views,enemies,x,y,options);}
export function rangedPointerPoint(g,views,x,y,{visibleIds}={}){
 const profile=selectedRangedProfile(g),assist=g.mobileAssistEnabled!==false,targets=rangedTargets(g,visibleIds).filter(t=>Math.hypot(t.pos.x-g.player.pos.x,t.pos.z-g.player.pos.z)<=profile.rules.range+EPS&&g.world.lineClear(g.player.pos,t.pos)),projectionTargets=targets.map(t=>{const scale=views.get(t.id)?.root?.scale?.y;return t.rig!=='original-wolf'&&Number.isFinite(scale)&&scale>0?{...t,mobSize:scale}:t;}),position=pistolPointerPoint(g.world,views,projectionTargets,x,y,{assist,time:g.time,visibleIds});
 const target=assist&&targets.find(t=>Math.hypot(t.pos.x-position.x,t.pos.z-position.z)<EPS);return{...position,targetId:target?target.id:null};
}
