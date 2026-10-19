import {resolveRangedAim} from '../pistol-targeting.js';
import {bossEquipmentClock} from './boss-equipment-data.js';
import {radialBlastHits} from './radial-blast.js';
const EPS=1e-8,tip=.18,flat=p=>({x:p.x,z:-p.z}),point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z),length=p=>Math.hypot(p.x,p.z),normal=p=>{const n=length(p);return n>EPS?{x:p.x/n,z:p.z/n}:null;},emit=(g,type,data)=>g.events.push({type,...data});
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
function aimPoint(g,intent,reference,data,services){
 const result=resolveRangedAim(g,reference,{visibleIds:intent.combatVisibleIds??intent.pistolVisibleIds,aimPoint:intent.aimPoint,aimTargetId:intent.aimTargetId});g.rocketAimTargetId=result?.targetId??null;let height=result?.height??.05;
 if(result?.targetId!=null&&services.grenadeTrace){
  const p=g.player.pos,c=g.rocketAimValidation,position=result.position,same=c&&c.targetId===result.targetId&&c.areaId===g.world.areaId&&Math.abs(c.ruleHeight-height)<1e-6&&Math.hypot(c.player.x-p.x,c.player.z-p.z)<.01&&Math.hypot(c.target.x-position.x,c.target.z-position.z)<.01&&g.time>=c.at&&g.time-c.at<.25;
  if(same)height=c.height;
  else{const source=services.rocketSource?.(g);if(source){const hit=services.grenadeTrace(g,source,{x:position.x,y:height,z:-position.z});if(!hit)height=.05;g.rocketAimValidation={targetId:result.targetId,areaId:g.world.areaId,player:{...p},target:{...position},ruleHeight:result.height,height,at:g.time};}}
 }else g.rocketAimValidation=null;
 g.rocketAimHeight=height;return result?.position??null;
}
export function rocketIntent(g,intent,dispatch,services={}){
 const data=g.world.bossEquipmentData.rocketLauncher,p=g.player,clock=bossEquipmentClock(g,'rocketLauncher'),actions=intent.actions??[],canAct=p.hp>0&&!g.finished&&!g.runSaveInvalid&&!intent.cancel&&!intent.dodge&&!p.swing&&g.time>=(p.ready??0)&&g.time>=p.hurtUntil&&g.time>=p.dodgeUntil;
 const explicit=point(intent.aim)&&length(intent.aim)>EPS,moving=length(intent.move??{x:0,z:0})>.01,reference=explicit?normal(intent.aim):moving?normal(intent.move):g.bossWeaponFacing??p.facing;g.bossWeaponFacing={...reference};g.pistolTargetId=g.pistolTargetFacing=null;if(canAct&&(explicit||moving))p.facing={...reference};g.rocketAim=aimPoint(g,intent,reference,data,services);
 if(!canAct)clock.reloadingUntil=0;
 if(canAct&&actions.includes('heavy')){const result=dispatch?.(g,{type:'equip',itemId:data.itemId,equipped:false},true);if(result?.ok)clock.reloadingUntil=0;return{...intent,actions:[],held:[],guard:false,guardPressed:false};}
 let state=g.bossEquipment.rocketLauncher;
 if(canAct&&clock.reloadingUntil>0&&g.time+EPS>=clock.reloadingUntil){const result=dispatch?.(g,{type:'reload',field:'rocketLauncher'},true);if(!result?.ok)clock.reloadingUntil=0;state=g.bossEquipment.rocketLauncher;}
 if(canAct&&g.bossEquipmentAssetReady?.rocketLauncher&&(actions.includes('stab')||state.magazine===0&&(actions.includes('fire')||actions.includes('slash')))&&!clock.reloadingUntil&&state.magazine<data.rules.capacity&&state.reserve>0&&g.time+EPS>=clock.nextFireAt){clock.reloadingUntil=g.time+data.rules.reload;emit(g,'reload-start',{until:clock.reloadingUntil,weapon:'rocket'});}
 if(canAct&&g.bossEquipmentAssetReady?.rocketLauncher&&(actions.includes('fire')||actions.includes('slash'))&&!clock.reloadingUntil&&g.time+EPS>=clock.nextFireAt&&g.rocketAim){
  p.facing={...reference};const source=services.rocketSource?.(g),target=g.rocketAim;

  if(source&&[source.x,source.y,source.z].every(Number.isFinite)&&g.world.lineClear(p.pos,flat(source))){
   const raw={x:target.x-source.x,z:target.z+source.z},ahead=raw.x*reference.x+raw.z*reference.z>EPS,closeDistance=Math.max(EPS,Math.hypot(target.x-p.pos.x,target.z-p.pos.z));
   const vector={x:ahead?raw.x:reference.x*closeDistance,y:g.rocketAimHeight-source.y,z:ahead?-raw.z:-reference.z*closeDistance},size=Math.hypot(vector.x,vector.y,vector.z);
   if(size>EPS){const direction={x:vector.x/size,y:vector.y/size,z:vector.z/size},paid=dispatch?.(g,{type:'fire',field:'rocketLauncher'},true);if(paid?.ok){const sequence=g.rocketSequence??0;g.rocketSequence=sequence+1;const position={x:source.x+direction.x*tip,y:source.y+direction.y*tip,z:source.z+direction.z*tip},row={id:'rocket:'+g.tick+':'+sequence,areaId:g.world.areaId,origin:{...source},position,direction,distance:tip,previousNose:{x:p.pos.x,y:source.y,z:-p.pos.z},lastAt:g.time,paidTick:g.tick,paidTime:g.time};(g.activeRockets??=[]).push(row);emit(g,'rocket-launch',{actor:p,weapon:'rocket',id:row.id,position:{...position},direction:{...direction}});}}
  }
 }
 p.buffer=null;p.guarding=false;p.parryUntil=0;return{...intent,aim:explicit||moving?reference:null,actions:[],held:[],guard:false,guardPressed:false};
}
export function stepRockets(g,applyHit,services={}){
 const pending=g.activeRockets??[];g.activeRockets=[];if(!pending.length||g.finished||g.player.hp<=0)return;const data=g.world.bossEquipmentData?.rocketLauncher;if(!data)return;
 for(const row of pending){if(row.areaId!==g.world.areaId||g.time<row.lastAt)continue;const advance=Math.min(data.payload.maxRange-row.distance,(g.time-row.lastAt)*data.payload.speed),distance=row.distance+advance,center={x:row.origin.x+row.direction.x*distance,y:row.origin.y+row.direction.y*distance,z:row.origin.z+row.direction.z*distance},nose={x:center.x+row.direction.x*tip,y:center.y+row.direction.y*tip,z:center.z+row.direction.z*tip},from=row.previousNose;
  let fraction=Infinity,kind=null;
  if(nose.y<=.05){fraction=Math.max(0,Math.min(1,(from.y-.05)/(from.y-nose.y)));kind='ground';}
  if(!g.world.lineClear(flat(from),flat(nose))){let lo=0,hi=1;for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(g.world.lineClear(flat(from),flat(lerp(from,nose,mid))))lo=mid;else hi=mid;}if(lo<fraction){fraction=Math.max(0,lo-.001/Math.max(EPS,Math.hypot(nose.x-from.x,nose.z-from.z)));kind='wall';}}
  const hit=services.grenadeTrace?.(g,from,nose);if(hit){const total=Math.hypot(nose.x-from.x,nose.y-from.y,nose.z-from.z),at=Math.hypot(hit.position.x-from.x,hit.position.y-from.y,hit.position.z-from.z)/Math.max(EPS,total);if(at<fraction){fraction=at;kind='surface';}}
  if(kind===null&&distance+EPS>=data.payload.maxRange){fraction=1;kind='range';}
  if(kind===null){g.activeRockets.push({...row,position:center,distance,lastAt:g.time,previousNose:nose});continue;}
  // Consume before any callbacks; direct contact does not add a second hit.
  const contact=lerp(from,nose,fraction),position=flat(contact),victims=g.enemies.map(e=>({victimId:e.placementKey??String(e.id),areaId:g.world.areaId,position:{...e.pos},hp:e.hp,eligible:g.world.lineClear(position,e.pos)})),hits=radialBlastHits(position,g.world.areaId,victims,data.payload),clock=bossEquipmentClock(g,'rocketLauncher');clock.lastBlast={id:row.id,tick:g.tick,paidTick:row.paidTick,paidTime:row.paidTime,time:g.time,areaId:g.world.areaId,position:{...position}};emit(g,'grenade-blast',{actor:g.player,weapon:'rocket',id:row.id,position,radius:data.payload.radius,contact:kind});
  for(const hit of hits){const e=g.enemies.find(e=>(e.placementKey??String(e.id))===hit.victimId&&e.hp>0);if(!e)continue;const direction=normal({x:e.pos.x-position.x,z:e.pos.z-position.z})??normal({x:row.direction.x,z:-row.direction.z})??{x:0,z:1};applyHit({targetId:e.id,direction},'rocket',data.itemId,hit.damage,'blast');}
 }
}
