import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';import {createActors} from '../src/actors.js';
import {createGame,stepGame} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';
// calf() re-poses only the player and the asking dog (projectileContactIds), not every lowStrike animal: pose work per tick is O(N), not O(N^2).
const publicRoot=new URL('../public/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets/manifest-hollow.json',publicRoot)));
const goldenUrl=new URL('fixtures/calf-contact-narrow-golden.json',import.meta.url);
const encounter=createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1});
const world=()=>({areaId:'south',layout:{characterScale:1.265},spawn:{x:0,z:0},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,geometry:{clear:()=>true,lineClear:()=>true},toRender:(p,h=0)=>new T.Vector3(p.x,h,-p.z)});
const options={pilot:'donor-knife',encounter,rat:true,dog:true,pistol:true,supplies:true,finishers:true,areaResidents:true,openingGroup:false};
const r=n=>typeof n==='number'?+n.toFixed(6):n;
async function models(){const prior=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 const m=new Map();for(const[name,o]of Object.entries(manifest.models)){const d=name==='original-dog'?{...o,scale:1,contact:{canines:o.contact.canines,calfFaces:[{runtimeName:'Skin',face:3181,vertices:[1186,1201,1200]},{runtimeName:'Skin',face:1867,vertices:[1305,1307,1308]}]},clips:{...o.clips,attack:'dog_bite_calf'}}:o;
  m.set(name,{description:d,gltf:await loadGeometry(fs.readFileSync(new URL('assets/'+d.url,publicRoot))),equipment:d.equipment?await loadGeometry(fs.readFileSync(new URL('assets/'+d.equipment.url,publicRoot))):null});}
 return {m,restore(){if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}};}
function scene(m,N,fight=false){const w=world(),g=createGame(w,options),src=g.enemies.filter(e=>e.rig==='original-dog'),list=[];let id=100000;
 for(let i=0;i<N;i++)list.push(i<src.length?src[i]:Object.assign(structuredClone(src[i%src.length]),{id:id++,placementKey:'c'+i}));
 g.enemies=list;g.player.pos={x:0,z:0};
 // fight=false: the ring at 2.5 used for the count (every dog asks calf once per tick); fight=true: the dog-integration bite setup.
 if(fight)g.player.facing={x:-Math.SQRT1_2,z:Math.SQRT1_2};
 list.forEach((e,i)=>{const a=i/N*6.28,d=fight?2.1:2.5;if(fight){delete e.contactGoalReach;e.radius=.77;}e.home=null;e.alerted=true;e.pos={x:Math.cos(a)*d,z:Math.sin(a)*d};});
 const actors=createActors(new T.Scene(),w,{models:m,manifest,dispose(){}},{visualScale:1.3225});g.ratContact=actors.ratContact();actors.update(g,0,0);
 return {g,actors};}
// Counts motion poses made inside contact-only updates, split by the ratContact method asking for them.
function instrument(g,actors){const c={pose:0,by:{},calls:{}};let label='other',inContact=false;const wrapped=new WeakSet();
 const wrap=()=>{for(const v of actors.views.values())if(v.motion&&!wrapped.has(v)){wrapped.add(v);for(const k of['sampleContacts','update']){if(!v.motion[k])continue;const o=v.motion[k].bind(v.motion);v.motion[k]=(...a)=>{if(inContact){c.pose++;c.by[label]=(c.by[label]||0)+1;}return o(...a);};}}};
 const ou=actors.update.bind(actors);actors.update=function(game,dt,p,opts){wrap();if(!opts?.contactOnly)return ou.call(this,game,dt,p,opts);const prev=inContact;inContact=true;try{return ou.call(this,game,dt,p,opts);}finally{inContact=prev;}};
 const rc=g.ratContact;for(const k of['capture','foot','calf']){const o=rc[k];rc[k]=(...a)=>{c.calls[k]=(c.calls[k]||0)+1;const p=label;label=k;try{return o(...a);}finally{label=p;}};}
 return c;}
// Expected pose calls for one tick: capture runs twice over (N+1) views; calf runs N times over 2 views (before the change: (N+2)*(N+1) = 42/272/992).
const EXPECTED={5:{pose:22,capture:12,calf:10},15:{pose:62,capture:32,calf:30},30:{pose:122,capture:62,calf:60}};
for(const N of[5,15,30])test(`calf contact pose count is O(N): ${N} alerted dogs`,async t=>{const {m,restore}=await models();t.after(restore);
 const {g,actors}=scene(m,N),c=instrument(g,actors);stepGame(g,{});
 assert.deepEqual(c.calls,{capture:2,calf:N});assert.equal(c.pose,EXPECTED[N].pose);assert.equal(c.by.capture,EXPECTED[N].capture);assert.equal(c.by.calf,EXPECTED[N].calf);});
function trace(m,N,ticks=150){const {g,actors}=scene(m,N,true),rc=g.ratContact,calf=rc.calf,goals=[];
 const idx=new Map(g.enemies.map((e,i)=>[e.id,i])); // ids come from a process-global counter; index by spawn order instead
 rc.calf=(game,dog)=>{const v=calf(game,dog);goals.push([idx.get(dog.id),v&&[r(v.x),r(v.y),r(v.z),v.face]]);return v;};
 const out=[];for(let i=0;i<ticks;i++){goals.length=0;stepGame(g,{});
  out.push({tick:g.tick,php:r(g.player.hp),calf:goals.map(x=>x.slice()),events:g.events.filter(e=>['hit','block','parry','enemy-attack'].includes(e.type)).map(e=>[e.type,idx.get(e.actor?.id),r(e.amount),e.moveId]),
   dogs:g.enemies.map(e=>[idx.get(e.id),r(e.pos.x),r(e.pos.z),e.swing?e.swing.clip:null,e.swing?.calfGoal?[r(e.swing.calfGoal.x),r(e.swing.calfGoal.y),r(e.swing.calfGoal.z)]:null,r(e.hp)])});}
 return out;}
// Golden recorded from UNCHANGED origin/main (calf() re-posing every animal) BEFORE the narrowing; never re-record on the new code.
test('calf narrowing is behaviour neutral: per-tick bite goals, calf results, damage events identical to the pre-change golden',async t=>{const {m,restore}=await models();t.after(restore);
 const got={};for(const N of[5,15,30])got[N]=JSON.parse(JSON.stringify(trace(m,N)));
 if(process.env.RECORD_GOLDEN==='1'){fs.writeFileSync(goldenUrl,JSON.stringify(got));return;}
 const golden=JSON.parse(fs.readFileSync(goldenUrl,'utf8'));
 for(const N of[5,15,30])for(let i=0;i<golden[N].length;i++)assert.deepEqual(got[N][i],golden[N][i],`N=${N} first differing tick ${golden[N][i].tick}`);});
