import fs from'node:fs';
import{RIFLE_SAVE_KEY}from'../src/engine/rifle-core.js';
import{FLAME_SAVE_KEY}from'../src/engine/flame-core.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/rifle-fixture.js';
import {BOSS_EQUIPMENT_PROFILES as profiles,bossEquipmentClock} from '../src/engine/boss-equipment-data.js';
import {stageProgressionDeath} from '../src/engine/progression-runtime.js';import {issueSupply} from '../src/supplies.js';import {stepGame} from '../src/combat.js';
import{armedBossEquipment as armed,nearBossEnemy as near}from'./helpers/boss-equipment-fixture.js';
const step=(f,intent={})=>{stepGame(f.g,intent,1/60,{dispatchBossEquipment:f.p.dispatchBossEquipment,dispatchRifle:f.p.dispatchRifle,dispatchPistol:f.p.dispatchPistol,dispatchMarshalPistol:f.p.dispatchMarshalPistol});f.persisted=f.p.persistRun(f.g);};
test('actual Shotgun step pays one shell before eight rays and one victim hit/death, held input ignored and2.4s reload finite',()=>{
 const f=armed('shotgun'),g=f.g,target=g.enemies.find(e=>e.rig==='hollow-scavenger'&&e.hp===40);assert(target);const aim=near(f,target),mastery={...g.progression.proficiency};step(f,{actions:['fire'],aim});assert.equal(g.bossEquipment.shotgun.magazine,1);const shot=g.events.find(e=>e.type==='shot');assert.equal(shot.weapon,'shotgun');assert.equal(shot.pellets.length,8);assert.equal(g.events.filter(e=>e.type==='hit'&&e.actor===target).length,1);assert.equal(g.events.filter(e=>e.type==='death'&&e.actor===target).length,1);assert.equal(target.hp,0);assert(f.p.persistRun(g));assert(g.progression.awards.some(a=>a.placementKey===target.placementKey&&a.weaponId===profiles.shotgun.itemId));assert.deepEqual(g.progression.proficiency,mastery);
 for(let i=0;i<60;i++)step(f,{held:['fire'],aim});assert.equal(g.bossEquipment.shotgun.magazine,1);step(f,{actions:['stab']});const until=bossEquipmentClock(g,'shotgun').reloadingUntil;assert(Math.abs(until-g.time-2.4)<1e-7);for(let i=0;i<120;i++)step(f);assert.equal(g.bossEquipment.shotgun.magazine,1);for(let i=0;i<26;i++)step(f);assert.equal(g.bossEquipment.shotgun.magazine,2);assert.equal(g.bossEquipment.shotgun.reserve,11);
});
test('actual Grenade on controlled stationary target pays before spawn, waits one second and damages once without mastery',()=>{
 const f=armed('grenade'),g=f.g,target=g.enemies.find(e=>e.hp>0);assert(target);const aim=near(f,target),point={...target.pos},mastery={...g.progression.proficiency};step(f,{actions:['fire'],aim,aimPoint:point});assert.equal(g.bossEquipment.grenade.magazine,2);assert.equal(g.activeGrenades.length,1);assert(g.events.some(e=>e.type==='grenade-throw'));const hp=target.hp,events=[];for(let i=0;i<59;i++){step(f);events.push(...g.events);}assert.equal(target.hp,hp);for(let i=0;i<3;i++){step(f);events.push(...g.events);}assert.equal(target.hp,0);assert.equal(g.activeGrenades.length,0);assert.equal(events.filter(e=>e.type==='grenade-blast').length,1);assert.equal(events.filter(e=>e.type==='hit'&&e.actor===target).length,1);assert.equal(events.filter(e=>e.type==='death'&&e.actor===target).length,1);const impact=events.find(e=>e.type==='hit').impactDirection;assert(Math.hypot(impact.x,impact.z)>.99);assert(f.p.persistRun(g));assert(g.progression.awards.some(a=>a.placementKey===target.placementKey&&a.weaponId===profiles.grenade.itemId));assert.deepEqual(g.progression.proficiency,mastery);for(let i=0;i<90;i++){step(f);assert(!g.events.some(e=>e.type==='grenade-blast'));}assert.equal(g.bossEquipment.grenade.magazine,2);
});
test('failed durable payment creates no projectile, and actual area change cancels an already-paid grenade',()=>{
 const f=armed('grenade'),g=f.g,target=g.enemies.find(e=>e.hp>0),aim=near(f,target),aimPoint={...target.pos};f.quota(true);step(f,{actions:['fire'],aim,aimPoint});assert.equal(g.bossEquipment.grenade.magazine,3);assert.equal(g.activeGrenades?.length??0,0);assert(!g.events.some(e=>e.type==='grenade-throw'));f.quota(false);step(f,{actions:['fire'],aim,aimPoint});assert.equal(g.activeGrenades.length,1);f.world.areaId='westminster';step(f);assert.equal(g.activeGrenades.length,0);assert.equal(g.bossEquipment.grenade.magazine,2);assert(!g.events.some(e=>e.type==='grenade-blast'));
});

