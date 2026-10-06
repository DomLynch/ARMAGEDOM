import {createMobileAimState,stepMobileAim} from './mobile-combat-aim.js';
import {selectFinisher} from './finisher-selection.js';
import {allocateMobSizes} from './mob-size-allocation.js';
import {mobSizeProfile} from './mob-size.js';
import {createSuppliesState,issueSupply} from './supplies.js';
import {createVestState,damageAfterVest} from './vest.js';
import {AREA_MOB_SPAWNS} from './area-mob-spawns.js';
import {selectCombatTarget,resolvePistolShot} from './pistol-targeting.js';
import {createPistolState, stepPistol} from './pistol.js';
import {createHollowEncounter} from './hollow-encounter.js';
import {KNIFE_RULES as R, KNIFE_MOVES, KNIFE_COOLDOWNS, KNIFE_STAMINA_COSTS, bladeContact} from './donor/knife.js';
// Port of the pinned Unity Westminster encounter. Domain x/z stays in Unity metres.
export const attacks={
 slash:{windup:.14,recovery:.28,range:2.6,arc:100,multiplier:1,stagger:.10,cooldown:0},
 stab:{windup:.12,recovery:.24,range:3.1,arc:24,multiplier:1.2,stagger:.12,cooldown:0,single:true},
 heavy:{windup:.36,recovery:.42,range:3.2,arc:130,multiplier:2.1,stagger:.3,cooldown:1.6},
 special:{windup:.20,recovery:.38,range:4.2,arc:360,multiplier:2.2,stagger:.3,cooldown:7}
};
const RAT_LOW=Object.freeze({...KNIFE_MOVES.light_right,moveId:'rat_low',clip:'RatLowSlash',path:null,native:true,ratLow:true,windupTicks:20,activeTicks:6,recoveryTicks:28,windup:20/60,active:6/60,recovery:28/60,stepIn:0,knockback:0});
const RAT_BITE=Object.freeze({...RAT_LOW,moveId:'rat_bite',clip:'rat_bite',ratLow:false,ratBite:true,windupTicks:15,activeTicks:6,recoveryTicks:15,windup:15/60,active:6/60,recovery:15/60,damage:6,staminaDamage:6,stamina:0,parryable:false,range:.95});
const RAT_BITE_LOW=Object.freeze({...RAT_BITE,clip:'rat_bite_low'});
const DOG_LOW=Object.freeze({...RAT_LOW,moveId:'dog_low'});
const DOG_BITE=Object.freeze({...RAT_BITE,moveId:'dog_bite',clip:'dog_bite_calf',windupTicks:18,activeTicks:6,recoveryTicks:24,windup:18/60,active:6/60,recovery:24/60,damage:8,staminaDamage:8,range:1.17});
const EPS=1e-8,mag=v=>Math.hypot(v.x,v.z),sub=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
export function normal(v,fallback={x:0,z:1}){const n=mag(v);return n>.001?{x:v.x/n,z:v.z/n}:{...fallback};}
const validDirection=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.z)&&mag(v)>.001;
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const inside=(dir,delta,arc)=>mag(delta)<.001||dot(normal(dir),normal(delta))+EPS>=Math.cos(arc*Math.PI/360);
const rotate=(v,angle)=>({x:v.x*Math.cos(angle)+v.z*Math.sin(angle),z:v.z*Math.cos(angle)-v.x*Math.sin(angle)});
let serial=0;
export function enemy(kind,pos){const hp=[55,95,50,400][kind];return {id:++serial,kind,pos:{...pos},facing:{x:0,z:-1},hp,maxHP:hp,radius:kind===3?.65:.4,ready:0,recoverUntil:0,staggerUntil:0,alerted:false,pattern:0,swing:null,flashUntil:0};}
export function createGame(world,options={}){
 if(options.encounter&&(options.pilot!=='donor-knife'||options.encounter.id!=='hollow-scavengers'))throw Error('Unsupported combat encounter');
 const encounter=options.encounter?createHollowEncounter(options.encounter.character,options.encounter):null;
 const g={world,time:0,wave:0,kills:0,nextWave:2,started:false,finished:false,won:false,events:[],enemies:[],bolts:[],loot:[],message:'Move to enter combat. Survive three waves.',messageUntil:4,player:{id:0,kind:-1,pos:{...(world.spawn??{x:0,z:-6})},facing:{x:0,z:1},hp:100,maxHP:100,damage:20,weaponLevel:0,armourLevel:0,radius:.4,guard:100,guarding:false,parryUntil:0,guardBrokenUntil:0,guardRecoverAt:0,ready:0,heavyReady:0,specialReady:0,dodgeReady:0,dodgeUntil:0,invulnerableUntil:0,swing:null,buffer:null,velocity:{x:0,z:0},flashUntil:0}};
 if(options.pilot==='donor-knife'){
  g.pilot='donor-knife';g.corpses=[];g.cooldowns=KNIFE_COOLDOWNS;g.staminaCosts=KNIFE_STAMINA_COSTS;g.tick=0;
  knifeEnergy(g.player);
  Object.assign(g.player,{rig:'hero',weapon:'knife',combatScale:world.layout?.characterScale??1.265,bodyScale:1,hp:R.health,maxHP:R.health,lastMove:null,parryReady:0,guardExposedUntil:0,hurtUntil:0,dodgeStart:-Infinity});
  g.message='LONDON · Knife encounter. Slash, stab, heavy, pommel, dodge, guard.';
  if(encounter){g.encounter=encounter;g.nextEnemyAttackAt=0;g.message='LONDON · Hollow scavengers. Keep space, guard, then counter.';}
 }
 if(options.rat)g.rat=true;
 if(options.dog)g.dog=true;
 if(options.finishers&&g.pilot)g.finishers={maxHeads:options.finishers==='pistol-only'?0:2,recentRecipeId:null};
 if(options.mobileControls)g.mobileAim=createMobileAimState(Math.atan2(g.player.facing.x,g.player.facing.z));
 if(options.supplies)g.supplies=createSuppliesState();
 if(options.vest)g.vest=createVestState();
 if(options.areaResidents&&encounter){g.areaResidents=true;g.areaFights={};g.areaInitialized=false;g.openingGroup=options.openingGroup!==false;if(!g.openingGroup)initializeAreaResidents(g);}
 if(options.pistol)g.pistol=createPistolState({pickupPos:{x:-.85,z:-6.15},pickupAreaId:'westminster'});
 return g;
}
function notify(g,text){g.message=text;g.messageUntil=g.time+4;}
function event(g,type,data={}){g.events.push({type,...data});}
function pistolIntent(g,intent){
 if(!g.pistol)return intent;
 const p=g.player,wasEquipped=g.pistol.equipped,actions=intent.actions??[],canAct=p.hp>0&&!g.finished&&!intent.dodge&&!p.swing&&g.time>=p.hurtUntil&&g.time>=p.dodgeUntil;
 const firing=wasEquipped&&(actions.includes('fire')||intent.held?.includes('fire'));
 const explicit=validDirection(intent.aim);
 const moving=mag(intent.move??{x:0,z:0})>.01;
 const reference=g.mobileAiming?{...p.facing}:explicit?normal(intent.aim):moving?normal(intent.move):g.pistolUserFacing??{...p.facing};
 // Preserve unassisted user intent between shots, never a resolved target bearing.
 if(wasEquipped)g.pistolUserFacing={...reference};
 g.pistolTargetId=null;g.pistolTargetFacing=null;
 let shotDirection=null;
 const result=stepPistol(g.pistol,{time:g.time,areaId:g.world.areaId??'westminster',position:p.pos,facing:p.facing,aim:reference,
  collect:actions.includes('pickup'),equip:actions.includes('pickup'),holster:wasEquipped&&actions.includes('heavy'),reload:wasEquipped&&actions.includes('stab'),
  fire:firing,cancel:!!intent.cancel,canAct,targets:g.enemies,lineClear:(a,b)=>g.world.lineClear(a,b)});
 g.pistol=result.state;p.weapon=g.pistol.equipped?'pistol':'knife';
 for(let e of result.events){
  if(e.type==='shot'){
   if(!g.mobileAiming)e={...e,...resolvePistolShot({position:e.origin,aim:reference,targets:g.enemies,
    visibleIds:intent.combatVisibleIds??intent.pistolVisibleIds,lineClear:(a,b)=>g.world.lineClear(a,b),areaId:g.world.areaId})};
   shotDirection=e.direction;
  }
  event(g,e.type,{...e,actor:p});
  if(e.type==='pickup')notify(g,'PISTOL EQUIPPED · Left stick aims; hold Fire to shoot. Mouse aims on desktop.');
  if(e.type==='holster')notify(g,'KNIFE EQUIPPED · Equip pistol with the equipment button or G.');
  if(e.type==='equip')notify(g,'PISTOL EQUIPPED');
  if(e.type==='dry')notify(g,g.pistol.reserve?'EMPTY · Reload.':'OUT OF AMMO · Switch to melee.');
  if(e.type==='shot'&&e.targetId!==null&&e.targetId!==undefined){const target=g.enemies.find(t=>t.id===e.targetId&&t.hp>0);if(!target)continue;
   const amount=Math.min(target.hp,e.damage);target.hp=Math.max(0,target.hp-e.damage);target.flashUntil=g.time+.12;if(target.home){target.alerted=true;target.returning=false;}
   event(g,'hit',{actor:target,amount,position:{...target.pos},weapon:'pistol',attackClass:'bullet',impactDirection:{...e.direction},parry:false});
   if(target.hp<=0){target.swing=null;target.response={clip:target.rig==='original-rat'?'rat_death':target.rig==='original-dog'?'dog_death':'Death',start:g.time,ticks:target.rig==='original-rat'?54:target.rig==='original-dog'?60:144};kill(g,target,{weapon:'pistol',attackClass:'bullet',impactDirection:{...e.direction}});}
  }
 }
 if(g.finished||!g.enemies.some(e=>e.id===g.pistolTargetId&&e.hp>0)){g.pistolTargetId=null;g.pistolTargetFacing=null;}
 if(!wasEquipped&&g.pistol.equipped)g.pistolUserFacing={...reference};
 if(!g.pistol.equipped){g.pistolUserFacing=null;}
 if(wasEquipped||g.pistol.equipped){p.buffer=null;p.guarding=false;p.parryUntil=0;return {...intent,aim:shotDirection??(explicit||moving?reference:null),guard:false,guardPressed:false,actions:[],held:[]};}
 return {...intent,actions:actions.filter(a=>a!=='pickup')};
}
function moveBody(g,body,d){let next=g.world.move(body.pos,d,body.radius); // World owns static collision.
 for(const other of [g.player,...g.enemies]){if(other===body||other.hp<=0)continue;const delta=sub(next,other.pos),n=mag(delta),r=body.radius+other.radius;if(n<r&&n>.001){next=g.world.move(body.pos,{x:next.x-body.pos.x+delta.x/n*(r-n),z:next.z-body.pos.z+delta.z/n*(r-n)},body.radius);}}
 body.pos=next;
}
export function attack(g,action,direction=g.player.facing,visibleIds){const p=g.player;let def=g.pilot?knifeMove(p,action):attacks[action],lowTargetId=null;
 if(p.weapon==='pistol'||!def||g.pilot&&p.hurtUntil>g.time||p.hp<=0||g.finished||p.dodgeUntil>g.time||p.guardBrokenUntil>g.time)return false;
 if((action==='heavy'&&p.heavyReady>g.time+EPS)||(action==='special'&&p.specialReady>g.time+EPS))return false;
 if(g.pilot&&!knifeAffordable(p,def.stamina)){p.buffer=null;return false;}
 if(p.ready>g.time+EPS){if(p.ready-g.time<=(g.pilot?R.bufferWindow/60:.12)+EPS)p.buffer={action,dir:normal(direction),until:p.ready+(g.pilot?R.bufferTtl/60:.12)};return false;}
 if(g.pilot&&action==='slash'){const closest=selectCombatTarget({nearest:true,position:p.pos,targets:g.enemies.filter(e=>!visibleIds||visibleIds.includes(e.id)),lineClear:(a,b)=>g.world.lineClear(a,b),range:RAT_LOW.range*p.combatScale,areaId:g.world.areaId});const rig=g.enemies.find(e=>e.id===closest?.targetId)?.rig;if(rig==='original-rat'||rig==='original-dog'){def=rig==='original-dog'?DOG_LOW:RAT_LOW;lowTargetId=closest.targetId;}}
 if(g.pilot)knifeSpend(g,p,def.stamina);
 p.buffer=null;p.guarding=false;p.parryUntil=0;p.guardRecoverAt=g.time+(g.pilot?R.regenDelay/60:.45);p.facing=normal(direction,p.facing);
 const windupTicks=def.windupTicks??Math.floor(def.windup*60),range=def.range*(g.pilot?p.combatScale:1)+(g.pilot?R.walkSpeed*def.stepIn*Math.max(0,windupTicks-R.stepInFrom-1)/60:0);
 const nearest=['slash','stab','heavy'].includes(action);
 const selected=g.mobileAssistEnabled===false?null:selectCombatTarget({nearest,position:p.pos,aim:p.facing,targets:g.enemies.filter(e=>!visibleIds||visibleIds.includes(e.id)),lineClear:(a,b)=>g.world.lineClear(a,b),range,rangeOffset:target=>target.mobSize? .31*target.combatScale*(target.bodyScale??1)*(1-1/target.mobSize):0,coneDegrees:45,areaId:g.world.areaId});
 if(selected&&nearest)p.facing={...selected.direction};
 p.swing={action,def,dir:{...p.facing},start:g.time,hitAt:g.time+def.windup,end:g.time+def.windup+def.recovery,resolved:false};p.ready=p.swing.end;if(g.pilot){Object.assign(p.swing,knifeSwing(g,p,action,def));p.ready=p.swing.end;if(lowTargetId!==null)p.swing.lowTargetId=lowTargetId;}
 if(selected&&!nearest){p.swing.turnTo={...selected.direction};p.swing.assistUntil=g.time+Math.min(def.windup-1/60,8/60);}
 if(action==='heavy')p.heavyReady=g.time+def.cooldown;if(action==='special')p.specialReady=g.time+def.cooldown;
 g.started=true;event(g,'attack',{actor:p,action,...(g.pilot?{moveId:def.moveId,clip:def.clip,weapon:'knife',material:'iron'}:{})});return true;
}
function dodge(g,move,aim){if(g.pilot){knifeDodge(g,move,aim);return;}const p=g.player;if(g.finished||p.hp<=0||p.dodgeReady>g.time+EPS)return;
 p.swing=null;p.buffer=null;p.guarding=false;p.parryUntil=0;p.velocity={x:0,z:0};p.dodgeDirection=normal(move??p.facing,p.facing);p.facing={...p.dodgeDirection};p.dodgeUntil=g.time+.22;p.invulnerableUntil=g.time+.25;p.dodgeReady=g.time+1.05;g.started=true;event(g,'dodge',{actor:p});
}
export function receiveHit(g,hit){if(g.pilot)return g.finished?false:knifeReceive(g,hit);const p=g.player,t=g.time;if(g.finished||p.hp<=0||t<p.invulnerableUntil)return false;
 let amount=hit.amount;
 if(p.guarding&&hit.block&&inside(p.facing,sub(hit.origin,p.pos),140)){
  p.guardRecoverAt=t+.45;
  if(t<p.parryUntil&&hit.parry&&p.guard>=amount){p.guard-=amount;p.parryUntil=0;
   if(hit.attacker&&hit.attacker.kind!==3){hit.attacker.swing=null;hit.attacker.ready=hit.attacker.recoverUntil=hit.attacker.staggerUntil=t+.9;}
   notify(g,'PARRY · Counter while they recover.');event(g,'parry',{actor:p});return false;
  }
  const cost=amount*3;if(p.guard>=cost){p.guard-=cost;amount*=.25;event(g,'block',{actor:p});}
  else{p.guard=0;p.guarding=false;p.parryUntil=0;p.guardBrokenUntil=t+.9;notify(g,'GUARD BROKEN · Dodge or make space.');event(g,'guard-break',{actor:p});}
 }
 p.hp=Math.max(0,p.hp-amount);p.flashUntil=t+.12;event(g,'hit',{actor:p,amount});if(p.hp<=0){g.finished=true;g.won=false;event(g,'death',{actor:p});}return true;
}
function kill(g,e,meta={}){
 if(!g.enemies.includes(e))return;
 if(g.finishers&&!e.finisher){
  const active=(g.corpses??[]).filter(c=>c.finisherHeadUntil>g.time).length;
  e.finisher=selectFinisher({victimId:e.id,lethal:e.hp<=0,...meta},{support:e.finisherSupport??[],budget:Math.max(0,g.finishers.maxHeads-active),ordinal:g.kills,recentRecipeId:g.finishers.recentRecipeId});
  if(e.finisher){g.finishers.recentRecipeId=e.finisher.recipeId;if(e.finisher.parts.includes('head'))e.finisherHeadUntil=g.time+6;}
 }
 if(g.supplies)g.supplies=issueSupply(g.supplies,{areaId:g.world.areaId,placementKey:e.placementKey,position:e.pos,hp:e.hp}).state;g.enemies=g.enemies.filter(x=>x!==e);g.kills++;event(g,'death',{actor:e,...meta});if(g.pilot){g.corpses.push(e);if(!g.enemies.length){if(g.areaResidents){g.encounterCleared=true;g.encounterActive=false;}else{g.finished=true;g.won=g.player.hp>0;}notify(g,g.encounter?'LONDON · Hollow encounter cleared.':'LONDON · Knife encounter cleared.');}return;}if(e.kind===3){g.finished=true;g.won=true;return;}
 if(g.kills%2===0)g.loot.push({id:++serial,pos:{...e.pos},kind:(g.kills/2-1)%3,tier:Math.min(2,g.wave-1)});
 if(!g.enemies.length){g.player.hp=Math.min(g.player.maxHP,g.player.hp+25);g.nextWave=g.time+4;notify(g,'WAVE CLEARED · +25 HP');}
}
function strike(g,s){const p=g.player,def=s.def;event(g,'strike',{actor:p,action:s.action,dir:s.dir,range:def.range});
 const candidates=g.enemies.filter(e=>e.hp>0&&mag(sub(e.pos,p.pos))<=def.range+EPS&&inside(s.dir,sub(e.pos,p.pos),def.arc)&&g.world.lineClear(p.pos,e.pos));
 if(def.single)candidates.sort((a,b)=>mag(sub(a.pos,p.pos))-mag(sub(b.pos,p.pos)));
 for(const e of def.single?candidates.slice(0,1):candidates){const delta=normal(sub(e.pos,p.pos));e.hp=Math.max(0,e.hp-p.damage*def.multiplier);e.flashUntil=g.time+.12;event(g,'hit',{actor:e,amount:p.damage*def.multiplier});
  if(e.hp<=0)kill(g,e);else if(e.kind!==3){e.staggerUntil=g.time+def.stagger;moveBody(g,e,{x:delta.x*.18,z:delta.z*.18});}
 }
}
export function spawnWave(g){if(g.encounter)return hollowSpawn(g);if(g.pilot){const position=knifeSpawnPosition(g);if(!position)return false;g.wave=1;g.enemies=[knifeEnergy(Object.assign(enemy(0,position),{rig:'goblin',weapon:'knife',combatScale:g.player.combatScale,bodyScale:R.goblinBodyScale,hp:R.goblinHealth,maxHP:R.goblinHealth,lastMove:null}),R.goblinRegen)];notify(g,'LONDON · Goblin knife encounter');event(g,'wave');return;}g.wave++;const count=g.wave===3?1:4+g.wave;g.enemies=Array.from({length:count},(_,i)=>enemy(g.wave===3?3:i%3,{x:count===1?0:(i%5-2)*1.7,z:-1+Math.floor(i/5)*2.4}));notify(g,g.wave===3?'ORC WARLORD · Dodge, then strike.':`WESTMINSTER · Wave ${g.wave}/3`);event(g,'wave');}
const radius=e=>e.kind===3?(e.pattern===1?4:3.5):e.kind===1?2.8:1.8;
const arc=e=>e.kind===3&&e.pattern===1?360:e.kind===1?110:90;
function bolt(g,pos,dir,amount){g.bolts.push({id:++serial,pos:{...pos},dir:{...dir},amount,expires:g.time+4});}
function enemyTick(g,e,dt){if(g.pilot){knifeEnemy(g,e,dt);return;}if(e.hp<=0)return;const t=g.time,offset=sub(g.player.pos,e.pos),distance=mag(offset),dir=normal(offset,e.facing);
 if(!e.alerted&&distance>12)return;e.alerted=true;
 if(e.swing){if(t+EPS>=e.swing.hitAt){const s=e.swing;e.swing=null;const ranged=e.kind===2||e.kind===3&&e.pattern===2,amount=e.kind===3?25:e.kind===1?23:e.kind===2?12:9;
   if(ranged){bolt(g,s.pos,s.dir,amount);if(e.kind===3){bolt(g,s.pos,rotate(s.dir,Math.PI/10),amount);bolt(g,s.pos,rotate(s.dir,-Math.PI/10),amount);}}
   else{const delta=sub(g.player.pos,s.pos);if(mag(delta)<radius(e)+.25&&inside(s.dir,delta,arc(e))&&g.world.lineClear(s.pos,g.player.pos))receiveHit(g,{amount,origin:s.pos,attacker:e,block:e.kind!==3,parry:e.kind===0});}
   e.recoverUntil=Math.max(e.recoverUntil,t+(e.kind===1||e.kind===3?.95:.45));e.ready=Math.max(e.ready,t+(e.kind===0?1.2:1.9));if(e.kind===3)e.pattern=(e.pattern+1)%3;
  }return;}
 if(t<e.recoverUntil||t<e.staggerUntil)return;
 const ranged=e.kind===2||e.kind===3&&e.pattern===2,reach=ranged?8:radius(e)-.25;
 if(distance>reach||!g.world.lineClear(e.pos,g.player.pos)){enemyMove(g,e,dir,e.kind===1?1.65:e.kind===3?2.1:2.8,dt);return;}
 if(e.kind===2&&distance<4&&t<e.ready)enemyMove(g,e,{x:-dir.x,z:-dir.z},2,dt,true);else e.facing=turn(e.facing,dir,360*dt);
 if(t+EPS>=e.ready&&dot(e.facing,dir)>.96){const delay=e.kind===0?.4:e.kind===2?.65:1.05;e.swing={dir,pos:{...e.pos},start:t,hitAt:t+delay,end:t+delay+.28};event(g,'enemy-attack',{actor:e,dir,range:radius(e),arc:arc(e)});}
}
function turn(a,b,degrees){const cross=a.x*b.z-a.z*b.x,d=dot(a,b);const angle=Math.atan2(cross,d),limit=degrees*Math.PI/180;const theta=Math.sign(angle)*Math.min(Math.abs(angle),limit);return normal({x:a.x*Math.cos(theta)-a.z*Math.sin(theta),z:a.x*Math.sin(theta)+a.z*Math.cos(theta)});}
function enemyMove(g,e,dir,speed,dt,backward=false){let delta={x:dir.x*speed*dt,z:dir.z*speed*dt},next=g.world.move(e.pos,delta,e.radius);
 if(mag(sub(next,e.pos))<speed*dt*.25){const side={x:-dir.z,z:dir.x};delta={x:side.x*speed*dt,z:side.z*speed*dt};next=g.world.move(e.pos,delta,e.radius);if(mag(sub(next,e.pos))<speed*dt*.25)delta={x:-delta.x,z:-delta.z};dir=normal(delta);}
 e.facing=turn(e.facing,backward?{x:-dir.x,z:-dir.z}:dir,360*dt);const align=Math.max(0,dot(e.facing,backward?{x:-dir.x,z:-dir.z}:dir));moveBody(g,e,{x:dir.x*speed*dt*align,z:dir.z*speed*dt*align});
}
function projectiles(g,dt){for(const b of g.bolts){if(g.time>=b.expires){b.dead=true;continue;}const next={x:b.pos.x+b.dir.x*8*dt,z:b.pos.z+b.dir.z*8*dt};if(!g.world.lineClear(b.pos,next)){b.dead=true;continue;}
 const seg=sub(next,b.pos),delta=sub(g.player.pos,b.pos),length=dot(seg,seg),t=Math.max(0,Math.min(1,dot(delta,seg)/Math.max(.0001,length)));if(mag(sub(g.player.pos,{x:b.pos.x+seg.x*t,z:b.pos.z+seg.z*t}))<.6){receiveHit(g,{amount:b.amount,origin:b.pos});b.dead=true;}else b.pos=next;
 }g.bolts=g.bolts.filter(b=>!b.dead);}
