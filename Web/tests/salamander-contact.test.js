import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';
import {createActors} from '../src/actors.js';
import {createEffects} from '../src/effects.js';
import {disposeActorSources} from '../src/actor-resources.js';
import {stepGame} from '../src/combat.js';
import {salamanderFixture} from './helpers/salamander-fixture.js';
import {safehouseProtected} from '../src/engine/safehouse.js';
import {SALAMANDER_BREATH} from '../src/salamander-native.js';
const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest-hollow.json',base)));
test('Salamander own mouth breath: actual rig, ordinary movement, crowding, exclusions and unchanged Witch',async t=>{
 const oldDocument=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;});
 const models=new Map();for(const name of ['vagrant','giant-salamander','boss-westminster-witch','player-flamethrower']){const d=manifest.models[name];models.set(name,{description:d,gltf:await loadGeometry(fs.readFileSync(new URL(d.url,base))),equipment:d.equipment?await loadGeometry(fs.readFileSync(new URL(d.equipment.url,base))):null});}
 t.after(()=>disposeActorSources(new Set([...models.values()].flatMap(r=>[r.gltf,r.equipment].filter(Boolean)))));
 function setup(distance=4.7,{group=false,corridor=false}={}){
  const {g,world}=salamanderFixture(),e=g.enemies.find(e=>e.rig==='giant-salamander'),witch=g.enemies.find(e=>e.bossProfile?.weapon?.kind==='flame');if(!group)g.enemies=[e];
  g.player.pos={x:e.home.x+.127300418954,z:e.home.z-distance};assert(world.geometry.clear(g.player.pos,g.player.radius));assert(world.lineClear(e.pos,g.player.pos));if(corridor){let found=false;for(let i=0;i<64&&!found;i++){const a=i*Math.PI/32,d={x:Math.cos(a),z:Math.sin(a)},p={x:e.home.x+d.x*distance,z:e.home.z+d.z*distance},end={x:p.x+d.x*2.8,z:p.z+d.z*2.8};if(world.geometry.clear(p,g.player.radius)&&Array.from({length:33},(_,j)=>({x:p.x+d.x*2.8*j/32,z:p.z+d.z*2.8*j/32})).every(q=>world.geometry.clear(q,g.player.radius))&&world.lineClear(e.pos,end)){g.player.pos=p;found=true;}}assert(found,'actual geometry must allow the full ordinary retreat leg');}g.player.facing={x:0,z:1};const dx=g.player.pos.x-e.pos.x,dz=g.player.pos.z-e.pos.z,n=Math.hypot(dx,dz);e.facing={x:dx/n,z:dz/n};
  const scene=new T.Scene();Object.assign(world,{scene,camera:new T.PerspectiveCamera(),toRender:(p,y=0)=>new T.Vector3(p.x,y,-p.z)});
  const actors=createActors(scene,world,{manifest,models,dispose(){}},{visualScale:1.3225}),fx=createEffects(scene,world,null,()=>null,{getView:a=>actors.views.get(a.id),reducedMotion:()=>false});actors.update(g,0);g.ratContact=actors.ratContact();const events=[],frames=[];
  const step=(intent={})=>{stepGame(g,intent,1/60,{bossFlameSource:a=>actors.flameSource(a.id)});actors.update(g,1/60);fx.update(g,{viewportWidth:393,viewportHeight:852});events.push(...g.events.map(v=>({...v,tick:g.tick,actorId:v.actor?.id})));frames.push({tick:g.tick,hp:g.player.hp,phase:e.bossWeapon?.phase,source:actors.flameSource(e.id),fx:fx.snapshot().salamanderFlame});};
  const start=()=>{for(let n=0;n<240&&!e.bossWeapon;n++)step();assert.equal(e.bossWeapon?.phase,'warning');return e.bossWeapon.startTick;};
  return{g,e,witch,world,actors,fx,events,frames,step,start,dispose(){fx.dispose();actors.dispose();}};
 }
 for(const action of['slash','stab','heavy'])await t.test(`actual Knife ${action} hurts the salamander through the real contact sweep (Dom: any attack)`,()=>{
  const s=setup(1.2);try{const{g,e}=s,hp=e.hp;let locked=null;for(let i=0;i<600&&e.hp===hp;i++){const d={x:e.pos.x-g.player.pos.x,z:e.pos.z-g.player.pos.z};s.step({actions:[action],aim:d,move:Math.hypot(d.x,d.z)>1?d:{x:0,z:0}});if(g.player.swing?.action===action)locked??={ratLow:g.player.swing.def.ratLow,target:g.player.swing.lowTargetId};}
   assert(locked?.ratLow&&locked.target===e.id,'salamander must be the locked low target');assert(e.hp<hp,`actual posed ${action} must touch the salamander mesh`);}finally{s.dispose();}
 });
 await t.test('retreating player is hit without a calf goal or teeth swing; native mouth and exact cadence',()=>{
  const s=setup(4.7,{corridor:true});try{const{g,e,actors}=s;g.ratContact.calf=()=>null;const hp=g.player.hp,start=s.start(),direction={...e.bossWeapon.direction},before={...g.player.pos};
   while(g.tick<start+32){s.step({move:direction,run:true});assert.equal(e.swing,null);}
   const hits=s.events.filter(v=>v.type==='hit'&&v.actor===g.player&&v.attackerId===e.id);assert.equal(hits.length,2);assert(hits.every(v=>v.amount===4&&v.weapon==='flamethrower'));assert.equal(g.player.hp,hp-8);assert(Math.hypot(g.player.pos.x-before.x,g.player.pos.z-before.z)>2.4);
   const pulses=s.events.filter(v=>v.type==='boss-flame-pulse'&&v.actor===e);assert.deepEqual(pulses.map(v=>v.tick-start),[20,26]);assert(pulses.every(v=>v.contact&&v.damaged));assert(s.frames.some(f=>f.fx.emitterParticles>0));assert(s.frames.every(f=>f.fx.cosmeticVictims===0));
   const own=actors.views.get(e.id);assert.equal(own.model.getObjectByName('world-raw').skeleton.bones.length,31);assert(!own.flameMount);assert.equal(e.response.clip,'Bite');assert(Math.abs(own.root.scale.x-6.022665)<1e-12);assert.equal(e.hp,120);assert.equal(e.moveSpeed,1.8);
   // Hold within legal acquisition for the next cycle, without moving the NPC.
   while(g.tick<start+86)s.step();assert.equal(e.bossWeapon?.startTick,start+86);assert.equal(SALAMANDER_BREATH.range,4.86);
   console.log('SALAMANDER213_MOVING',JSON.stringify({start,pulses:pulses.map(v=>({tick:v.tick,position:v.position,contact:v.contact,damaged:v.damaged})),hpBefore:hp,hpAfter:hp-8,playerBefore:before,playerAfter:g.player.pos,cycleTicks:86,source:s.frames.find(f=>f.fx.emitterParticles)?.source,ownRig:true,noTeethDamage:true}));
  }finally{s.dispose();}
 });
 await t.test('near-body player causes backward spacing then actual forward mouth damage',()=>{
  const s=setup(1.5);try{const hp=s.g.player.hp,pos={...s.e.pos};for(let n=0;n<360&&s.g.player.hp===hp;n++)s.step();assert.equal(s.g.player.hp,hp-4);assert(Math.hypot(s.e.pos.x-pos.x,s.e.pos.z-pos.z)>.5);const d=s.e.bossWeapon.direction;assert(d.x*s.e.facing.x+d.z*s.e.facing.z>.99);console.log('SALAMANDER213_CROWDED',JSON.stringify({hpBefore:hp,hpAfter:s.g.player.hp,before:pos,after:s.e.pos,source:s.actors.flameSource(s.e.id),player:s.g.player.pos,tick:s.g.tick}));}finally{s.dispose();}
 });
 await t.test('crowding beside an authored obstacle slides away and recovers a forward attack',()=>{
  const s=setup(1.5);try{let witness;for(let x=.1;x<.95&&!witness;x+=.025)for(let y=.1;y<.95&&!witness;y+=.025){const p=s.world.geometry.ground({x,y});if(!s.world.geometry.clear(p,s.e.radius)||Math.hypot(p.x-s.e.home.x,p.z-s.e.home.z)>10)continue;for(let i=0;i<32&&!witness;i++){const a=i*Math.PI/16,d={x:Math.cos(a),z:Math.sin(a)},target={x:p.x+d.x*1.5,z:p.z+d.z*1.5},back={x:p.x-d.x*.09,z:p.z-d.z*.09};if(s.world.geometry.clear(back,s.e.radius)||!s.world.geometry.clear(target,s.g.player.radius)||!s.world.lineClear(p,target))continue;s.g.player.pos=target;if(!safehouseProtected(s.g))witness={pos:p,target,d,back};}}
   assert(witness,'bounded authored-obstacle crowding witness');s.e.pos={...witness.pos};s.e.facing={...witness.d};s.e.alerted=true;s.g.player.pos={...witness.target};s.actors.update(s.g,0);const hp=s.g.player.hp;
   for(let i=0;i<480&&s.g.player.hp===hp;i++)s.step();console.log('SALAMANDER213_OBSTACLE',JSON.stringify({witness,end:s.e.pos,player:s.g.player.pos,hpBefore:hp,hpAfter:s.g.player.hp,tick:s.g.tick}));assert.equal(s.g.player.hp,hp-4,'existing collision slide must escape blocked backoff and attack');assert(s.world.geometry.clear(s.e.pos,s.e.radius));
  }finally{s.dispose();}
 });
 for(const mode of ['miss','wall','refuge','pause','hurt','death'])await t.test(mode+' uses existing shared exclusions',()=>{
  const s=setup();try{const start=s.start(),hp=s.g.player.hp,d=s.e.bossWeapon.direction;
   if(mode==='miss')s.g.player.pos={x:s.e.pos.x-d.z*4.7,z:s.e.pos.z+d.x*4.7};
   if(mode==='wall')s.world.lineClear=()=>false;
   if(mode==='refuge')s.g.player.pos=s.world.geometry.ground(s.world.safehouseData.props.find(p=>p.id==='comms').standing);
   if(mode==='hurt')s.e.staggerUntil=s.g.time+1;
   if(mode==='death')s.e.hp=0;
   if(mode==='pause'){s.step({paused:true});s.fx.update(s.g,{paused:true});assert.equal(s.fx.snapshot().salamanderFlame.emitterParticles,0);assert.equal(s.e.bossWeapon,null);}
   else while(s.g.tick<start+32)s.step();
   assert.equal(s.g.player.hp,hp);if(!['miss','wall'].includes(mode))assert.equal(s.e.bossWeapon,null);
  }finally{s.dispose();}
 });
});
