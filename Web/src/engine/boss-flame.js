import{combatTargetHeight}from'../pistol-targeting.js';
import{flameTouches}from'./flame-contact.js';
import{safehouseProtected,safehouseBlocksSegment}from'./safehouse.js';
const EPS=1e-8;
// Transient NPC attack only. Inventory, player fuel and defeat persistence stay
// with their existing owners. An optional validated capability selects it.
export function stopBossFlame(g,e,reason='interrupted'){
 if(!e.bossWeapon)return;
 e.bossWeapon=null;e.ready=Math.max(e.ready,g.time+(e.bossProfile.weapon.recoveryTicks/60));
 g.events.push({type:'boss-flame-stop',actor:e,reason});
}
export function stopBossFlames(g,reason){if(g)for(const e of g.enemies??[])stopBossFlame(g,e,reason);}
export function stepBossFlame(g,e,dt,{patrol,move,source,receive,emit}){
 const p=e.bossProfile?.weapon;if(p?.kind!=='flame')return false;
 const hurt=g.time<e.recoverUntil||g.time<e.staggerUntil;
 if(e.hp<=0||g.finished||g.player.hp<=0||safehouseProtected(g)||hurt){stopBossFlame(g,e);return true;}
 if(e.home&&patrol(g,e,dt)){stopBossFlame(g,e,'return-or-unalerted');return true;}
 let s=e.bossWeapon;
 if(s){
  const age=g.tick-s.startTick;
  if(age>=p.windupTicks+p.activeTicks){stopBossFlame(g,e,'complete');return true;}
  e.facing={...s.direction};
  s.phase=age<p.windupTicks?'warning':'active';
  if(s.phase==='active'&&s.pulses<2&&age>=p.windupTicks+s.pulses*p.intervalTicks){
   s.pulses++;
   const emitted=source?.(e),axis=emitted?.direction,n=axis&&Math.hypot(axis.x,axis.z);
   if(!emitted||!(n>EPS)||(axis.x*s.direction.x+axis.z*s.direction.z)/n<Math.cos(p.coneDegrees*Math.PI/360)){stopBossFlame(g,e,'emitter-unavailable');return true;}
   s.source={position:{...emitted.position},direction:{...emitted.direction}};
   const blocked=safehouseBlocksSegment(g,e.pos,g.player.pos)||safehouseBlocksSegment(g,emitted.position,g.player.pos);
   const contact=!blocked&&flameTouches({source:emitted,target:g.player,time:g.time,profile:p,lineClear:(a,b)=>g.world.lineClear(a,b),playerPosition:e.pos});
   const hit=contact&&receive(g,{amount:p.damage,origin:emitted.position,attacker:e,block:false,parry:false,moveId:'boss-flame-burst',def:{stagger:0,chip:0,weapon:'flamethrower'}});
   emit(g,'boss-flame-pulse',{actor:e,pulse:s.pulses,contact:!!contact,damaged:!!hit,position:{...emitted.position},dir:{...s.direction}});
  }
  return true;
 }
 if(g.time+EPS<e.ready)return true;
 const dx=g.player.pos.x-e.pos.x,dz=g.player.pos.z-e.pos.z,distance=Math.hypot(dx,dz),direction=distance>EPS?{x:dx/distance,z:dz/distance}:{...e.facing};
 if(distance>p.range||!g.world.lineClear(e.pos,g.player.pos)){move(g,e,direction,e.moveSpeed,dt);return true;}
 e.facing={...direction};
 e.bossWeapon={phase:'warning',startTick:g.tick,direction,aimPoint:{x:g.player.pos.x,y:combatTargetHeight(g.player,g.time),z:g.player.pos.z},pulses:0,source:null};
 g.message=e.bossName+' · FLAME BURST — MOVE ASIDE';g.messageUntil=g.time+p.windupTicks/60;
 emit(g,'boss-flame-warning',{actor:e,dir:{...direction},range:p.range,arc:p.coneDegrees});
 return true;
}
