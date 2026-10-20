import{reaperSelected,reaperLegalTarget}from'./reaper.js';
import{Vector3,Raycaster,Box3,Matrix4}from'three';
import{posedActorBounds}from'./grenade-surface.js';
import{selectedRangedProfile,rangedTargets,combatTargetHeight}from'../pistol-targeting.js';
import{safehouseWeaponBlocked,safehouseTouches}from'./safehouse.js';
const padding=8,EPS=1e-8,visibilityQueries=new WeakMap();
export function touchGun(g){const field=selectedRangedProfile(g)?.field;return g.flame?.equipped?'flame':['pistol','rifle','shotgun','rocketLauncher'].includes(field)?field:reaperSelected(g)?'reaper':null;}
// Query only on a completed world tap. Damage still uses unchanged domain rays,
// flame contact and finite rocket flight, never this modest screen padding.
export function pickTouchTarget(g,views,camera,canvas,tap){
 if(!touchGun(g)||!tap||![tap.x,tap.y].every(Number.isFinite))return null;
 const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;
 const x=(tap.x-rect.left)/rect.width*2-1,y=1-(tap.y-rect.top)/rect.height*2;if(Math.abs(x)>1||Math.abs(y)>1)return null;
 const ray=new Raycaster();ray.setFromCamera({x,y},camera);const cover=ray.intersectObjects(g.world.masks??[],false)[0]?.distance??Infinity,point=new Vector3();let best=null;
 for(const enemy of rangedTargets(g)){
  const bounds=posedActorBounds(views.get(enemy.id));if(!bounds)continue;
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,depth=0,valid=true;
  for(const px of[bounds.min.x,bounds.max.x])for(const py of[bounds.min.y,bounds.max.y])for(const pz of[bounds.min.z,bounds.max.z]){
   point.set(px,py,pz).project(camera);if(point.z< -1||point.z>1){valid=false;break;}const sx=rect.left+(point.x+1)*rect.width/2,sy=rect.top+(1-point.y)*rect.height/2;left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);depth+=point.z;
  }
  if(!valid||right<rect.left||left>rect.right||bottom<rect.top||top>rect.bottom||tap.x<left-padding||tap.x>right+padding||tap.y<top-padding||tap.y>bottom+padding)continue;
  const hit=ray.ray.intersectBox(bounds,point),distance=hit?ray.ray.origin.distanceTo(hit):ray.ray.origin.distanceTo(bounds.getCenter(point));
  if(distance>=cover-EPS||!g.world.lineClear(g.player.pos,enemy.pos))continue;
  const exact=tap.x>=left&&tap.x<=right&&tap.y>=top&&tap.y<=bottom,edge=Math.hypot(Math.max(left-tap.x,0,tap.x-right),Math.max(top-tap.y,0,tap.y-bottom));
  const local=bounds.clone().applyMatrix4(new Matrix4().copy(views.get(enemy.id).root.matrixWorld).invert());
  const row={id:enemy.id,key:enemy.placementKey??String(enemy.id),areaId:g.world.areaId,exact,edge,depth,distance,bounds:{min:local.min.toArray(),max:local.max.toArray()}};
  if(!best||Number(row.exact)>Number(best.exact)||row.exact===best.exact&&(row.edge<best.edge-EPS||Math.abs(row.edge-best.edge)<=EPS&&(row.distance<best.distance-EPS||Math.abs(row.distance-best.distance)<=EPS&&row.key<best.key)))best=row;
 }
 return best?{id:best.id,key:best.key,areaId:best.areaId,bounds:best.bounds}:null;
}
// Only eight cached envelope corners for the one selected actor. The next tap
// refreshes posed bounds; ordinary frames never traverse or skin its meshes.
export function touchTargetVisible(g,views,camera){
 const target=selectedTouchTarget(g),view=target&&views.get(target.id),saved=g.touchTarget?.bounds;if(!target||!view||!saved)return false;
 for(let node=view.root;node;node=node.parent)if(!node.visible)return false;view.root.updateWorldMatrix(true,false);
 let scratch=visibilityQueries.get(g.touchTarget);if(!scratch){scratch={box:new Box3(),point:new Vector3(),shift:new Vector3()};visibilityQueries.set(g.touchTarget,scratch);}const {box,point,shift}=scratch;box.min.fromArray(saved.min);box.max.fromArray(saved.max);box.applyMatrix4(view.root.matrixWorld);shift.copy(g.world.toRender(target.pos)).sub(view.root.position);shift.y=0;box.translate(shift);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,near=Infinity,far=-Infinity;
 for(let i=0;i<8;i++){point.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);near=Math.min(near,point.z);far=Math.max(far,point.z);}
 return right>=-1&&left<=1&&bottom>=-1&&top<=1&&far>=-1&&near<=1;
}
export function selectedTouchTarget(g){const selected=g.touchTarget;return selected?.areaId===g.world.areaId?(g.enemies??[]).find(e=>e.id===selected.id&&(e.placementKey??String(e.id))===selected.key&&e.hp>0&&e.hostile!==false&&e.visible!==false&&(e.areaId==null||e.areaId===g.world.areaId))??null:null;}
export function touchTargetReady(g,target,{flameAimEligible,allowReload=false}={}){
 const gun=touchGun(g),p=g.player;if(!gun||!target||g.runSaveInvalid||g.finished||!(p.hp>0)||g.weaponsLowered||safehouseWeaponBlocked(g)||safehouseTouches(g,target.pos,target.radius)||p.swing||g.time<(p.ready??0)||g.time<(p.hurtUntil??0)||g.time<(p.dodgeUntil??0)||!g.world.lineClear(p.pos,target.pos))return false;
 if(gun==='reaper')return reaperLegalTarget(g,target,g.reaper?.actor.pos??p.pos);if(gun==='flame')return g.flameFuel?.fuelUnits>0&&typeof flameAimEligible==='function'&&flameAimEligible(g,target)===true;
 const profile=selectedRangedProfile(g),state=gun==='pistol'?g.pistol:gun==='rifle'?g.rifle:g.bossEquipment?.[gun],clock=gun==='pistol'?state:gun==='rifle'?g.rifleAction:g.bossEquipmentAction?.[gun];
 return !!state&&(state.magazine>0||allowReload&&state.magazine===0&&state.reserve>0)&&!clock?.reloadingUntil&&g.time>=(clock?.nextFireAt??0)&&Math.hypot(target.pos.x-p.pos.x,target.pos.z-p.pos.z)<=profile.rules.range+EPS&&(gun==='pistol'||gun==='rifle'?gun==='pistol'||!!g.rifleAssetReady:!!g.bossEquipmentAssetReady?.[gun]);
}
// Runs after existing stick mapping, before any weapon pays a round. No queued
// tap, timer, save field, aim smoothing delay or synthetic damage is introduced.
export function applyTouchTarget(g,intent,services={}){
 if(!intent.mobile||intent.cancel||intent.paused||g.finished||g.player.hp<=0||!touchGun(g)){g.touchTarget=null;g.touchTargetReady=false;return intent;}
 if(intent.touchTargetSelection)g.touchTarget={...intent.touchTargetSelection};
 const target=selectedTouchTarget(g);
 if(!target){g.touchTarget=null;g.touchTargetReady=false;return intent;}
 const visible=intent.combatVisibleIds??intent.pistolVisibleIds,ready=(!visible||visible.includes(target.id))&&touchTargetReady(g,target,services),p=g.player,dx=target.pos.x-p.pos.x,dz=target.pos.z-p.pos.z,n=Math.hypot(dx,dz),aim=n>EPS?{x:dx/n,z:dz/n}:{...p.facing};
 if(touchGun(g)==='reaper'){g.touchTargetReady=ready;return{...intent,touchTargetReady:ready};}
 const actions=(intent.actions??[]).filter(a=>!['fire','slash'].includes(a)),held=(intent.held??[]).filter(a=>a!=='fire'),gun=touchGun(g),requested=!!intent.touchTargetSelection&&gun!=='flame'||(intent.actions??[]).includes('fire')||(intent.held??[]).includes('fire');
 g.touchTargetReady=ready&&!intent.dodge;
 const canTurn=!p.swing&&g.time>=(p.hurtUntil??0)&&g.time>=(p.dodgeUntil??0)&&!intent.dodge;
 if(canTurn){p.facing={...aim};if(g.mobileAim)Object.assign(g.mobileAim,{heading:Math.atan2(aim.x,aim.z),targetId:target.placementKey??String(target.id),bearing:Math.atan2(aim.x,aim.z)});}
 const reloadHeld=gun==='rocketLauncher'&&(intent.held??[]).includes('fire')&&(!visible||visible.includes(target.id))&&!intent.dodge&&touchTargetReady(g,target,{...services,allowReload:true});
 if(g.touchTargetReady&&requested||reloadHeld)actions.push('fire');
 return{...intent,aim:canTurn?aim:null,aimPoint:{...target.pos},aimTargetId:target.id,actions,held,touchTargetReady:ready};
}
export function touchTargetCue(g,{paused=false,visibleIds}={}){const target=selectedTouchTarget(g);return !paused&&g.player.hp>0&&!g.finished&&touchGun(g)&&target&&(!visibleIds||visibleIds.includes(target.id))?{targetId:target.id,position:{...target.pos},height:combatTargetHeight(target,g.time),ready:g.touchTargetReady===true&&(touchGun(g)==='flame'?g.flameFuel?.fuelUnits>0:touchTargetReady(g,target)),selection:true}:null;}
