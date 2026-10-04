// Port of the pinned Unity Westminster encounter. Domain x/z stays in Unity metres.
export const attacks={
 slash:{windup:.14,recovery:.28,range:2.6,arc:100,multiplier:1,stagger:.10,cooldown:0},
 stab:{windup:.12,recovery:.24,range:3.1,arc:24,multiplier:1.2,stagger:.12,cooldown:0,single:true},
 heavy:{windup:.36,recovery:.42,range:3.2,arc:130,multiplier:2.1,stagger:.3,cooldown:1.6},
 special:{windup:.20,recovery:.38,range:4.2,arc:360,multiplier:2.2,stagger:.3,cooldown:7}
};
const EPS=1e-8,mag=v=>Math.hypot(v.x,v.z),sub=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
export function normal(v,fallback={x:0,z:1}){const n=mag(v);return n>.001?{x:v.x/n,z:v.z/n}:{...fallback};}
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const inside=(dir,delta,arc)=>mag(delta)<.001||dot(normal(dir),normal(delta))+EPS>=Math.cos(arc*Math.PI/360);
const rotate=(v,angle)=>({x:v.x*Math.cos(angle)+v.z*Math.sin(angle),z:v.z*Math.cos(angle)-v.x*Math.sin(angle)});
let serial=0;
export function enemy(kind,pos){const hp=[55,95,50,400][kind];return {id:++serial,kind,pos:{...pos},facing:{x:0,z:-1},hp,maxHP:hp,radius:kind===3?.65:.4,ready:0,recoverUntil:0,staggerUntil:0,alerted:false,pattern:0,swing:null,flashUntil:0};}
export function createGame(world){return {world,time:0,wave:0,kills:0,nextWave:2,started:false,finished:false,won:false,events:[],enemies:[],bolts:[],loot:[],message:'Move to enter combat. Survive three waves.',messageUntil:4,player:{id:0,kind:-1,pos:{...(world.spawn??{x:0,z:-6})},facing:{x:0,z:1},hp:100,maxHP:100,damage:20,weaponLevel:0,armourLevel:0,radius:.4,guard:100,guarding:false,parryUntil:0,guardBrokenUntil:0,guardRecoverAt:0,ready:0,heavyReady:0,specialReady:0,dodgeReady:0,dodgeUntil:0,invulnerableUntil:0,swing:null,buffer:null,velocity:{x:0,z:0},flashUntil:0}};}
function notify(g,text){g.message=text;g.messageUntil=g.time+4;}
function event(g,type,data={}){g.events.push({type,...data});}
function moveBody(g,body,d){let next=g.world.move(body.pos,d,body.radius); // World owns static collision.
 for(const other of [g.player,...g.enemies]){if(other===body||other.hp<=0)continue;const delta=sub(next,other.pos),n=mag(delta),r=body.radius+other.radius;if(n<r&&n>.001){next=g.world.move(body.pos,{x:next.x-body.pos.x+delta.x/n*(r-n),z:next.z-body.pos.z+delta.z/n*(r-n)},body.radius);}}
 body.pos=next;
}
export function attack(g,action,direction=g.player.facing){const p=g.player,def=attacks[action];
 if(!def||p.hp<=0||g.finished||p.dodgeUntil>g.time||p.guardBrokenUntil>g.time)return false;
 if((action==='heavy'&&p.heavyReady>g.time+EPS)||(action==='special'&&p.specialReady>g.time+EPS))return false;
 if(p.ready>g.time+EPS){if(p.ready-g.time<=.12+EPS)p.buffer={action,dir:normal(direction),until:p.ready+.12};return false;}
 p.buffer=null;p.guarding=false;p.parryUntil=0;p.guardRecoverAt=g.time+.45;p.facing=normal(direction,p.facing);
 p.swing={action,def,dir:{...p.facing},start:g.time,hitAt:g.time+def.windup,end:g.time+def.windup+def.recovery,resolved:false};p.ready=p.swing.end;
 if(action==='heavy')p.heavyReady=g.time+def.cooldown;if(action==='special')p.specialReady=g.time+def.cooldown;
 g.started=true;event(g,'attack',{actor:p,action});return true;
}
function dodge(g,move){const p=g.player;if(g.finished||p.hp<=0||p.dodgeReady>g.time+EPS)return;
 p.swing=null;p.buffer=null;p.guarding=false;p.parryUntil=0;p.velocity={x:0,z:0};p.dodgeDirection=normal(move??p.facing,p.facing);p.facing={...p.dodgeDirection};p.dodgeUntil=g.time+.22;p.invulnerableUntil=g.time+.25;p.dodgeReady=g.time+1.05;g.started=true;event(g,'dodge',{actor:p});
}
export function receiveHit(g,hit){const p=g.player,t=g.time;if(g.finished||p.hp<=0||t<p.invulnerableUntil)return false;
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
function kill(g,e){g.enemies=g.enemies.filter(x=>x!==e);g.kills++;event(g,'death',{actor:e});if(e.kind===3){g.finished=true;g.won=true;return;}
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
export function spawnWave(g){g.wave++;const count=g.wave===3?1:4+g.wave;g.enemies=Array.from({length:count},(_,i)=>enemy(g.wave===3?3:i%3,{x:count===1?0:(i%5-2)*1.7,z:-1+Math.floor(i/5)*2.4}));notify(g,g.wave===3?'ORC WARLORD · Dodge, then strike.':`WESTMINSTER · Wave ${g.wave}/3`);event(g,'wave');}
const radius=e=>e.kind===3?(e.pattern===1?4:3.5):e.kind===1?2.8:1.8;
const arc=e=>e.kind===3&&e.pattern===1?360:e.kind===1?110:90;
function bolt(g,pos,dir,amount){g.bolts.push({id:++serial,pos:{...pos},dir:{...dir},amount,expires:g.time+4});}
function enemyTick(g,e,dt){if(e.hp<=0)return;const t=g.time,offset=sub(g.player.pos,e.pos),distance=mag(offset),dir=normal(offset,e.facing);
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
export function stepGame(g,intent={},dt=1/60){g.events=[];if(g.finished||intent.paused)return;g.time+=dt;const p=g.player,t=g.time,move=intent.move??{x:0,z:0};
 if(intent.dodge)dodge(g,move);
 const swinging=p.swing&&t<p.swing.end-EPS,dodging=t<p.dodgeUntil-EPS;
 p.guarding=!!intent.guard&&!dodging&&!swinging&&t>=p.guardBrokenUntil&&p.guard>0;
 if(p.guarding&&intent.guardPressed)p.parryUntil=t+.16;if(!p.guarding)p.parryUntil=0;
 if(!intent.guard&&t>=p.guardRecoverAt&&t>=p.guardBrokenUntil)p.guard=Math.min(100,p.guard+35*dt);
 if(intent.aim&&mag(intent.aim)>.001&&!swinging&&!dodging)p.facing=normal(intent.aim);
 if(p.buffer&&t>p.buffer.until)p.buffer=null;
 const priority=['special','heavy','stab','slash'],fresh=[...(intent.actions??[])].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));for(const action of fresh){const buffer=p.buffer;if(attack(g,action,intent.aim??p.facing)||p.buffer!==buffer)break;}
 if(!dodging&&p.buffer&&t+EPS>=p.ready){const buffer=p.buffer;p.buffer=null;attack(g,buffer.action,buffer.dir);}
 if(!fresh.length)for(const a of ['stab','slash'])if(intent.held?.includes(a)&&attack(g,a,intent.aim??p.facing))break;
 if(p.swing&&!p.swing.resolved&&t+EPS>=p.swing.hitAt){p.swing.resolved=true;strike(g,p.swing);}
 if(p.swing&&t+EPS>=p.swing.end)p.swing=null;
 if(!g.finished){if(dodging)moveBody(g,p,{x:p.dodgeDirection.x*16*dt,z:p.dodgeDirection.z*16*dt});
 else if(!p.swing){const m=mag(move)>1?normal(move):move,vel={x:m.x*4.2*(p.guarding?.4:1),z:m.z*4.2*(p.guarding?.4:1)},difference=sub(vel,p.velocity),n=mag(difference),step=(mag(m)>.01?48:34)*dt;p.velocity=n<=step?vel:{x:p.velocity.x+difference.x/n*step,z:p.velocity.z+difference.z/n*step};moveBody(g,p,{x:p.velocity.x*dt,z:p.velocity.z*dt});if(!intent.aim&&mag(m)>.01&&!p.guarding)p.facing=turn(p.facing,m,720*dt);}else p.velocity={x:0,z:0};
 if(mag(sub(p.pos,g.world.spawn??{x:0,z:-6}))>=1)g.started=true;
 if(g.encounterActive!==false&&g.started&&!g.enemies.length&&t+EPS>=g.nextWave){if(g.wave>=3){g.finished=true;g.won=true;}else spawnWave(g);}
 for(const e of [...g.enemies]){enemyTick(g,e,dt);if(g.finished)break;}
 if(!g.finished){projectiles(g,dt);collect(g);}
 }
}
