import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {stepBossRanged,stepBossRockets,clearBossRanged,BOSS_RANGED_RULES} from '../src/engine/boss-ranged.js';
import {fixture} from './helpers/rifle-fixture.js';
import {stepGame} from '../src/combat.js';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const data=read('../public/world/area-content.json'),base=read('./fixtures/boss-aggression218-baseline.json');
// 28 Oct new monsters (art/crow): the crow takes the cycle B creature of two slots; cycle A, the keys and everything else stay as they were.
const MONSTER_CYCLES={'east-bridge':{B:{foundationRef:'original-crow',recipeRef:'crow-carrion'}},lambeth:{B:{foundationRef:'original-crow',recipeRef:'crow-ragged'}},east:{B:{foundationRef:'giant-eel',recipeRef:'eel-river-ambusher'}},'elephant-and-castle':{A:{foundationRef:'original-elephant',recipeRef:'elephant-ashen-bull',off:{foundationRef:'original-dog',recipeRef:'dog-street-mongrel'}},B:{foundationRef:'original-elephant',recipeRef:'elephant-ashen-bull',off:{foundationRef:'original-roach',recipeRef:'roach-ash'}}},area7:{B:{foundationRef:'original-spider',recipeRef:'spider-crypt'}}}; // 28 Oct: the spider takes the area7 cycle B creature; 28 Oct: the elephant takes both cycles of its slot, the original creature stays under off // 28 Oct: the giant eel takes the East cycle B creature
test('219 changes only six boss movement/acquisition/timing fields and uniformly resampled native paths',()=>{
 const {bosses,...other}=structuredClone(data);delete other.expedition.contract.enabled;delete other.cursedRelic;delete other.marked.hunters;delete other.marked.bounty;delete other.population.respawn; // 27 Oct: hostile respawn policy (population.respawn) // the 24 Oct contract/hunter/bounty switches
 const expected=structuredClone(base.protected);expected.population.areas.area8.creatureSlot.cycles.B={foundationRef:'giant-centipede',recipeRef:'centipede-lurker'}; // 28 Oct: the centipede takes the Area 7 cycle B creature slot
for(const key of['hunterBounty','arrivalDelay','respawnDelay','hostileBudget']){delete other.marked[key];delete expected.marked[key];} // 25 Oct: hunters always on (no bounty gate); 26 Oct: 60 s first arrival, 90 s re-arrival, no resident cap
 // 27 Oct population-spread: about 10 hostiles per area. Every original resident row must remain unchanged, in order, as a prefix of the new rows; the population policy keeps every original active placement and creature slot (it only grows the active list and the cap).
 for(const[area,rows]of Object.entries(expected.residents))assert.deepEqual(other.residents[area].slice(0,rows.length),rows,area);
 for(const[area,policy]of Object.entries(expected.population.areas)){const now=other.population.areas[area];assert.deepEqual(now.activePlacementIds.slice(0,policy.activePlacementIds.length),policy.activePlacementIds,area);const slot=structuredClone(policy.creatureSlot);Object.assign(slot.cycles,MONSTER_CYCLES[area]??{});assert.deepEqual(now.creatureSlot,slot,area);assert.equal(now.allowDroneFallback,policy.allowDroneFallback,area);}
 delete other.safehouse;delete expected.safehouse; // 27 Oct: the Westminster safehouse was removed (Dom's ruling); the Central Hub site is now the only one
 delete other.residents;delete expected.residents;delete other.population;delete expected.population;
 assert.deepEqual(other,expected);
 assert.deepEqual(bosses.placements,base.bosses.placements);{const {wakeDistance,homeLeash,...witch}=bosses.profiles.witch,{wakeDistance:w0,homeLeash:h0,...witch0}=base.bosses.profiles.witch;assert.deepEqual(witch,witch0);assert.equal(wakeDistance,10);assert.equal(homeLeash,18);} // 26 Oct: witch wake/leash follow the other bosses; every other witch field is the 218 baseline
 assert.deepEqual(bosses.paths['boss-witch-attack'],base.bosses.paths['boss-witch-attack']);
 for(const[id,p]of Object.entries(bosses.profiles)){
  const old=base.bosses.profiles[id];if(id==='witch')continue;
  assert.equal(p.moveSpeed,1.9); // 26 Oct (Dom): bosses were too passive; was the 218 speed x 1.275 (1.285 to 1.785); the witch keeps 2.275
  // Wake is 10 m, except where the area's entry is closer than 10.5 m to the boss (a player arriving must start outside the wake band): Warden 5, Nightborn 8.
  assert.equal(p.wakeDistance,{warden:5,nightborn:8}[id]??10);
  assert.equal(p.homeLeash,18);
  const allowed=new Set(['moveSpeed','wakeDistance','homeLeash',...(id==='surgeon'?['weapon']:['attacks','recoveryDelay'])]);
  for(const key of Object.keys(old))if(!allowed.has(key))assert.deepEqual(p[key],old[key],id+':'+key);
  if(id==='surgeon'){assert.deepEqual(p.attacks,old.attacks);assert.deepEqual({...p.weapon,windupTicks:48,recoveryTicks:84},old.weapon);assert.equal(p.weapon.activeTicks,60);continue;}
  assert.equal(p.recoveryDelay,.4);
  for(const[action,a]of Object.entries(p.attacks)){
   const oa=old.attacks[action];for(const key of Object.keys(oa))if(!['windupTicks','activeTicks','recoveryTicks'].includes(key))assert.deepEqual(a[key],oa[key]);
   const frames=bosses.paths[a.path],oldFrames=base.bosses.paths[a.path];
   assert.equal(frames.length,a.windupTicks+a.activeTicks+a.recoveryTicks+1);
   // DonorMotion samples native clips uniformly, so physical contact must use
   // the same source phase rather than retaining stale active-only samples.
   for(let i=0;i<frames.length;i++){
    const at=i*(oldFrames.length-1)/(frames.length-1),lo=Math.floor(at),hi=Math.min(lo+1,oldFrames.length-1);
    for(let axis=0;axis<6;axis++)assert(Math.abs(frames[i][axis]-(oldFrames[lo][axis]+(oldFrames[hi][axis]-oldFrames[lo][axis])*(at-lo)))<1e-12);
   }
  }
 }
});

