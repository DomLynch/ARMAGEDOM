import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{fixture}from'./helpers/rifle-fixture.js';import{stepGame}from'../src/combat.js';
import{validateAreaMetadata}from'../src/engine/area-content.js';import{publicAreaRegistry}from'../src/area-registry.js';
import{BOSS_EQUIPMENT_PROFILES}from'../src/engine/boss-equipment-data.js';
import{combatTargetHeight}from'../src/pistol-targeting.js';
const raw=()=>JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url)));
function setup(distance=2.5){
 const f=fixture({areaId:'westminster',extraWorld:{safehouseData:raw().safehouse}}),g=f.g,e=g.enemies.find(e=>e.placementKey==='boss-witch-v1');g.enemies=[e];
 // Controlled source-level positioning only; native acceptance uses ordinary input.
 const candidate=Array.from({length:32},(_,n)=>{const a=n*Math.PI/16;return{x:e.home.x+Math.cos(a)*distance,z:e.home.z+Math.sin(a)*distance};}).find(p=>g.world.geometry.clear(p,g.player.radius)&&g.world.lineClear(e.home,p));assert(candidate);g.player.pos=candidate;
 const events=[],services={bossFlameSource:a=>({position:{x:a.pos.x+a.facing.x*.6,y:combatTargetHeight(g.player,g.time),z:a.pos.z+a.facing.z*.6},direction:{x:a.facing.x,y:0,z:a.facing.z}})};
 const step=(intent={})=>{stepGame(g,intent,1/60,services);events.push(...g.events.map(v=>({...v,tick:g.tick,actorId:v.actor?.id})));};
 return{f,g,e,events,step,services};
}
function warning(s){for(let n=0;n<240&&!s.e.bossWeapon;n++)s.step();assert.equal(s.e.bossWeapon?.phase,'warning');return s.e.bossWeapon.startTick;}
test('actual Witch alone opts into validated flame capability and expanded wake; Surgeon retains its separate saw capability',()=>{
 const r=raw(),c=validateAreaMetadata(r,publicAreaRegistry);assert.equal(c.bossData.profiles.witch.wakeDistance,6);assert.equal(c.bossData.profiles.witch.homeLeash,8);
 assert.equal(c.bossData.profiles.witch.weapon.modelRef,BOSS_EQUIPMENT_PROFILES.emberProjector.modelRef);for(const[id,p]of Object.entries(c.bossData.profiles))if(id==='surgeon')assert.equal(p.weapon.kind,'saw');else if(id!=='witch')assert.equal(p.weapon,undefined);
 for(const mutate of[w=>w.kind='invented',w=>w.modelRef='foreign-model',w=>w.damage=5,w=>w.windupTicks=1,w=>w.activeTicks=25,w=>w.intervalTicks=1,w=>w.recoveryTicks=1,w=>w.windupTicks=5,w=>w.recoveryTicks=31,w=>w.range=4.861,w=>w.coneDegrees=180]){const b=raw();mutate(b.bosses.profiles.witch.weapon);assert.throws(()=>validateAreaMetadata(b,publicAreaRegistry));}
});
test('real combat wakes and approaches from outside expanded4.86m firing range without immediate leash loss',()=>{
 const s=setup(5.5),before={...s.e.pos};s.step();assert(s.e.alerted);assert(!s.e.returning);for(let n=0;n<30;n++)s.step();assert(Math.hypot(s.e.pos.x-before.x,s.e.pos.z-before.z)>.2);assert(s.e.alerted);warning(s);
});
test('6-tick locked preparation, exactly two 4HP pulses, no melee double hit or player fuel/save consumption',()=>{
 const s=setup(),fuel=JSON.stringify(s.g.flameFuel),writes=s.f.writes.length,start=warning(s),dir={...s.e.bossWeapon.direction};
 while(s.g.tick<start+5){s.step();assert.equal(s.g.player.hp,150);assert.equal(s.e.swing,null);assert.deepEqual(s.e.bossWeapon.direction,dir);}
 s.step();assert.equal(s.g.player.hp,146);while(s.g.tick<start+18)s.step();assert.equal(s.g.player.hp,142);
 while(s.g.tick<start+30)s.step();assert.equal(s.e.bossWeapon,null);assert.equal(s.events.filter(e=>e.type==='boss-flame-pulse').length,2);assert.equal(s.events.filter(e=>e.type==='hit'&&e.actorId===0).length,2);
 assert.equal(JSON.stringify(s.g.flameFuel),fuel);assert.equal(s.f.writes.length,writes);const end=s.g.tick;while(s.g.tick<end+31)s.step();assert.equal(s.e.bossWeapon,null);s.step();assert.equal(s.e.bossWeapon?.phase,'warning');assert.equal(s.e.bossWeapon.startTick,start+62);
});
test('locked aim misses a player outside its cone and blocked LOS applies no damage',()=>{
 for(const mode of['cone','wall']){const s=setup(),start=warning(s),dir={...s.e.bossWeapon.direction};if(mode==='wall')s.g.world.lineClear=()=>false;else{s.g.player.pos={x:s.e.home.x-dir.z*2.5,z:s.e.home.z+dir.x*2.5};s.g.world.move=p=>({...p});}
  while(s.g.tick<start+30)s.step();assert.equal(s.g.player.hp,150,mode);assert(s.events.some(e=>e.type==='boss-flame-pulse'&&!e.contact));}
});
test('ordinary dodge moves out of locked burst and existing vest mitigation remains authoritative',()=>{
 const s=setup(),start=warning(s);while(s.g.tick<start+1)s.step();const dir=s.e.bossWeapon.direction;s.step({dodge:true,move:{x:-dir.z,z:dir.x}});while(s.g.tick<start+30)s.step();assert.equal(s.g.player.hp,150);
 const armoured=setup();armoured.g.vest={version:1,itemId:'westminster-worn-vest-v1',equipped:true};const t=warning(armoured);while(armoured.g.tick<t+66)armoured.step();assert(Math.abs(armoured.g.player.hp-142.8)<1e-8);
});
test('stagger, pause, death and safehouse cancel the transient attack; area departure is covered by pursuit tests',()=>{
 for(const mode of['stagger','pause','death','safehouse']){const s=setup();warning(s);
  if(mode==='stagger')s.e.staggerUntil=s.g.time+.5;
  if(mode==='death')s.e.hp=0;
  if(mode==='safehouse')s.g.player.pos=s.g.world.geometry.ground({x:.09,y:.575});
  s.step(mode==='pause'?{paused:true}:{});assert.equal(s.e.bossWeapon,null,mode);assert.equal(s.g.player.hp,150,mode);

 }
});
