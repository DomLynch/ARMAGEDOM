// Transient continuous melee; original receipt, damage and world authorities stay owners.
export const BONE_SAW_RULES=Object.freeze({interval:.2,damage:5,range:1.55,coneDegrees:38,moveScale:.4,staminaPerSecond:10,staggerAfter:3,staggerSeconds:.16,staggerRecovery:1.4});
export const BONE_SAW_ITEM_ID='surgeons-knife-v1';
export function boneSawEquipped(g){const p=g.world?.bossEquipmentData?.surgicalKnife,s=g.bossEquipment?.surgicalKnife;return !!p&&s?.status==='owned'&&s.selected&&s.rewardReceipt===p.source.receiptId&&g.player.weapon==='knife'&&!g.flame?.equipped;}
export function stopBoneSaw(g,actor,reason='release'){const s=actor?.saw;if(s?.active)g.events.push({type:'saw-stop',actor,reason});if(s){s.active=false;s.contactId=null;s.contactTicks=0;}return s;}
export function boneSawIntent(g,intent){
 const p=g.player,owns=boneSawEquipped(g),held=(intent.held??[]).includes('slash')||(intent.actions??[]).includes('slash');
 const legal=owns&&held&&!intent.cancel&&!intent.paused&&!intent.dodge&&!intent.guard&&!g.finished&&!g.runSaveInvalid&&!g.weaponsLowered&&p.hp>0&&!p.swing&&g.time>=(p.ready??0)&&g.time>=(p.hurtUntil??0)&&g.time>=(p.dodgeUntil??0)&&(p.stamina??p.guard)>0;
 if(!legal)stopBoneSaw(g,p,owns?'interrupted':'unequipped');
 else{p.saw??={active:false,nextHitAt:0,contactTicks:0,contactId:null};if(!p.saw.active)g.events.push({type:'saw-start',actor:p});p.saw.active=true;}
 return owns?{...intent,sawCutting:legal,actions:(intent.actions??[]).filter(a=>!['slash','stab','heavy','special'].includes(a)),held:(intent.held??[]).filter(a=>!['slash','stab'].includes(a))}:intent;
}
export function stepBoneSaw(g,actor,targets,{damage=BONE_SAW_RULES.damage,hit,spend=()=>{},protectedTarget=()=>false,contact=()=>false}={}){
 const s=actor.saw;if(!s?.active||g.time+1e-8<s.nextHitAt)return null;s.nextHitAt=g.time+BONE_SAW_RULES.interval;
 let target=null,distance=Infinity;const minimum=Math.cos(BONE_SAW_RULES.coneDegrees*Math.PI/180);
 for(const e of targets){if(e===actor||e.hp<=0||e.hostile===false||e.visible===false||(e.areaId!=null&&e.areaId!==g.world.areaId)||protectedTarget(e))continue;const dx=e.pos.x-actor.pos.x,dz=e.pos.z-actor.pos.z,n=Math.hypot(dx,dz);if(n>BONE_SAW_RULES.range+e.radius||n>=distance||n>1e-8&&(dx*actor.facing.x+dz*actor.facing.z)/n<minimum||!g.world.lineClear(actor.pos,e.pos)||!contact(actor,e))continue;target=e;distance=n;}
 if(!target){s.contactId=null;s.contactTicks=0;return null;}
 s.contactTicks=s.contactId===target.id?s.contactTicks+1:1;s.contactId=target.id;spend();
 const dx=target.pos.x-actor.pos.x,dz=target.pos.z-actor.pos.z,n=Math.hypot(dx,dz)||1;hit(target,damage,{x:dx/n,z:dz/n});g.events.push({type:'saw-contact',actor,targetId:target.id,position:{...target.pos},weapon:'bone-saw',amount:damage});
 if(target!==g.player&&target.hp>0&&s.contactTicks>=BONE_SAW_RULES.staggerAfter&&g.time>=(target.sawStaggerReadyAt??0)){target.staggerUntil=g.time+BONE_SAW_RULES.staggerSeconds;target.sawStaggerReadyAt=g.time+BONE_SAW_RULES.staggerRecovery;target.swing=null;stopBoneSaw(g,target,'stagger');s.contactTicks=0;g.events.push({type:'saw-stagger',actor:target,until:target.staggerUntil});}
 return target;
}
export function stepSurgeonSaw(g,e,dt,{patrol,move,receive,contact}={}){
 if(e.bossProfile?.weapon?.kind!=='saw')return false;
 const w=e.bossProfile.weapon,t=g.time,p=g.player;if(e.hp<=0||p.hp<=0||g.finished||t<e.recoverUntil||t<e.staggerUntil){stopBoneSaw(g,e,'interrupted');e.sawPhase=null;return true;}
 if(!e.sawPhase&&e.home&&patrol(g,e,dt))return true;
 const dx=p.pos.x-e.pos.x,dz=p.pos.z-e.pos.z,n=Math.hypot(dx,dz)||1,dir={x:dx/n,z:dz/n};
 if(!e.sawPhase){if(t<e.ready)return true;if(n>w.range||!g.world.lineClear(e.pos,p.pos)){move(g,e,dir,e.moveSpeed,dt);return true;}e.facing=dir;e.sawPhase={phase:'windup',until:t+w.windupTicks/60};g.events.push({type:'saw-warning',actor:e});}
 const phase=e.sawPhase;
 if(phase.phase==='windup'&&t>=phase.until){phase.phase='active';phase.until=t+w.activeTicks/60;e.saw={active:true,nextHitAt:t,contactId:null,contactTicks:0};g.events.push({type:'saw-start',actor:e});}
 if(phase.phase==='active'){if(t>=phase.until){stopBoneSaw(g,e,'recovery');phase.phase='recovery';phase.until=t+w.recoveryTicks/60;}else stepBoneSaw(g,e,[p],{damage:w.damage,contact,hit:(victim,amount)=>receive(g,{amount,origin:e.pos,attacker:e,block:true,parry:false,moveId:'bone-saw',def:{stagger:.12,chip:.1,staminaDamage:amount}})});}
 if(phase.phase==='recovery'&&t>=phase.until){e.sawPhase=null;e.ready=t+.1;}return true;
}

export function stopAllBoneSaws(g,reason='cancel'){if(!g)return;for(const actor of[g.player,...g.enemies]){stopBoneSaw(g,actor,reason);if(actor)actor.sawPhase=null;}}
