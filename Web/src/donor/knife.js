// Adapted from Frankendom303af39e; exact source hashes in provenance.json.
import {knifePaths} from './knife-paths.js';
export const KNIFE_RULES = Object.freeze({
  hz:60, health:150, goblinHealth:120, goblinBodyScale:.78,
  walkSpeed:3, rollSpeed:5.2, roll:36, safeStart:4, safeEnd:20,
  parry:10, parryCooldown:30, parryStun:90, parryRecovery:8,
  perfectBlock:3, perfectBlockCost:.5, breakCost:60,
  guardArc:120, guardSpeed:.35, regen:40, regenDelay:45, guardRegen:.5,
  bufferWindow:10, bufferTtl:11, stepInFrom:3, skillCooldown:900
});
const move=(moveId,clip,path,windup,active,recovery,damage,staminaDamage,stagger,chip,reach,stepIn,knockback,sourceContact)=>
  Object.freeze({moveId,clip,path,windupTicks:windup,activeTicks:active,recoveryTicks:recovery,
    windup:windup/60,active:active/60,recovery:recovery/60,damage,staminaDamage,
    stagger:stagger/60,chip,range:reach,stepIn,knockback,sourceContact,arc:90,parryable:true,cooldown:0});
export const KNIFE_MOVES = Object.freeze({
  light_right:move('light_right','Attack','light_right',14,6,16,10,10,18,0,1.2,.4,2,.34),
  light_left:move('light_left','Return','light_left',14,6,16,10,10,18,0,1.2,.4,2,.34),
  thrust:move('thrust','Riposte','thrust',12,4,20,9,12,14,0,1.45,1,2,.34),
  heavy_overhead:move('heavy_overhead','Heavy','heavy_overhead',22,5,26,14,20,20,.2,1.55,.55,3,.48),
  skill_pommel:Object.freeze({...move('skill_pommel','Skill_Pommel',null,18,4,18,20,30,50,.4,1.3,.55,0,.45),cooldown:15})
});
export const KNIFE_COOLDOWNS = Object.freeze({heavy:0,special:15,dodge:36/60});
// Shared by donor animation sampling and its offline bake. Character must use this
// for path-backed moves; Skill_Pommel has its own authored phase map.
export function swingProgress(progress,contact=.35,sourceContact=.34){
  const keys=[[0,0],[contact*.7,sourceContact*.44],[contact,sourceContact],[contact+.16,sourceContact+(1-sourceContact)*.56],[1,1]];
  const p=Math.max(0,Math.min(1,progress));
  for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){const [x,y]=keys[i-1],[end,value]=keys[i];return y+(value-y)*(p-x)/(end-x);}
  return 1;
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const clamp=x=>Math.max(0,Math.min(1,x));
export function segmentDistance(a,b,c,d){
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),denominator=aa*cc-bb*bb;
  let s=aa<1e-12?0:cc<1e-12?clamp(-dd/aa):denominator>1e-12?clamp((bb*ee-cc*dd)/denominator):0;
  let t=cc<1e-12?0:(bb*s+ee)/cc;
  if(t<0){t=0;s=aa<1e-12?0:clamp(-dd/aa);}else if(t>1){t=1;s=aa<1e-12?0:clamp((bb-dd)/aa);}
  return Math.hypot(...sub(mix(a,b,s),mix(c,d,t)));
}
export function bladePose(rig,path,age){
  const frames=knifePaths[rig]?.[path];if(!frames)throw Error(`no knife ${path} bake on ${rig}`);
  const frame=Math.max(0,Math.min(frames.length-1,age)),index=Math.floor(frame);
  return mix(frames[index],frames[Math.min(index+1,frames.length-1)],frame-index);
}
// Domain reflection matches actors.js yaw atan2(facing.x,-facing.z) and world
// toRender(x,y,-z). Local +Z points forward; local +X points to domain -X at +Z.
export function worldBlade(body,path,age){
  const pose=bladePose(body.rig,path,age),f=body.facing,k=body.combatScale??1;
  return [0,3].map(o=>{const [x,y,z]=pose.slice(o,o+3);return [body.pos.x+k*(-x*f.z+z*f.x),y*k,body.pos.z+k*(x*f.x+z*f.z)];});
}
export function bladeContact(attackerBefore,attackerAfter,targetBefore,targetAfter,path,fromAge,toAge){
  const relative=(blade,target)=>blade.map(p=>[p[0]-target.pos.x,p[1],p[2]-target.pos.z]);
  const a=relative(worldBlade(attackerBefore,path,fromAge),targetBefore),b=relative(worldBlade(attackerAfter,path,toAge),targetAfter);
  const steps=Math.max(1,Math.ceil(Math.max(Math.hypot(...sub(a[0],b[0])),Math.hypot(...sub(a[1],b[1])))/.02));
  const k=(targetAfter.combatScale??1)*(targetAfter.bodyScale??1);
  for(let i=0;i<=steps;i++)if(segmentDistance(mix(a[0],b[0],i/steps),mix(a[1],b[1],i/steps),[0,.55*k,0],[0,1.45*k,0])<=.31*k)return true;
  return false;
}