function gun(rig='boss-south-nightborn'){
 const e={id:7,rig,bossProfile:{attacks:{slash:{range:1.15}}},combatScale:1.265,hp:120,pos:{x:0,z:0},facing:{x:0,z:1},ready:0,recoverUntil:0,staggerUntil:0};
 const g={time:0,tick:0,world:{areaId:'south',lineClear:()=>true},player:{id:0,pos:{x:0,z:4},hp:150,radius:.4,combatScale:1.265},enemies:[e],events:[],bossRockets:[]};
 const received=[],services={patrol:()=>false,move(){throw Error('unexpected movement');},source:()=>({x:0,y:1,z:0}),trace:(_g,_a,end)=>({enemy:g.player,position:{x:end.x,y:1,z:-4}}),receive:(_g,h)=>received.push(h)};
 function step(n=1){for(let i=0;i<n;i++){g.time+=1/60;g.tick++;stepBossRockets(g,services);stepBossRanged(g,e,1/60,services);}}
 return{g,e,services,received,step};
}
test('NPC shotgun keeps frozen bearing, exact warning/cadence and max8 damage with actual NPC ownership',()=>{
 const f=gun();f.step();const frozen=structuredClone(f.e.bossRanged);f.g.player.pos.x=1;
 f.step(23);assert.equal(f.received.length,0);assert.deepEqual(f.e.bossRanged.target,frozen.target);
 f.step();assert.equal(f.received.length,1);assert.equal(f.received[0].amount,8);assert.equal(f.received[0].attacker,f.e);assert.equal(f.received[0].weapon,'shotgun');
 f.g.player.pos.x=0;f.step(66);const shots=f.g.events.filter(e=>e.type==='boss-shotgun-shot');assert.equal(shots.length,2);assert.equal(shots[0].ownerId,7);assert.equal(shots[0].pellets.length,8);
 assert(!f.g.events.some(e=>e.type==='shot'||e.type==='reload-start'));assert.equal(f.g.pistol,undefined);assert.equal(f.g.bossEquipment,undefined);
});
test('NPC ranged warning cancels on hurt, refuge/cancel and unsupported bosses keep original behavior',()=>{
 const f=gun();f.step();f.e.recoverUntil=2;f.step();assert.equal(f.e.bossRanged,null);assert.equal(f.received.length,0);
 f.e.recoverUntil=0;f.e.ready=0;f.g.bossRangedInputCancelled=true;f.step();assert.equal(f.e.bossRanged,null);
 for(const rig of ['boss-westminster-witch','giant-salamander','boss-warden','boss-area7-knight','boss-area8-veteran']){f.e.rig=rig;assert.equal(stepBossRanged(f.g,f.e,1/60,f.services),false);}
});
test('NPC shotgun cannot hit without a posed target contact or through authored walls',()=>{
 for(const wall of [false,true]){const f=gun();f.services.trace=()=>null;if(wall)f.g.world.lineClear=()=>false;f.services.move=()=>{};f.step(90);assert.equal(f.received.length,0);}
});
test('NPC rocket uses frozen aim, one live allocation, finite life, once-only max14 blast and owner cleanup',()=>{
 const f=gun('boss-butcher');f.services.trace=()=>null;f.step();const target=structuredClone(f.e.bossRanged.target);f.step(36);assert.equal(f.g.bossRockets.length,1);assert.equal(f.g.bossRockets[0].ownerId,7);assert.equal(f.g.bossRockets[0].areaId,'south');
 const originalDirection={...f.g.bossRockets[0].direction};f.g.player.pos.x=8;f.step(46);assert(f.e.bossRanged,'next warning may overlap old flight');assert.equal(f.g.bossRockets.length,1);assert.deepEqual(f.g.bossRockets[0].direction,originalDirection);assert.equal(target.x,0);
 f.step(40);assert(f.g.bossRockets.length<=1);assert(f.g.events.some(e=>e.type==='boss-rocket-blast'));assert(f.received.every(h=>h.amount<=14));
 f.e.hp=0;stepBossRockets(f.g,f.services);assert.equal(f.g.bossRockets.length,0);clearBossRanged(f.g);assert.equal(f.e.bossRanged,null);assert.equal(f.g.bossRocketBlast,null);
 assert.equal(BOSS_RANGED_RULES['boss-butcher'].maxLife,1.2);
});
test('NPC rocket world collision wins over later player surface and cannot damage through cover',()=>{
 const f=gun('boss-butcher');f.step(37);assert.equal(f.g.bossRockets.length,1);
 f.g.world.lineClear=()=>false;f.step();assert.equal(f.g.bossRockets.length,0);assert.equal(f.received.length,0);assert.equal(f.g.bossRocketBlast.position.x,0);
});
test('actual registered native heavy consumes new profile and extra idle only once',()=>{
 for(const id of ['warden','knight','veteran']){
  const row=data.bosses.placements.find(r=>r.profileRef===id),f=fixture({areaId:row.areaId}),g=f.g,e=g.enemies.find(e=>e.placementKey===row.key);g.enemies=[e];e.pos={x:0,z:0};e.home={...e.pos};e.alerted=true;e.facing={x:0,z:1};g.player.pos={x:0,z:2};g.world.lineClear=()=>true;g.world.move=(p,d)=>({x:p.x+d.x,z:p.z+d.z});
  stepGame(g,{},1/60);assert(e.swing);assert.equal(e.swing.def.windupTicks,36);assert.equal(e.swing.def.activeTicks,8);assert.equal(e.swing.def.recoveryTicks,36);assert(Math.abs(e.ready-e.swing.start-(80/60+.4))<1e-10);
  const time=g.time;stepGame(g,{paused:true});assert.equal(g.time,time);assert.equal(g.bossRockets.length,0);
 }
});
test('actual combat resolves incoming rocket against this tick guard press/release and preserves NPC hit metadata',()=>{
 for(const guard of [true,false]){
  const f=fixture({areaId:'elephant-and-castle'}),g=f.g,e=g.enemies.find(e=>e.rig==='boss-butcher');g.enemies=[e];e.pos={x:0,z:0};e.home={...e.pos};e.alerted=true;e.ready=999;
  g.player.pos={x:0,z:2};g.player.facing={x:0,z:-1};g.player.guarding=!guard;g.player.guardStart=-1;
  g.world.lineClear=()=>true;g.world.move=(p,d)=>({x:p.x+d.x,z:p.z+d.z});
  g.bossRockets=[{id:'boss-rocket:test',ownerId:e.id,areaId:g.world.areaId,position:{x:0,y:1,z:-1.5},direction:{x:0,y:0,z:-1},distance:0,lastAt:0,startedAt:0}];
  const before=g.player.hp;stepGame(g,{guard,guardPressed:guard},1/60,{bossRangedTrace:(_g,start)=>({enemy:g.player,position:{x:0,y:1,z:start.z-.05}})});
  assert.equal(g.bossRockets.length,0);assert.equal(g.player.guarding,guard);
  if(guard){assert.equal(g.player.hp,before);assert(g.events.some(event=>event.type==='block'&&event.weapon==='rocket'&&event.attackerId===e.id));}
  else{assert(g.player.hp<before&&g.player.hp>=before-14);const hit=g.events.find(event=>event.type==='hit'&&event.actor===g.player);assert.equal(hit.weapon,'rocket');assert.equal(hit.moveId,'boss-rocket');assert.equal(hit.attackerId,e.id);}
  const after=g.player.hp;stepGame(g,{guard},1/60);assert.equal(g.player.hp,after,'consumed rocket cannot damage a second time');
 }
});

test('runtime world manifest binds the exact updated content bytes',()=>{const raw=fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url)),manifest=read('../public/world/manifest.json'),row=manifest.files.find(r=>r.path==='area-content.json');assert.equal(row.bytes,raw.length);assert.equal(row.sha256,createHash('sha256').update(raw).digest('hex'));});
test('six actual boss instances acquire inside the new wake band and still reject blocked LOS',()=>{
 for(const row of data.bosses.placements.filter(r=>r.profileRef!=='witch'))for(const visible of [true,false]){
  const f=fixture({areaId:row.areaId}),g=f.g,e=g.enemies.find(e=>e.placementKey===row.key),p=data.bosses.profiles[row.profileRef];g.enemies=[e];e.pos={x:0,z:0};e.home={...e.pos};e.alerted=false;e.returning=false;g.player.pos={x:0,z:p.wakeDistance-.05};g.world.lineClear=()=>visible;g.world.move=(p,d)=>({x:p.x+d.x,z:p.z+d.z});
  assert(g.player.pos.z>base.bosses.profiles[row.profileRef].wakeDistance);stepGame(g,{},1/60);assert.equal(e.alerted,visible,row.profileRef+' new wake band respects LOS');assert.equal(g.world.areaId,row.areaId);
 }
});
