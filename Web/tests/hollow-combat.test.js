import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,stepGame,spawnWave,attack,receiveHit} from '../src/combat.js';
import {createGeometry} from '../src/world-geometry.js';
// A source-loop fixture, not approval of any undelivered character candidate.
const descriptor={rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1};
const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
const open={spawn:{x:0,z:0},layout:{characterScale:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),clear:()=>true,lineClear:()=>true};
const config=(extra={})=>({id:'hollow-scavengers',character:descriptor,count:3,health:40,moveSpeed:2.1,regen:1,aggression:.6,recovery:.55,...extra});
const game=(world=open,extra={})=>createGame(world,{pilot:'donor-knife',encounter:config(extra)});
const ticks=(g,n,intent={})=>{for(let i=0;i<n;i++)stepGame(g,intent);};
function separated(g){const bodies=[g.player,...g.enemies];for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)assert.ok(Math.hypot(bodies[i].pos.x-bodies[j].pos.x,bodies[i].pos.z-bodies[j].pos.z)>=bodies[i].radius+bodies[j].radius-1e-7,'overlapping spawn');}

test('explicit Hollow config creates3 independent source-scaled humans with unchanged player costs',()=>{
 const g=game();spawnWave(g);assert.equal(g.enemies.length,3);assert.equal(new Set(g.enemies.map(e=>e.id)).size,3);
 for(const e of g.enemies){assert.equal(e.rig,'hollow-scavenger');assert.equal(e.contactRig,'hero');assert.equal(e.bodyScale,1);assert.equal(e.hp,40);assert.equal(e.stamina,100);}
 separated(g);g.enemies[0].stamina=0;g.enemies[0].hp=20;assert.equal(g.enemies[1].stamina,100);assert.equal(g.enemies[1].hp,40);assert.deepEqual(g.staminaCosts,{slash:18,stab:14,heavy:26,special:40,dodge:30});
});
test('descriptor required and unsupported contact rig/config fail closed',()=>{
 for(const encounter of [config({character:undefined}),config({character:{...descriptor,bodyScale:undefined}}),config({character:{...descriptor,contactRig:'unknown'}}),config({count:6}),config({health:NaN}),config({health:null}),config({moveSpeed:-1})])assert.throws(()=>createGame(open,{pilot:'donor-knife',encounter}));
 assert.throws(()=>createGame(open,{encounter:config()}));
});
for(const entryTicks of [0,120])test(`real Westminster group placement after${entryTicks}forwardticks is atomic/clear/spaced`,()=>{
 const world={spawn:{x:0,z:-6},layout,...createGeometry(layout)},g=game(world,{count:5});g.encounterActive=false;ticks(g,entryTicks,{move:{x:0,z:1}});spawnWave(g);assert.equal(g.enemies.length,5);separated(g);
 for(const e of g.enemies){assert.ok(world.clear(e.pos,e.radius));assert.ok(world.lineClear(g.player.pos,e.pos));assert.ok(Math.hypot(e.pos.x-g.player.pos.x,e.pos.z-g.player.pos.z)>=2);}
});
test('insufficient road space never partly spawns/advances and retries when clear',()=>{
 const world={...open,move:p=>({...p})},g=game(world);g.started=true;g.nextWave=0;ticks(g,4);assert.equal(g.wave,0);assert.equal(g.enemies.length,0);assert.equal(g.finished,false);world.move=open.move;stepGame(g,{});assert.equal(g.wave,1);assert.equal(g.enemies.length,3);separated(g);stepGame(g,{});assert.equal(g.enemies.length,3);
});
function contactGame(){const g=game();spawnWave(g);assert.equal(g.enemies.length,3);const positions=[{x:-.35,z:.95},{x:.35,z:.95},{x:10,z:10}];g.enemies.forEach((e,i)=>{e.pos=positions[i];e.staggerUntil=100;});return g;}
for(const [action,amount] of [['slash',10],['heavy',14],['special',20]])test(`${action} reaches multiple contacted foes only once each`,()=>{
 // These symmetric fixtures verify native multi-contact, independently of selection.
 // No viewport-eligible target means the original heading is committed unchanged.
 const g=contactGame();attack(g,action,g.player.facing,[]);ticks(g,32);const damaged=g.enemies.filter(e=>e.hp<40);assert.equal(damaged.length,2);for(const e of damaged)assert.equal(e.hp,40-amount);assert.equal(g.enemies[2].hp,40);assert.equal(g.player.stamina,100-({slash:18,heavy:26,special:40})[action]);
});
test('stab hits only nearest contacted target even with several in range',()=>{const g=contactGame();attack(g,'stab');ticks(g,22);assert.equal(g.enemies.filter(e=>e.hp<40).length,1);assert.equal(g.enemies.filter(e=>e.hp===31).length,1);});
test('individual death/corpse leaves others alive; only final death wins and fresh retry resets',()=>{
 const g=contactGame();g.enemies[0].hp=1;g.enemies[1].pos={x:10,z:12};attack(g,'special');ticks(g,20);assert.equal(g.enemies.length,2);assert.equal(g.corpses.length,1);assert.equal(g.finished,false);const dead=g.corpses[0];assert.equal(dead.hp,0);
 ticks(g,22);g.player.specialReady=0;g.enemies[0].pos={x:0,z:g.player.pos.z+1};g.enemies[0].hp=1;attack(g,'slash');ticks(g,22);assert.equal(g.enemies.length,1);assert.equal(g.finished,false);
 ticks(g,20);g.enemies[0].pos={x:0,z:g.player.pos.z+1};g.enemies[0].hp=1;attack(g,'stab');ticks(g,22);assert.equal(g.finished,true);assert.equal(g.won,true);assert.equal(g.kills,3);assert.equal(g.corpses.length,3);assert.equal(new Set(g.corpses.map(e=>e.id)).size,3);
 const retry=game();spawnWave(retry);assert.equal(retry.enemies.length,3);assert.equal(retry.corpses.length,0);assert.equal(retry.kills,0);assert.equal(retry.player.stamina,100);assert.ok(retry.enemies.every(e=>e.hp===40&&e.stamina===100&&e.swing===null));assert.equal(dead.hp,0);
});
test('Hollow front guard/parry retain facing gate; side/rear use full damage with no spend',()=>{
 for(const origin of [{x:1,z:0},{x:-1,z:0},{x:0,z:-1}]){const g=game();stepGame(g,{guard:true,guardPressed:true});const energy=g.player.stamina,delay=g.player.guardRecoverAt;receiveHit(g,{amount:10,origin,block:true,parry:true,moveId:'light_right'});assert.equal(g.player.hp,140);assert.equal(g.player.stamina,energy);assert.equal(g.player.guardRecoverAt,delay);assert.equal(g.events.some(e=>e.type==='parry'||e.type==='block'),false);}
 const g=game();stepGame(g,{guard:true,guardPressed:true});receiveHit(g,{amount:10,origin:{x:0,z:1},block:true,parry:true,moveId:'light_right'});assert.equal(g.player.hp,150);assert.equal(g.events.at(-1).type,'parry');
});
test('encounter snapshots source descriptor and tuning instead of retaining mutable caller data',()=>{
 const character={...descriptor,bodyScale:.64},input=config({character});const g=createGame(open,{pilot:'donor-knife',encounter:input});character.bodyScale=.78;input.health=120;spawnWave(g);assert.ok(g.enemies.every(e=>e.bodyScale===.64&&e.hp===40));assert.ok(Object.isFrozen(g.encounter.character));
});

