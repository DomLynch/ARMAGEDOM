import{combatTargetHeight}from'../pistol-targeting.js';
import{bossEquipmentClock}from'./boss-equipment-data.js';
import{safehouseWeaponBlocked,safehouseBlocksSegment}from'./safehouse.js';
import{RAILGUN_ITEM_ID}from'./railgun-core.js';
const EPS=1e-8,normal=v=>{const n=Math.hypot(v?.x??0,v?.z??0);return n>EPS?{x:v.x/n,z:v.z/n}:null;};
export function railgunSelected(g){const p=g.world?.bossEquipmentData?.commanderPistol,s=g.bossEquipment?.commanderPistol;return p?.weaponKey==='railgun'&&s?.status==='owned'&&s.selected&&s.rewardReceipt===p.source.receiptId&&g.player.weapon==='railgun';}
export function stopRailgun(g,reason='cancel'){if(!g?.railgunCharge)return;g.railgunCharge=null;g.railgunStatus={reason,until:g.time+.8};g.events?.push({type:'railgun-charge-stop',actor:g.player,weapon:'railgun',reason});}
export function railgunIntent(g,intent,dispatch,applyHit,services={}){
 const p=g.player,data=g.world.bossEquipmentData.commanderPistol,state=g.bossEquipment.commanderPistol,clock=bossEquipmentClock(g,'commanderPistol'),edges=intent.actionEdges??{started:[],held:[],released:[]},actions=intent.actions??[],clear={...intent,actions:[],held:[],guard:false,guardPressed:false};
 const legal=railgunSelected(g)&&p.hp>0&&!g.finished&&!g.runSaveInvalid&&!g.weaponsLowered&&!safehouseWeaponBlocked(g)&&!intent.cancel&&!intent.paused&&!intent.dodge&&!p.swing&&g.time>=(p.ready??0)&&g.time>=(p.hurtUntil??0)&&g.time>=(p.dodgeUntil??0);
 if(!legal){stopRailgun(g,'interrupted');clock.reloadingUntil=0;return clear;}
 if(actions.includes('heavy')){const result=dispatch?.(g,{type:'equip',itemId:RAILGUN_ITEM_ID,equipped:false},true);if(result?.ok)stopRailgun(g,'equip');return clear;}
 if(clock.reloadingUntil>0&&g.time+EPS>=clock.reloadingUntil){const result=dispatch?.(g,{type:'reload',field:'commanderPistol'},true);if(!result?.ok)clock.reloadingUntil=0;}
 if((actions.includes('stab')||state.magazine===0)&&!g.railgunCharge&&!clock.reloadingUntil&&state.magazine<data.rules.capacity&&state.reserve>0&&g.time+EPS>=clock.nextFireAt){clock.reloadingUntil=g.time+data.rules.reload;g.events.push({type:'reload-start',actor:p,weapon:'railgun',until:clock.reloadingUntil});}
 const selected=g.touchTarget?.areaId===g.world.areaId?g.enemies.find(e=>e.id===g.touchTarget.id&&(e.placementKey??String(e.id))===g.touchTarget.key&&e.hp>0&&e.hostile!==false&&(e.areaId==null||e.areaId===g.world.areaId)):null;
 const bearing=normal(selected?{x:selected.pos.x-p.pos.x,z:selected.pos.z-p.pos.z}:intent.aim)??normal(p.facing);if(bearing){clear.aim=bearing;g.bossWeaponFacing={...bearing};}
 const ready=!!g.bossEquipmentAssetReady?.commanderPistol&&state.magazine>0&&!clock.reloadingUntil&&g.time+EPS>=clock.nextFireAt;
 if(!g.railgunCharge){const start=edges.started.find(e=>['fire','slash'].includes(e.kind)&&Number.isSafeInteger(e.lifetime));if(start&&ready){g.railgunCharge={lifetime:start.lifetime,kind:start.kind,startedAt:g.time,readyAt:g.time+data.charge.seconds,areaId:g.world.areaId};g.events.push({type:'railgun-charge-start',actor:p,weapon:'railgun',seconds:data.charge.seconds});}}
 const charge=g.railgunCharge;if(!charge)return clear;
 if(!ready||charge.areaId!==g.world.areaId||g.time-charge.startedAt>data.charge.maxSeconds){stopRailgun(g,'expired');return clear;}
 const released=edges.released.some(e=>e.lifetime===charge.lifetime&&e.kind===charge.kind),held=edges.held.some(e=>e.lifetime===charge.lifetime&&e.kind===charge.kind);
 if(!released){if(!held)stopRailgun(g,'cancel');return clear;}
 if(g.time+EPS<charge.readyAt||!bearing){stopRailgun(g,'early-release');return clear;}
 const source=services.railgunSource?.(g);if(!source||![source.x,source.y,source.z].every(Number.isFinite)){stopRailgun(g,'source-unavailable');return clear;}
 const target=selected?(services.railgunAimPoint?.(g,selected.id)??{x:selected.pos.x,y:combatTargetHeight(selected,g.time),z:-selected.pos.z}):{x:source.x+bearing.x,y:source.y,z:source.z-bearing.z},dx=target.x-source.x,dy=target.y-source.y,dz=target.z-source.z,length=Math.hypot(dx,dy,dz);if(!(length>EPS)){stopRailgun(g,'invalid-aim');return clear;}const full={x:source.x+dx/length*data.rules.range,y:source.y+dy/length*data.rules.range,z:source.z+dz/length*data.rules.range},rayDirection=normal({x:dx,z:-dz})??bearing;
 const origin={x:source.x,z:-source.z},point=t=>({x:origin.x+(full.x-source.x)*t,z:origin.z-(full.z-source.z)*t}),line=t=>g.world.lineClear(origin,point(t))&&!safehouseBlocksSegment(g,origin,point(t));let fraction=1;
 if(!g.world.lineClear(p.pos,origin))fraction=0;else if(!line(1)){let low=0,high=1;for(let i=0;i<12;i++){const mid=(low+high)/2;if(line(mid))low=mid;else high=mid;}fraction=low;}
 const end={x:source.x+(full.x-source.x)*fraction,y:source.y+(full.y-source.y)*fraction,z:source.z+(full.z-source.z)*fraction};
 const paid=dispatch?.(g,{type:'fire',field:'commanderPistol'},true);stopRailgun(g,paid?.ok?'released':'save-failed');if(!paid?.ok)return clear;
 // One bounded posed-body query at paid release. Preview/charge never scans body triangles.
 const hits=services.railgunTrace?.(g,source,end)??[];g.events.push({type:'railgun-shot',actor:p,weapon:'railgun',itemId:RAILGUN_ITEM_ID,origin:{...source},end:{...end},direction:{x:dx/length,y:dy/length,z:-dz/length},targetIds:hits.map(h=>h.enemy.id),damage:data.rules.damage});
 for(const hit of hits){const e=hit.enemy;if(!e||e.hp<=0||e.hostile===false||(e.areaId!=null&&e.areaId!==g.world.areaId))continue;applyHit?.({targetId:e.id,direction:rayDirection},'railgun',RAILGUN_ITEM_ID,data.rules.damage,'bullet');}
 return clear;
}
