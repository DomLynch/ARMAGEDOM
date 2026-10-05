import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {ratLowBlade} from '../src/rat-contact.js';import bladePath from '../src/rat-data/blade-path.json' with {type:'json'};
import {loadGeometry} from '../../art/donor/probe.mjs';import {createActors} from '../src/actors.js';import {disposeActorSources} from '../src/actor-resources.js';
import {travelTo} from '../src/travel.js';
import {createGame,stepGame,attack,receiveHit} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';import {pistolCue} from '../src/pistol-targeting.js';
const publicRoot=new URL('../public/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets/manifest-hollow.json',publicRoot)));
const encounter=createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1});
function world(){return {areaId:'east',layout:{characterScale:1.265},spawn:{x:0,z:0},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,geometry:{clear:()=>true,lineClear:()=>true},toRender:(p,h=0)=>new T.Vector3(p.x,h,-p.z)};}
const options={pilot:'donor-knife',encounter,rat:true,pistol:true,supplies:true,finishers:true,areaResidents:true,openingGroup:false};
test('one rat replaces existing East7 without adding residents or West rewards',async()=>{
 const w=world(),g=createGame(w,options);assert.equal(g.enemies.length,9);const rat=g.enemies.find(e=>e.rig==='original-rat');assert.equal(rat.placementKey,'east-roamer-7');assert.equal(rat.hp,20);assert.equal(rat.radius,.4);assert.equal(rat.mobSize,1);assert.equal(rat.weapon,'teeth');assert.equal(g.enemies.filter(e=>e.rig==='original-rat').length,1);
 w.areaId='westminster';const west=createGame(w,options);assert.equal(west.enemies.length,6);assert.ok(west.enemies.every(e=>e.rig==='hollow-scavenger'&&e.hp===40));
 Object.assign(g.pistol,{collected:true,equipped:true,magazine:6});g.enemies=[rat];g.player.pos={x:rat.pos.x,z:rat.pos.z-5};g.pistolUserFacing={x:0,z:1};assert.equal(pistolCue(g).height,.18);
 stepGame(g,{actions:['fire'],aim:{x:0,z:1}});assert.equal(g.kills,1);assert.equal(rat.finisher.recipeId,'ordinary');assert.deepEqual(g.supplies.issued,[]);assert.equal(rat.response.clip,'rat_death');assert.equal(rat.response.ticks,54);
 w.loadArea=async id=>{w.areaId=id;return{x:0,z:0};};const id=rat.id;await travelTo(g,{areaId:'westminster'});assert.equal(g.enemies.length,6);await travelTo(g,{areaId:'east'});assert.equal(g.corpses.length,1);assert.equal(g.corpses[0].id,id);assert.equal(g.corpses[0].response.clip,'rat_death');assert.deepEqual(g.supplies.issued,[]);
});
for(const retreat of [false,true])test(`actual posed foot approach and native close slash ${retreat?'after normal backstep':'without backstep'}`,async t=>{
 const prior=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const models=new Map();for(const[name,description]of Object.entries(manifest.models))models.set(name,{description,gltf:await loadGeometry(fs.readFileSync(new URL('assets/'+description.url,publicRoot))),equipment:description.equipment?await loadGeometry(fs.readFileSync(new URL('assets/'+description.equipment.url,publicRoot))):null});
 const w=world(),g=createGame(w,options),rat=g.enemies.find(e=>e.rig==='original-rat');g.enemies=[rat];Object.assign(rat,{pos:{x:1.4,z:-1.4},home:null,alerted:true});
 const sources=new Set([...models.values()].flatMap(m=>[m.gltf,m.equipment].filter(Boolean))),actors=createActors(new T.Scene(),w,{models,manifest,dispose:()=>disposeActorSources(sources)},{visualScale:1.3225});t.after(()=>actors.dispose());actors.update(g,0);g.ratContact=actors.ratContact();
 const events=[];let separation=Infinity;for(let i=0;i<360;i++){stepGame(g);events.push(...g.events);separation=Math.min(separation,Math.hypot(rat.pos.x-g.player.pos.x,rat.pos.z-g.player.pos.z));actors.events(g);actors.update(g,1/60,0,{presentationDt:1/60});if(events.some(e=>e.type==='hit'&&e.actor===g.player))break;}
 assert.ok(separation>=.8-1e-8);const bites=events.filter(e=>e.type==='hit'&&e.actor===g.player);assert.ok(bites.length,'actual tooth reaches current visible foot from nonoverlap');assert.equal(bites[0].amount,6);assert.equal(bites[0].weapon,'teeth');assert.equal(bites[0].moveId,'rat_bite');assert.equal(actors.views.get(rat.id).finisher,undefined);
 // Native guard/dodge authority remains the shared receive path, independent of geometry selection.
 g.player.hurtUntil=0;g.player.guarding=true;g.player.facing={x:rat.pos.x-g.player.pos.x,z:rat.pos.z-g.player.pos.z};const n=Math.hypot(g.player.facing.x,g.player.facing.z);g.player.facing.x/=n;g.player.facing.z/=n;g.player.guardStart=g.time;g.player.parryUntil=g.time+1;const hp=g.player.hp;receiveHit(g,{amount:6,origin:rat.pos,attacker:rat,block:true,parry:false,moveId:'rat_bite'});assert.equal(g.player.hp,hp);assert.ok(g.events.some(e=>e.type==='block'));assert.ok(!g.events.some(e=>e.type==='parry'));
 g.player.guarding=false;g.player.dodgeStart=g.time-10/60;g.player.dodgeUntil=g.time+20/60;receiveHit(g,{amount:6,origin:rat.pos,attacker:rat,block:true,parry:false,moveId:'rat_bite'});assert.equal(g.player.hp,hp);g.player.dodgeUntil=0;
 g.player.ready=g.player.hurtUntil=0;rat.swing=null;rat.ready=100;
 // Exercise both immediate close-range play and a normal retreat counter.
 const away={x:g.player.pos.x-rat.pos.x,z:g.player.pos.z-rat.pos.z},length=Math.hypot(away.x,away.z);away.x/=length;away.z/=length;
 for(let i=0;retreat&&i<36&&Math.hypot(rat.pos.x-g.player.pos.x,rat.pos.z-g.player.pos.z)<1.25;i++){stepGame(g,{move:away});actors.update(g,1/60,0,{presentationDt:1/60});}
 console.log('LOW_START',JSON.stringify({retreat,p:g.player.pos,rat:rat.pos,d:Math.hypot(rat.pos.x-g.player.pos.x,rat.pos.z-g.player.pos.z)}));
 assert.equal(attack(g,'slash'),true);assert.equal(g.player.swing.clip,'RatLowSlash');assert.ok(Math.abs(g.player.swing.end-g.player.swing.start-.9)<1e-12);assert.equal(g.player.swing.native,true);
 const observed=[],originalHit=g.ratContact.hit;g.ratContact.hit=(a,d,s,b,aft)=>{const hit=originalHit(a,d,s,b,aft);if(s.def.ratLow){const v=actors.views.get(0),blade=v.model.getObjectByName('WeaponDrawn'),actual=[.12,.52].map(y=>blade.localToWorld(new T.Vector3(0,y,0)).toArray()),baked=ratLowBlade(bladePath,s.ageTicks/60,aft.playerRoot);observed.push({age:s.ageTicks,player:g.player.pos,rat:{...rat.pos},d:Math.hypot(rat.pos.x-g.player.pos.x,rat.pos.z-g.player.pos.z),clip:v.motion.currentClip,phase:v.motion.currentPhase,actual,baked,error:Math.max(...actual.flatMap((p,i)=>p.map((n,k)=>Math.abs(n-baked[i][k])))),hit});}return hit;};
 const before=rat.hp;for(let i=0;i<54;i++){stepGame(g);actors.events(g);actors.update(g,1/60,0,{presentationDt:1/60});}
 console.log('ACTIVE_ENDPOINTS',JSON.stringify(observed));assert.equal(rat.hp,before-10,'actual low blade intersects actual rat surface');assert.equal(g.player.swing,null);
 actors.reset();actors.update(g,0,0,{restoreCorpses:true});g.ratContact=actors.ratContact();assert.equal(actors.views.get(rat.id).motion.description.motion,'rat');assert.deepEqual(g.supplies.issued,[]);
});