test('Hollow movement and recovery tune only this preset; default donor remains one Goblin',()=>{
 const g=game(open,{moveSpeed:1,regen:.5,recovery:1,aggression:1});spawnWave(g);const e=g.enemies[0],z=e.pos.z;e.stamina=50;stepGame(g,{});assert.ok(Math.abs(z-e.pos.z-1/60)<1e-7);assert.ok(Math.abs(e.stamina-(50+20/60))<1e-7);
 e.pos={x:0,z:1};e.facing={x:0,z:-1};stepGame(g,{});assert.ok(e.swing);assert.ok(Math.abs(e.ready-e.swing.end-1)<1e-7);assert.ok(Math.abs(g.nextEnemyAttackAt-g.time-1)<1e-7);
 const donor=createGame(open,{pilot:'donor-knife'});spawnWave(donor);assert.equal(donor.enemies.length,1);assert.equal(donor.enemies[0].rig,'goblin');assert.equal(donor.enemies[0].bodyScale,.78);assert.equal(donor.enemies[0].hp,120);assert.equal(donor.encounter,undefined);
});
test('an exhausted Hollow does not spend or stop another independent attacker',()=>{
 const g=game();spawnWave(g);const [a,b,c]=g.enemies;a.stamina=0;a.guardRecoverAt=100;a.pos={x:0,z:1};b.pos={x:.3,z:1.1};b.facing={x:-.3/Math.hypot(.3,1.1),z:-1.1/Math.hypot(.3,1.1)};b.ready=0;c.staggerUntil=100;
 stepGame(g,{guard:true,aim:{x:0,z:1}});assert.equal(a.stamina,0);assert.equal(a.swing,null);assert.equal(a.guardRecoverAt,100);assert.ok(b.swing);assert.equal(b.stamina,82);assert.equal(g.events.filter(e=>e.type==='enemy-attack').length,1);
});
function pacedGroup(g){
 const p=g.player,es=[...g.enemies].sort((a,b)=>Math.hypot(a.pos.x-p.pos.x,a.pos.z-p.pos.z)-Math.hypot(b.pos.x-p.pos.x,b.pos.z-p.pos.z)),e=es[0];
 if(!e)return {actions:['slash'],aim:{x:0,z:1}};
 const incoming=es.filter(e=>e.swing).sort((a,b)=>(a.swing.def.windupTicks-a.swing.ageTicks)-(b.swing.def.windupTicks-b.swing.ageTicks))[0],target=incoming??e,aim={x:target.pos.x-p.pos.x,z:target.pos.z-p.pos.z};
 if(!p.swing&&p.stamina>=36&&(!incoming||incoming.swing.ageTicks>incoming.swing.def.windupTicks+incoming.swing.def.activeTicks)&&(g.events.some(v=>v.type==='parry')||e.staggerUntil>g.time+.65))return {aim:{x:e.pos.x-p.pos.x,z:e.pos.z-p.pos.z},actions:['slash']};
 if(incoming&&incoming.swing.ageTicks>=incoming.swing.def.windupTicks-8)return {aim,guard:true,guardPressed:!p.guarding};
 const dx=e.pos.x-p.pos.x,dz=e.pos.z-p.pos.z,d=Math.hypot(dx,dz);
 return {aim,...(d>1.1&&(!incoming||incoming.swing.ageTicks>=incoming.swing.def.windupTicks+incoming.swing.def.activeTicks)?{move:{x:dx/d,z:dz/d}}:{})};
}
for(const entryTicks of [0,120])test(`real Westminster3-copy paced movement/guard/counter completes after${entryTicks}entry ticks`,()=>{
 const world={spawn:{x:0,z:-6},layout,...createGeometry(layout)},g=game(world);ticks(g,entryTicks,{move:{x:0,z:1}});let moved=false,parries=0,multiHit=false;const attacks=new Set();
 for(let i=0;i<60*60&&!g.finished;i++){
  const before=new Map(g.enemies.map(e=>[e.id,{...e.pos}]));stepGame(g,pacedGroup(g));
  for(const e of g.enemies){assert.ok(world.clear(e.pos,e.radius));if(before.has(e.id)&&Math.hypot(e.pos.x-before.get(e.id).x,e.pos.z-before.get(e.id).z)>.001)moved=true;assert.ok(e.stamina>=0&&e.stamina<=100);}
  assert.ok(world.clear(g.player.pos,g.player.radius));assert.ok(g.player.stamina>=0&&g.player.stamina<=100);
  for(const event of g.events){if(event.type==='parry')parries++;if(event.type==='enemy-attack')attacks.add(event.actor.id);}
  if((g.player.swing?.hitIds.size??0)>1)multiHit=true;
 }
 assert.equal(g.won,true);assert.equal(g.finished,true);assert.equal(g.kills,3);assert.equal(g.corpses.length,3);assert.equal(attacks.size,3);assert.ok(parries>0);assert.equal(moved,true);assert.ok(g.player.hp>0);if(entryTicks===120)assert.equal(multiHit,true);
});
test('two available projected positions cannot create a partial3-copy wave',()=>{
 const world={...open,move:(p,d)=>({x:p.x+(d.x>0?1:-1),z:p.z+4})},g=game(world);assert.equal(spawnWave(g),false);assert.equal(g.enemies.length,0);assert.equal(g.wave,0);assert.equal(g.kills,0);world.move=open.move;assert.equal(spawnWave(g),true);assert.equal(g.enemies.length,3);
});
test('Hollow aggression spaces admission without changing committed knife phases or stamina costs',()=>{
 const g=game();spawnWave(g);g.enemies.forEach((e,i)=>{e.pos={x:(i-1)*.25,z:1.05};const d=Math.hypot(e.pos.x,e.pos.z);e.facing={x:-e.pos.x/d,z:-e.pos.z/d};e.ready=0;});const starts=[];
 for(let i=0;i<100&&!g.finished;i++){stepGame(g,{guard:true,aim:{x:0,z:1}});for(const v of g.events.filter(v=>v.type==='enemy-attack')){starts.push(g.time);assert.equal(v.actor.swing.def.windupTicks,v.moveId==='thrust'?12:v.moveId==='heavy_overhead'?22:14);assert.ok(v.actor.stamina<=100-(v.moveId==='thrust'?14:v.moveId==='heavy_overhead'?26:18)+1e-8);}}
 assert.ok(starts.length>=2);for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=.6-1e-8);
});