function collect(g){const p=g.player;for(const l of g.loot){if(mag(sub(l.pos,p.pos))>=1.3)continue;l.collected=true;
 if(l.kind===0){const pct=.1+l.tier*.025;p.damage*=1+pct;p.weaponLevel++;notify(g,`BLADE +${Math.round(pct*100)}% damage`);}
 else if(l.kind===1){const hp=15+l.tier*5;p.maxHP+=hp;p.hp=Math.min(p.maxHP,p.hp+hp);p.armourLevel++;notify(g,`ARMOUR +${hp} max HP`);}else{const hp=30+l.tier*10;p.hp=Math.min(p.maxHP,p.hp+hp);notify(g,`TONIC +${hp} HP`);}event(g,'loot',{actor:p});
 }g.loot=g.loot.filter(l=>!l.collected);}
export function resetMobileControls(g){
 if(!g?.mobileAim)return;
 g.mobileAim=createMobileAimState(Math.atan2(g.player.facing.x,g.player.facing.z));g.mobileAiming=false;g.player.velocity={x:0,z:0};
}
function mobileControl(g,intent,dt){
 if(!g.mobileAim)return intent;
 const p=g.player,heading=Math.atan2(p.facing.x,p.facing.z);
 if(intent.mobile&&!intent.moveHeld)p.velocity={x:0,z:0};
 if(!intent.mobile||intent.cancel||validDirection(intent.aim)){
  g.mobileAim=createMobileAimState(heading);g.mobileAiming=false;
  if(intent.cancel)p.velocity={x:0,z:0};return intent;
 }
 const areaId=g.world.areaId,visible=intent.combatVisibleIds??intent.pistolVisibleIds;
 const busy=!!p.swing||g.time<p.dodgeUntil||g.time<p.hurtUntil||!!intent.guard&&!g.pistol?.equipped;
 if(busy)g.mobileAim={...g.mobileAim,heading};
 const result=stepMobileAim(g.mobileAim,{dt,move:intent.move??{x:0,z:0},position:p.pos,
  targets:g.enemies.map(e=>({id:e.placementKey,pos:e.pos,hp:e.hp,hostile:true,visible:!visible||visible.includes(e.id),areaId:e.areaId??areaId,radius:e.radius})),
  areaId,lineClear:(a,b)=>g.world.lineClear(a,b),mobile:true,moveHeld:!!intent.moveHeld,alive:p.hp>0,assistEnabled:g.mobileAssistEnabled,pistolEquipped:!!g.pistol?.equipped});
 g.mobileAim=result.state;g.mobileAiming=true;
 if(!intent.moveHeld)p.velocity={x:0,z:0};
 if(!busy)p.facing={...result.direction};
 return {...intent,move:result.move,aim:busy?null:{...p.facing}};
}
export function stepGame(g,intent={},dt=1/60){if(g.pilot&&(!Number.isFinite(dt)||Math.abs(dt-1/60)>EPS))throw Error('Knife pilot requires fixed 60 Hz simulation ticks');g.events=[];if(g.pilot)g.player.running=false;if(g.pilot&&(intent.cancel||intent.paused)){if(g.player.swing)g.player.swing.turnTo=null;g.player.buffer=null;g.player.guarding=false;g.player.parryUntil=0;g.player.parryReleased=true;}if(g.finished||intent.paused)return;const ratBefore=g.ratContact&&g.enemies.some(e=>['original-rat','original-dog'].includes(e.rig)&&(e.alerted||e.swing||mag(sub(e.pos,g.player.pos))<=6))?g.ratContact.capture(g):null;const before=g.pilot?new Map([g.player,...g.enemies].map(e=>[e.id,snapshot(e)])):null;g.time+=dt;if(g.pilot)g.tick++;const p=g.player,t=g.time;intent=mobileControl(g,intent,dt);intent=pistolIntent(g,intent);if(!validDirection(intent.aim))intent={...intent,aim:null};const move=intent.move??{x:0,z:0};
 if(intent.dodge){const until=p.dodgeUntil;dodge(g,move,intent.aim);if(g.pistol?.equipped&&p.dodgeUntil!==until)g.pistolUserFacing={...p.facing};}
 const swinging=p.swing&&t<p.swing.end-EPS,dodging=t<p.dodgeUntil-EPS;
 p.guarding=!!intent.guard&&!dodging&&!swinging&&t>=p.guardBrokenUntil&&p.guard>0;
 if(g.pilot)knifeGuard(g,intent,swinging,dodging);else if(p.guarding&&intent.guardPressed)p.parryUntil=t+.16;if(!g.pilot&&!p.guarding)p.parryUntil=0;
 const sprintCandidate=!!(g.pilot&&intent.run&&!p.guarding&&!p.exhausted&&p.stamina>EPS&&!swinging&&!dodging&&t>=p.hurtUntil&&mag(move)>.01);
 if(g.pilot){if(!sprintCandidate)knifeRegen(g,p,dt,swinging||dodging||t<p.hurtUntil);}
 else if(!intent.guard&&t>=p.guardRecoverAt&&t>=p.guardBrokenUntil)p.guard=Math.min(100,p.guard+35*dt);
 if(intent.aim&&mag(intent.aim)>.001&&!swinging&&!dodging)p.facing=normal(intent.aim);
 if(p.buffer&&t>p.buffer.until)p.buffer=null;
 const attackDirection=validDirection(intent.aim)?normal(intent.aim):mag(move)>.01?normal(move):p.facing;
 const visibleIds=intent.combatVisibleIds??intent.pistolVisibleIds;
 const priority=['special','heavy','stab','slash'],fresh=[...(intent.cancel?[]:intent.actions??[])].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));for(const action of fresh){const buffer=p.buffer;if(attack(g,action,attackDirection,visibleIds)||p.buffer!==buffer)break;}
 if(!dodging&&p.buffer&&t+EPS>=p.ready){const buffer=p.buffer;p.buffer=null;attack(g,buffer.action,attackDirection,visibleIds);}
 if(!intent.cancel&&!fresh.length)for(const a of ['stab','slash'])if(intent.held?.includes(a)&&attack(g,a,attackDirection,visibleIds))break;
 if(p.swing?.turnTo){
  p.facing=turn(p.facing,p.swing.turnTo,360*dt);p.swing.dir={...p.facing};
  if(t+EPS>=p.swing.assistUntil)p.swing.turnTo=null;
 }
 if(!g.pilot&&p.swing&&!p.swing.resolved&&t+EPS>=p.swing.hitAt){p.swing.resolved=true;strike(g,p.swing);}
 if(!g.pilot&&p.swing&&t+EPS>=p.swing.end)p.swing=null;
 if(!g.finished){if(dodging)moveBody(g,p,{x:p.dodgeDirection.x*(g.pilot?R.rollSpeed:16)*dt,z:p.dodgeDirection.z*(g.pilot?R.rollSpeed:16)*dt});
 else if(!p.swing&&(!g.pilot||t>=p.hurtUntil)){
  const m=mag(move)>1?normal(move):move;
  const speed=g.pilot?(sprintCandidate?R.runSpeed:R.walkSpeed*(p.exhausted?R.exhaustWalk:1)):4.2;
  const scale=p.guarding?(g.pilot?R.guardSpeed:.4):1;
  const vel={x:m.x*speed*scale,z:m.z*speed*scale},difference=sub(vel,p.velocity),n=mag(difference),step=(mag(m)>.01?48:34)*dt;
  p.velocity=n<=step?vel:{x:p.velocity.x+difference.x/n*step,z:p.velocity.z+difference.z/n*step};
  const start={...p.pos};moveBody(g,p,{x:p.velocity.x*dt,z:p.velocity.z*dt});
  if(sprintCandidate&&mag(sub(p.pos,start))>EPS){
   p.running=true;p.guard=p.stamina-R.runDrain*dt; // No action recovery delay.
  }
  if(!intent.aim&&mag(m)>.01&&!p.guarding)p.facing=turn(p.facing,m,720*dt);
 }else {p.velocity={x:0,z:0};if(g.pilot)knifeStepIn(g,p,dt);}
 // Defer only a possible sprint tick until collision has proved displacement.
 // Unchanged non-sprint input retains the existing action/regen ordering.
 if(sprintCandidate&&!p.running)knifeRegen(g,p,dt,!!p.swing||dodging||t<p.hurtUntil);
 if(mag(sub(p.pos,g.world.spawn??{x:0,z:-6}))>=1)g.started=true;
 if(g.encounterActive!==false&&g.started&&!g.enemies.length&&t+EPS>=g.nextWave){if(g.wave>=3){g.finished=true;g.won=true;}else spawnWave(g);}
 for(const e of [...g.enemies]){enemyTick(g,e,dt);if(g.finished)break;}
 if(g.pilot)knifeContacts(g,before,ratBefore);
 if(!g.finished){projectiles(g,dt);collect(g);}
 }
 if(g.mobileAim){
  if(g.finished)resetMobileControls(g);
  else if(!g.enemies.some(e=>e.placementKey===g.mobileAim.targetId&&e.hp>0))g.mobileAim={...g.mobileAim,targetId:null,bearing:null};
 }
}

