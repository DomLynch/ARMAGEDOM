import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
import {bodyLineClear} from '../src/bridge-steering.js';
import {COMMANDER_RULES as R,createCommanderMatch,selectCommander,orderCommander,stepCommander,commanderDamage,commanderSnapshot} from '../src/engine/commander/match.js';
const layout=JSON.parse(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
function fixture(){const geometry=createGeometry(layout),world={areaId:'westminster',geometry,move:geometry.move,lineClear:geometry.lineClear};return{world,s:createCommanderMatch(world)};}
function advance(f,seconds){const events=[];for(let i=0;i<Math.ceil(seconds*60)&&!f.s.result;i++){stepCommander(f.s,f.world);events.push(...f.s.events);}return events;}
test('three actual machine rigs share full1.10m physical clearance and a registered capture pocket',()=>{
 const{world,s}=fixture();assert.equal(s.units.length,3);assert(s.units.every(e=>e.team==='machine'&&e.rig==='low-hover-drone'&&e.radius===1.1));assert(s.opponents.every(e=>e.team==='biological'&&e.rig==='hollow-scavenger'));assert(bodyLineClear(world.geometry,s.spawn,s.objective.pos,1.1));for(const a of s.units){assert(world.geometry.clear(a.pos,a.radius));for(const b of s.units)if(a!==b)assert(Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z)>=a.radius+b.radius);}
});
test('owned one/all orders acknowledge actual formation, reject illegal points/teams/dead selection without mutation',()=>{
 const f=fixture(),{s,world}=f;assert.equal(orderCommander(s,world,{type:'move',point:s.objective.pos}).ok,false);assert(selectCommander(s,[s.units[0].id]));assert.equal(orderCommander(s,world,{type:'attack',targetId:s.units[1].id}).ok,false);const before=JSON.stringify(s.units.map(e=>e.order));assert.equal(orderCommander(s,world,{type:'move',point:{x:1e6,z:1e6}}).ok,false);assert.equal(JSON.stringify(s.units.map(e=>e.order)),before);assert(selectCommander(s,s.units.map(e=>e.id)));const ack=orderCommander(s,world,{type:'move',point:s.objective.pos});assert(ack.ok);assert.equal(ack.unitIds.length,3);assert.equal(ack.destinations.length,3);const positions=s.units.map(e=>({...e.pos}));advance(f,2);assert(s.units.every((e,i)=>Math.hypot(e.pos.x-positions[i].x,e.pos.z-positions[i].z)>.1));assert(s.units.every(e=>world.geometry.clear(e.pos,e.radius)));assert(orderCommander(s,world,{type:'defend'}).ok);assert(s.units.every(e=>e.order.type==='defend'));
});
test('real finite existing-ray bolts hit biological opponents; allied/dead/foreign actors cannot receive damage',()=>{
 const f=fixture(),{s}=f,hp=s.opponents.map(e=>e.hp),machine=s.units[0],ally=s.units[1];assert.equal(commanderDamage(s,machine,ally,6),false);assert.equal(ally.hp,R.machineHP);assert.equal(commanderDamage(s,{...machine},s.opponents[0],6),false);const events=advance(f,3),hits=events.filter(e=>e.type==='hit');assert(hits.some(e=>e.actor.team==='biological'&&e.amount===R.damage));assert(s.opponents.some((e,i)=>e.hp<hp[i]));s.opponents[0].hp=0;assert.equal(commanderDamage(s,machine,s.opponents[0],6),false);
});
test('walls and range remain authoritative for actual finite bolts; no instantaneous selected-target damage',()=>{
 const f=fixture(),{s}=f;s.opponents=s.opponents.slice(0,1);const enemy=s.opponents[0],before=enemy.hp;f.world.lineClear=()=>false;advance(f,4);assert.equal(enemy.hp,before);assert.equal(s.bolts.length,0);const g=fixture();for(const e of g.s.opponents)e.pos={x:e.pos.x+40,z:e.pos.z+40};const hp=g.s.opponents.map(e=>e.hp);advance(g,1);assert.deepEqual(g.s.opponents.map(e=>e.hp),hp);
});
test('finite replacement budget and live cap charge exactly once only after legal deployment',()=>{
 const f=fixture(),{s,world}=f;assert.equal(orderCommander(s,world,{type:'deploy'}).ok,false);assert.equal(s.reserve,30);for(let i=0;i<3;i++){s.units.find(e=>e.hp>0).hp=0;const count=s.units.length,ack=orderCommander(s,world,{type:'deploy'});assert(ack.ok);assert.equal(s.units.length,count+1);assert.equal(s.reserve,30-(i+1)*10);assert.equal(s.units.filter(e=>e.hp>0).length,3);assert.equal(orderCommander(s,world,{type:'deploy'}).ok,false);}s.units.find(e=>e.hp>0).hp=0;assert.equal(orderCommander(s,world,{type:'deploy'}).ok,false);assert.equal(s.reserve,0);
});
test('same capture/defend rules actually complete once and retry builds a clean transient match',()=>{
 const f=fixture();f.s.opponents=[];selectCommander(f.s,f.s.units.map(e=>e.id));assert(orderCommander(f.s,f.world,{type:'move',point:f.s.objective.pos}).ok);advance(f,100);assert.equal(f.s.result?.kind,'success');const final=JSON.stringify(commanderSnapshot(f.s));for(let i=0;i<10;i++)stepCommander(f.s,f.world);assert.equal(JSON.stringify(commanderSnapshot(f.s)),final);const reset=createCommanderMatch(f.world);assert.equal(reset.time,0);assert.equal(reset.reserve,30);assert.equal(reset.units.length,3);assert.equal(reset.result,null);assert.deepEqual(reset.selected,[]);
});
test('biological opponents actually damage machines/checkpoint; loss stops clock and rejects replacement',()=>{
 const f=fixture(),events=advance(f,30);assert(events.some(e=>e.type==='hit'&&e.actor.team==='machine'),'real opposition must hit machine bodies');const g=fixture();g.s.units.forEach(e=>e.hp=0);advance(g,50);assert.equal(g.s.result?.kind,'loss');assert.equal(g.s.objective.hp,0);const before=g.s.time;advance(g,2);assert.equal(g.s.time,before);assert.equal(orderCommander(g.s,g.world,{type:'deploy'}).ok,false);
});