test('actual Railgun charged release and finite reload conserve Pistol and reject unpaid shot/transfer',()=>{
 const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/rifle166-earned-v9.json',import.meta.url))),f=armed('commanderPistol',new Map([[RIFLE_SAVE_KEY,receipt.rawV9],[FLAME_SAVE_KEY,receipt.rawV8]])),g=f.g,target=g.enemies.find(e=>e.rig==='hollow-scavenger'&&e.hp===40);assert(target);const aim=near(f,target),pistol={...g.pistol},hp=target.hp,profile=profiles.commanderPistol;
 const services={dispatchBossEquipment:f.p.dispatchBossEquipment,railgunSource:()=>({x:g.player.pos.x,y:1,z:-g.player.pos.z}),railgunTrace:()=>[{enemy:target}]};
 const advance=(intent={})=>stepGame(g,intent,1/60,services),edge=lifetime=>({kind:'fire',lifetime});
 function charge(lifetime){const e=edge(lifetime);advance({aim,actionEdges:{started:[e],held:[e],released:[]}});assert(g.railgunCharge);for(let i=0;i<Math.ceil(profile.charge.seconds*60);i++)advance({aim,actionEdges:{started:[],held:[e],released:[]}});advance({aim,actionEdges:{started:[],held:[],released:[e]}});}
 f.quota(true);charge(1);assert.equal(g.bossEquipment.commanderPistol.magazine,1);assert.equal(target.hp,hp);assert(!g.events.some(e=>e.type==='railgun-shot'));assert.deepEqual(g.pistol,pistol);
 f.quota(false);charge(2);assert.equal(g.bossEquipment.commanderPistol.magazine,0);assert.equal(g.events.find(e=>e.type==='railgun-shot').damage,profile.rules.damage);assert.equal(target.hp,0);assert.deepEqual(g.pistol,pistol);
 const clock=bossEquipmentClock(g,'commanderPistol');for(let i=0;i<140&&!clock.reloadingUntil;i++)advance();assert(clock.reloadingUntil>g.time);const deadline=clock.reloadingUntil;assert(Math.abs(deadline-g.time-profile.rules.reload)<1e-7);
 f.quota(true);while(g.time+1e-8<deadline)advance();assert.deepEqual([g.bossEquipment.commanderPistol.magazine,g.bossEquipment.commanderPistol.reserve],[0,3]);assert.deepEqual(g.pistol,pistol);assert(g.bossEquipment.commanderPistol.selected);
 f.quota(false);for(let i=0;i<Math.ceil(profile.rules.reload*60)+3;i++)advance();assert.deepEqual([g.bossEquipment.commanderPistol.magazine,g.bossEquipment.commanderPistol.reserve],[1,2]);assert.deepEqual(g.pistol,pistol);assert.equal(f.records.get(RIFLE_SAVE_KEY),receipt.rawV9);
});

test('Sticky mode is free, actual attachment keeps paid fuse, follows movement, detaches on death, blasts once and cold defaults Standard',()=>{
 const f=armed('grenade'),g=f.g,target=g.enemies.find(e=>e.hp>0),aim=near(f,target),aimPoint={...target.pos};let contact=true;
 const services={dispatchBossEquipment:f.p.dispatchBossEquipment,grenadeSource:()=>({x:g.player.pos.x,y:1,z:-g.player.pos.z}),grenadeTrace:()=>contact?{enemy:target,position:{x:target.pos.x,y:1,z:-target.pos.z},anchor:{}}:null,grenadeFollow:()=>({x:target.pos.x+.1,y:1.2,z:-target.pos.z})};
 const advance=(intent={})=>stepGame(g,intent,1/60,services);
 advance({guardPressed:true});assert.equal(g.grenadeMode,'sticky');assert.equal(g.bossEquipment.grenade.magazine,3);advance({guard:true});assert.equal(g.grenadeMode,'sticky');
 advance({actions:['fire'],aim,aimPoint});assert.equal(g.bossEquipment.grenade.magazine,2);const deadline=g.activeGrenades[0].intent.detonateAt;
 advance();assert(g.events.some(e=>e.type==='grenade-attach'));assert.equal(g.activeGrenades[0].sticky.attachment.victimId,target.placementKey);
 advance({guardPressed:true});assert.equal(g.grenadeMode,'standard');assert.equal(g.activeGrenades[0].mode,'sticky');target.pos.x+=.2;advance();assert(Math.abs(g.activeGrenades[0].intent.position.x-target.pos.x-.1)<1e-8);assert.equal(g.activeGrenades[0].intent.detonateAt,deadline);
 const last={...g.activeGrenades[0].intent.position};target.hp=0;advance();assert.equal(g.activeGrenades[0].sticky.attachment,null);assert.deepEqual(g.activeGrenades[0].intent.position,last);
 let blasts=0;for(let i=0;i<100;i++){advance();blasts+=g.events.filter(e=>e.type==='grenade-blast').length;}assert.equal(blasts,1);assert.equal(g.activeGrenades.length,0);assert.equal(g.bossEquipment.grenade.magazine,2);
 assert(f.p.persistRun(g));const restored=armed('grenade');restored.records.clear();for(const[key,value]of f.records)restored.records.set(key,value);restored.restore();assert.equal(restored.g.grenadeMode,undefined);assert.deepEqual(restored.g.activeGrenades,[]);assert.equal(restored.g.bossEquipment.grenade.magazine,2);
});