// One pool for action costs and defence. The legacy guard field is an alias,
// so existing HUD/hit callers cannot create a second independent resource.
function knifeEnergy(entity,regen=1){
 if(entity.maxStamina!==undefined)return entity;
 entity.stamina=R.maxStamina;entity.maxStamina=R.maxStamina;entity.exhausted=false;entity.staminaRegen=regen;
 entity.guardRecoverAt=0;
 Object.defineProperty(entity,'guard',{enumerable:true,configurable:true,get(){return this.stamina;},set(value){
  this.stamina=Math.max(0,Math.min(this.maxStamina,value));
  if(this.stamina<=EPS)this.exhausted=true;
 }});
 return entity;
}
function knifeAffordable(entity,cost){
 if(entity.stamina<=EPS)entity.exhausted=true;
 return !entity.exhausted&&entity.stamina+EPS>=cost;
}
function knifeSpend(g,entity,cost){
 entity.guard=Math.max(0,entity.stamina-cost);entity.guardRecoverAt=g.time+R.regenDelay/60;
 if(entity.exhausted){entity.guarding=false;entity.parryUntil=0;}
}
function knifeRegen(g,entity,dt,committed){
 if(entity.stamina<=EPS)entity.exhausted=true;
 if(!committed&&g.time+EPS>=entity.guardRecoverAt&&g.time+EPS>=(entity.guardBrokenUntil??0))
  entity.guard=entity.stamina+R.regen*(entity.staminaRegen??1)*(entity.guarding?R.guardRegen:1)*dt;
 if(entity.exhausted&&entity.stamina+EPS>=R.exhaustRecover)entity.exhausted=false;
}
function hollowSpawn(g){
 if(g.enemies.length||g.finished||g.wave)return false;
 const profile=g.encounter,c=profile.character,radius=.4*c.bodyScale,p=g.player,forward=normal(p.facing);
 const sectors=[forward,{x:forward.z,z:-forward.x},{x:-forward.z,z:forward.x},{x:-forward.x,z:-forward.z}];
 // Keep the whole group in one sector, leaving an open side. Plan every circle
 // before changing the wave or allocating IDs; a tight road retries atomically.
 for(const direction of sectors){
  const positions=[];
  for(const distance of [4,6,8])for(const lateral of [0,1.4,-1.4,2.8,-2.8]){
   if(positions.length===profile.count)continue;
   const position=g.world.move(p.pos,{x:direction.x*distance-direction.z*lateral,z:direction.z*distance+direction.x*lateral},radius);
   const delta=sub(position,p.pos),circleClear=g.world.geometry?.clear?.(position,radius)??g.world.clear?.(position,radius)??g.world.lineClear(position,position);
   if(!circleClear||!g.world.lineClear(p.pos,position)||dot(delta,direction)<2||mag(delta)<Math.max(2,p.radius+radius+.35))continue;
   if(positions.some(other=>mag(sub(position,other))<radius*2+.35))continue;
   positions.push(position);if(positions.length===profile.count)break;
  }
  if(positions.length!==profile.count)continue;
  g.wave=1;g.enemies=positions.map((position,index)=>hollowActor(g,position,index));
  if(g.areaResidents)initializeAreaResidents(g);
  notify(g,'LONDON · Hollow scavengers');event(g,'wave',{count:profile.count,encounter:profile.id});return true;
 }
 return false;
}
// The opening group and placed residents share the same Hollow factory/rules.
function hollowActor(g,position,index=0,mobSize=1){
 const profile=g.encounter,c=profile.character;
 return knifeEnergy(Object.assign(enemy(0,position),{rig:c.rig,contactRig:c.contactRig,weapon:c.weapon,
  ...mobSizeProfile({bodyScale:c.bodyScale,combatScale:g.player.combatScale,radius:.4*c.bodyScale},mobSize),mobSize,
  hp:profile.health,maxHP:profile.health,lastMove:null,moveSpeed:profile.moveSpeed,recoveryDelay:profile.recovery,
  ready:g.time+index*profile.aggression}),profile.regen);
}
export function initializeAreaResidents(g){
 if(!g.areaResidents||g.areaInitialized)return;
 const area=g.world.areaId??'westminster';
 // Legacy opening groups remain atomic; resident-only starts initialize directly.
 if(area==='westminster'&&!g.wave&&g.openingGroup!==false)return;
 const sizes=allocateMobSizes(area,AREA_MOB_SPAWNS[area].map(placement=>placement.key));
 const residents=AREA_MOB_SPAWNS[area].filter(p=>area!=='westminster'||!g.supplies?.issued.includes(p.key)).map(placement=>Object.assign(hollowActor(g,placement.pos,0,sizes.get(placement.key)),{
  placementKey:placement.key,home:{...placement.pos},patrol:placement.patrol,patrolIndex:1,returning:false
 }));
 if(g.rat&&area==='east'){const rat=residents.find(e=>e.placementKey==='east-roamer-7');if(rat)Object.assign(rat,{rig:'original-rat',contactRig:null,weapon:'teeth',mobSize:1,bodyScale:1,radius:.4,hp:20,maxHP:20,moveSpeed:2.1,recoveryDelay:0});}
 if(g.dog&&area==='south'){const dog=residents.find(e=>e.placementKey==='south-roamer-8');if(dog)Object.assign(dog,{rig:'original-dog',contactRig:null,weapon:'teeth',mobSize:1,bodyScale:1,radius:.77,hp:30,maxHP:30,moveSpeed:2.6,recoveryDelay:0});}
 g.enemies.push(...residents);g.areaInitialized=true;g.encounterActive=g.enemies.length>0;g.encounterCleared=!g.enemies.length;
 if(area!=='westminster'||g.openingGroup===false){g.wave=1;g.nextWave=Infinity;g.nextEnemyAttackAt=g.time;}
}
function residentPatrol(g,e,dt){
 const playerHome=mag(sub(g.player.pos,e.home));
 if(e.alerted&&playerHome>12){e.alerted=false;e.returning=true;}
 if(e.returning&&mag(sub(e.pos,e.home))<.2)e.returning=false;
 if(!e.returning&&!e.alerted&&mag(sub(g.player.pos,e.pos))<=6&&g.world.lineClear(e.pos,g.player.pos))e.alerted=true;
 if(e.alerted)return false;
 let goal=e.returning?e.home:e.patrol[e.patrolIndex],delta=sub(goal,e.pos),distance=mag(delta);
 if(distance<.15&&!e.returning){e.patrolIndex=1-e.patrolIndex;goal=e.patrol[e.patrolIndex];delta=sub(goal,e.pos);distance=mag(delta);}
 if(distance>.05)enemyMove(g,e,normal(delta),e.moveSpeed,Math.min(dt,distance/e.moveSpeed));
 return true;
}
function knifeSpawnPosition(g){
 const radius=.4,player=g.player;
 // Each projection uses the actual world collision radius. Never assume that a
 // requested offset survives sliding: it may collapse back to the start point.
 const offsets=[{x:0,z:4},{x:4,z:0},{x:-4,z:0},{x:0,z:-4},
  {x:3,z:3},{x:-3,z:3},{x:3,z:-3},{x:-3,z:-3}];
 for(const offset of offsets){
  const position=g.world.move(player.pos,offset,radius);
  const circleClear=g.world.geometry?.clear?.(position,radius)??g.world.clear?.(position,radius)??g.world.lineClear(position,position);
  if(!circleClear||!g.world.lineClear(player.pos,position))continue;
  if([player,...g.enemies].some(e=>e.hp>0&&mag(sub(position,e.pos))<radius+e.radius))continue;
  return position;
 }
 return null;
}
// The pilot uses the same entity/world loop, with a focused move/contact profile.
// Explicit activation lets Lead integrate the matching assets atomically.
function knifeMove(entity,action){
 const id=action==='slash'?(entity.lastMove==='light_right'?'light_left':'light_right'):({stab:'thrust',heavy:'heavy_overhead',special:'skill_pommel'})[action];
 return KNIFE_MOVES[id];
}
function knifeSwing(g,entity,action,def){
 entity.lastMove=def.moveId;
 return {action,def,moveId:def.moveId,clip:def.clip,path:def.path,sourceContact:def.sourceContact,
  native:!!def.native,timing:{windup:def.windupTicks,active:def.activeTicks,recovery:def.recoveryTicks},ageTicks:0,
  start:g.time,hitAt:g.time+def.windup,end:g.time+def.windup+def.active+def.recovery,
  dir:{...entity.facing},hitIds:new Set(),resolved:false,activeEmitted:false};
}
const contactSnapshot=e=>e.contactRig?{...e,rig:e.contactRig}:e;
const snapshot=e=>({...e,pos:{...e.pos},facing:{...e.facing}});
function knifeDodge(g,move,aim){
 const p=g.player,t=g.time;
 if(g.finished||p.hp<=0||p.dodgeReady>t+EPS||p.swing||p.hurtUntil>t||p.guardBrokenUntil>t)return;
 if(!knifeAffordable(p,R.rollCost)){p.buffer=null;return;}
 knifeSpend(g,p,R.rollCost);
 p.buffer=null;p.guarding=false;p.parryUntil=0;p.velocity={x:0,z:0};
 const facing=aim&&Number.isFinite(aim.x)&&Number.isFinite(aim.z)&&mag(aim)>.001?normal(aim):p.facing;
 p.dodgeDirection=normal(move,{x:-facing.x,z:-facing.z});p.facing={...p.dodgeDirection};
 p.dodgeStart=t;p.dodgeUntil=t+R.roll/60;p.dodgeReady=p.dodgeUntil;
 // Safety is a middle interval, not instant invulnerability on press.
 p.invulnerableUntil=0;g.started=true;event(g,'dodge',{actor:p,clip:'Roll',ticks:R.roll});
}
function knifeGuard(g,intent,swinging,dodging){
 const p=g.player,t=g.time;
 p.guarding=!!intent.guard&&!swinging&&!dodging&&t>=p.hurtUntil&&t>=p.guardBrokenUntil&&t>=p.guardExposedUntil&&p.guard>0&&!p.exhausted;
 if(p.guarding){
  if(intent.guardPressed&&t+EPS>=p.parryReady){p.guardStart=t;p.parryUntil=t+R.parry/60;p.parryReady=t+R.parryCooldown/60;p.parryReleased=false;}
  if(!Number.isFinite(p.guardStart))p.guardStart=t-R.parry/60;
 }else if(p.parryUntil>t&& !intent.cancel){p.parryReleased=true;}
 if(p.parryReleased&&t+EPS>=p.parryUntil&&p.parryUntil>0){p.parryUntil=0;p.guardExposedUntil=t+R.parryRecovery/60;p.parryReleased=false;}
}
function hitMetadata(attacker,victim,def){return {attackerId:attacker?.id??null,victimId:victim.id,position:{...victim.pos},moveId:def?.moveId??null,weapon:['original-rat','original-dog'].includes(attacker?.rig)?'teeth':'knife',material:['original-rat','original-dog'].includes(attacker?.rig)?'flesh':'iron'};}
function knifeReceive(g,hit){
 const p=g.player,t=g.time,age=(t-p.dodgeStart)*60,def=hit.moveId==='rat_bite'?RAT_BITE:hit.moveId==='dog_bite'?DOG_BITE:KNIFE_MOVES[hit.moveId];
 if(p.hp<=0||age+EPS>=R.safeStart&&age<=R.safeEnd+EPS&&t<p.dodgeUntil){event(g,'evade',{actor:p,...hitMetadata(hit.attacker,p,def)});return false;}
 const meta=hitMetadata(hit.attacker,p,def);let amount=hit.amount,blocked=false;
 if(p.guarding&&hit.block&&inside(p.facing,sub(hit.origin,p.pos),R.guardArc)){
  p.guardRecoverAt=t+R.regenDelay/60;
  if(t<p.parryUntil-EPS&&hit.parry){
   p.parryUntil=0;p.parryReleased=false;
   if(hit.attacker){const e=hit.attacker;e.swing=null;e.ready=e.recoverUntil=e.staggerUntil=t+R.parryStun/60;e.response={clip:'Deflected',start:t,ticks:R.parryStun};}
   p.response={clip:'Parry',start:t,ticks:R.parry};notify(g,'PARRY · Counter while they recover.');event(g,'parry',{actor:p,...meta});return false;
  }
  const guardAge=(t-(p.guardStart??-Infinity))*60-R.parry;
  const perfect=guardAge>=-EPS&&guardAge<R.perfectBlock-EPS,cost=(def?.staminaDamage??amount)*(perfect?R.perfectBlockCost:1);
  if(p.guard+EPS>=cost){blocked=true;knifeSpend(g,p,cost);amount=perfect?0:Math.round(amount*(def?.chip??0));p.response={clip:'BlockImpact',start:t,ticks:12};event(g,'block',{actor:p,amount,perfect,cost,...meta});}
  else{knifeSpend(g,p,R.breakCost);p.guarding=false;p.parryUntil=0;p.guardBrokenUntil=t+(def?.stagger??.3);event(g,'guard-break',{actor:p,...meta});}
 }
 if(amount<=0)return false;
 amount=damageAfterVest(amount,g.vest,{blocked});
 p.hp=Math.max(0,p.hp-amount);p.flashUntil=t+.12;
 if(blocked&&p.hp>0){event(g,'hit',{actor:p,amount,blocked:true,...meta});return true;}
 p.hurtUntil=t+(def?.stagger??.3);p.swing=null;p.buffer=null;p.dodgeUntil=t;p.ready=p.hurtUntil;
 p.response={clip:p.hp?'Hit':'Death',start:t,ticks:p.hp?Math.round((def?.stagger??.3)*60):144};
 if(def?.knockback){const dir=normal(sub(p.pos,hit.origin));moveBody(g,p,{x:dir.x*R.walkSpeed*def.knockback/60,z:dir.z*R.walkSpeed*def.knockback/60});}
 event(g,'hit',{actor:p,amount,impactDirection:normal(sub(p.pos,hit.origin)),...meta});
 if(p.hp<=0){g.finished=true;g.won=false;event(g,'death',{actor:p,...meta});}return true;
}
function knifeStepIn(g,e,dt){
 const s=e.swing;if(!s)return;const age=Math.floor((g.time-s.start)*60+EPS);s.ageTicks=age;
 if(age>R.stepInFrom&&age<s.def.windupTicks)moveBody(g,e,{x:s.dir.x*R.walkSpeed*s.def.stepIn*(e.moveSpeed!==undefined?e.moveSpeed/R.walkSpeed:e.rig==='goblin'?1.2:1)*dt,z:s.dir.z*R.walkSpeed*s.def.stepIn*(e.moveSpeed!==undefined?e.moveSpeed/R.walkSpeed:e.rig==='goblin'?1.2:1)*dt});
}
function knifeEnemy(g,e,dt){
 if(e.hp<=0)return;
 if(e.rig==='original-rat'){ratEnemy(g,e,dt);return;}
 if(e.rig==='original-dog'){dogEnemy(g,e,dt);return;}
 knifeEnergy(e,g.encounter?.regen??R.goblinRegen);
 knifeRegen(g,e,dt,!!e.swing||g.time<e.recoverUntil||g.time<e.staggerUntil);
 if(e.swing){knifeStepIn(g,e,dt);return;}
 if(g.time<e.recoverUntil||g.time<e.staggerUntil)return;
 if(e.home&&residentPatrol(g,e,dt))return;
 const delta=sub(g.player.pos,e.pos),distance=mag(delta),dir=normal(delta,e.facing);
 const action=['slash','stab','slash','heavy'][e.pattern%4],def=knifeMove(e,action);
 if(distance>def.range*e.combatScale||!g.world.lineClear(e.pos,g.player.pos)){enemyMove(g,e,dir,e.moveSpeed??R.walkSpeed*1.2,dt);return;}
 e.facing=turn(e.facing,dir,360*dt);
 if(g.time+EPS>=e.ready&&(!g.encounter||g.time+EPS>=g.nextEnemyAttackAt)&&dot(e.facing,dir)>.96&&knifeAffordable(e,def.stamina)){
  knifeSpend(g,e,def.stamina);
  e.swing=knifeSwing(g,e,action,def);e.ready=e.swing.end+(e.recoveryDelay??0);e.pattern++;
  if(g.encounter)g.nextEnemyAttackAt=g.time+g.encounter.aggression;
  event(g,'enemy-attack',{actor:e,dir:{...e.facing},range:def.range*e.combatScale,arc:def.arc,moveId:def.moveId,clip:def.clip});
 }
}
function ratEnemy(g,e,dt){
 if(e.swing){knifeStepIn(g,e,dt);return;}
 if(g.time<e.recoverUntil||g.time<e.staggerUntil)return;
 if(e.home&&residentPatrol(g,e,dt))return;
 const foot=g.ratContact?.foot(g,e);if(!foot)return;
 const offset=sub(foot,e.pos),distance=mag(sub(g.player.pos,e.pos)),dir=normal(offset,e.facing);
 if(distance>.95||mag(offset)>.35||!g.world.lineClear(e.pos,g.player.pos)){enemyMove(g,e,dir,2.1,dt);return;}
 e.facing=turn(e.facing,dir,360*dt);
 if(g.time+EPS>=e.ready&&dot(e.facing,dir)>.99){const def=Number.isFinite(foot.y)&&foot.y<=.06?RAT_BITE_LOW:RAT_BITE;e.swing=knifeSwing(g,e,'bite',def);e.swing.footGoalY=foot.y;e.ready=e.swing.end;event(g,'enemy-attack',{actor:e,dir:{...e.facing},range:.95,arc:90,moveId:'rat_bite',clip:def.clip});}
}
function dogEnemy(g,e,dt){
 if(e.swing){knifeStepIn(g,e,dt);return;}
 if(g.time<e.recoverUntil||g.time<e.staggerUntil)return;
 if(e.home&&residentPatrol(g,e,dt))return;
 const offset=sub(g.player.pos,e.pos),distance=mag(offset);
 if(distance>e.radius+g.player.radius+EPS||!g.world.lineClear(e.pos,g.player.pos)){enemyMove(g,e,normal(offset),2.6,dt);return;}
 const calf=g.ratContact?.calf(g,e);if(!calf)return;const dir=normal(sub(calf,e.pos),e.facing);e.facing=turn(e.facing,dir,360*dt);
 if(g.time+EPS>=e.ready&&dot(e.facing,dir)>.99){e.facing={...dir};e.swing=knifeSwing(g,e,'bite',DOG_BITE);e.swing.calfGoal={...calf};e.ready=e.swing.end;event(g,'enemy-attack',{actor:e,dir:{...dir},range:1.17,arc:90,moveId:'dog_bite',clip:DOG_BITE.clip});}
}
function knifeContacts(g,before,ratBefore){
 const entities=[g.player,...g.enemies],after=new Map(entities.map(e=>[e.id,snapshot(e)])),contacts=[];
 for(const a of entities)if(a.swing)a.swing.ageTicks=Math.floor((g.time-a.swing.start)*60+EPS);
 const ratAfter=ratBefore?g.ratContact.capture(g):null;
 for(const a of entities){
  const s=a.swing;if(!s)continue;
  const age=Math.floor((g.time-s.start)*60+EPS);s.ageTicks=age;
  if(age>=s.def.windupTicks&&age<s.def.windupTicks+s.def.activeTicks){
   if(!s.activeEmitted){s.activeEmitted=true;event(g,'strike',{actor:a,action:s.action,dir:s.dir,range:s.def.range,moveId:s.moveId});}
   const targets=a===g.player?[...g.enemies].sort((a1,b1)=>mag(sub(a1.pos,a.pos))-mag(sub(b1.pos,a.pos))||a1.id-b1.id):[g.player];
   for(const d of targets){
    if(s.def.ratLow&&(!['original-rat','original-dog'].includes(d.rig)||d.id!==s.lowTargetId))continue;
    if(d.hp<=0||s.hitIds.has(d.id)||s.action==='stab'&&s.hitIds.size||!g.world.lineClear(a.pos,d.pos))continue;
    const hit=['original-rat','original-dog'].includes(a.rig)||['original-rat','original-dog'].includes(d.rig)?!!(ratBefore&&g.ratContact.hit(a,d,s,ratBefore,ratAfter))
     :s.path?bladeContact(contactSnapshot(before.get(a.id)??after.get(a.id)),contactSnapshot(after.get(a.id)),before.get(d.id)??after.get(d.id),after.get(d.id),s.path,age-1,age)
     :age===s.def.windupTicks&&mag(sub(d.pos,a.pos))<=s.def.range*a.combatScale+EPS&&inside(s.dir,sub(d.pos,a.pos),90);
    if(hit){s.hitIds.add(d.id);contacts.push({a,d,def:s.def,s});}
   }
  }
  if(g.time+EPS>=s.end)a.swing=null;
 }
 // Decide contacts from a shared pre-resolution snapshot. Trades do not depend
 // on which attacker was enumerated first; a dead enemy cannot cancel its hit.
 contacts.sort((a,b)=>a.a.id-b.a.id||a.d.id-b.d.id);
 for(const {a,d,def} of contacts){
  if(d===g.player)knifeReceive(g,{amount:def.damage,origin:after.get(a.id).pos,attacker:a,block:true,parry:def.parryable,moveId:def.moveId});
  else{
   const amount=def.damage*(g.player.damage/20);d.hp=Math.max(0,d.hp-amount);d.flashUntil=g.time+.12;if(d.home){d.alerted=true;d.returning=false;}
   d.recoverUntil=d.staggerUntil=g.time+def.stagger;d.ready=d.recoverUntil+(d.recoveryDelay??0);d.swing=null;d.response={clip:d.rig==='original-rat'?(d.hp?'rat_hit':'rat_death'):d.rig==='original-dog'?(d.hp?'dog_hit':'dog_death'):(d.hp?'Hit':'Death'),start:g.time,ticks:d.rig==='original-rat'?(d.hp?20:54):d.rig==='original-dog'?(d.hp?24:60):(d.hp?Math.round(def.stagger*60):144)};
   event(g,'hit',{actor:d,amount,impactDirection:normal(sub(after.get(d.id).pos,after.get(a.id).pos)),...hitMetadata(a,d,def)});
   if(def.knockback){const dir=normal(sub(d.pos,a.pos));moveBody(g,d,{x:dir.x*R.walkSpeed*def.knockback/60,z:dir.z*R.walkSpeed*def.knockback/60});}
   if(d.hp<=0)kill(g,d,{...hitMetadata(a,d,def),impactDirection:sub(after.get(d.id).pos,after.get(a.id).pos)});
  }
 }
 if(g.player.hp<=0){g.finished=true;g.won=false;}
}
