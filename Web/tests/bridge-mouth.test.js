import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';import {createBridgeSteering,bodyLineClear} from '../src/bridge-steering.js';
import {createGame,stepGame} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';
import {WESTMINSTER_ATMOSPHERE} from '../src/atmosphere-westminster.js';import {atmosphereForArea} from '../src/atmosphere-areas.js';
const layout=JSON.parse(fs.readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))),geometry=createGeometry(layout);
test('cleared pocket and enlarged mouth have legal player and resident-body room',()=>{
 assert(!layout.blockers.some(b=>b.name==='Bridge mouth sandbag base'));
 for(const radius of [.4,.6,1.09,1.54,1.59])assert(geometry.clear(geometry.ground({x:.75,y:.64}),radius));
 assert(bodyLineClear(geometry,geometry.ground({x:.70625,y:.575}),geometry.ground({x:.770833333333,y:.516666666667}),.6));
});
test('actual Hollow pursuit crosses the widened mouth without illegal jumps or stalled oscillation',()=>{
 const start=geometry.ground({x:.70,y:.66}),goal=geometry.ground({x:.75,y:.61}),world={areaId:'westminster',geometry,spawn:goal,layout,move:geometry.move,lineClear:geometry.lineClear};
 const g=createGame(world,{pilot:'donor-knife',areaResidents:true,openingGroup:false,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 const e=g.enemies.find(e=>e.rig==='hollow-scavenger');g.enemies=[e];e.pos={...start};e.home={...start};e.alerted=true;e.facing={x:0,z:1};assert(geometry.clear(e.pos,e.radius));let arrived=false;
 for(let i=0;i<600;i++){const old={...e.pos};stepGame(g);assert(geometry.clear(e.pos,e.radius));assert(Math.hypot(e.pos.x-old.x,e.pos.z-old.z)<=e.moveSpeed/60+1e-8);if(Math.hypot(e.pos.x-goal.x,e.pos.z-goal.z)<e.radius+g.player.radius+.3){arrived=true;break;}}
 assert(arrived,'Existing resident pursuit stalled at cleared mouth');
});
test('downstream animal body capacity still rejects an impossible whole-bridge route',()=>{
 const goal=geometry.ground({x:.97,y:.34}),actor={pos:geometry.ground({x:.75,y:.64}),radius:1.59},steering=createBridgeSteering();
 assert.equal(bodyLineClear(geometry,actor.pos,goal,actor.radius),false);assert.equal(steering.steer({world:{areaId:'westminster',geometry},actor,goal,time:0}),goal);
 for(let i=0;i<120;i++){const target=steering.steer({world:{areaId:'westminster',geometry},actor,goal,time:i/60}),dx=target.x-actor.pos.x,dz=target.z-actor.pos.z,n=Math.hypot(dx,dz);const next=geometry.move(actor.pos,{x:dx/Math.max(n,1)*.03,z:dz/Math.max(n,1)*.03},actor.radius);assert(geometry.clear(next,actor.radius));actor.pos=next;}
});
test('removed painted fires have no live anchors; retained fire settings and seeds stay exact',()=>{
 const ids=WESTMINSTER_ATMOSPHERE.map(a=>a.id);assert.deepEqual(ids,['bus-roof','tower-breach','parliament-base-fire','parliament-west-blaze']);assert.deepEqual(atmosphereForArea('westminster').map(a=>a.seed),[100,101,104,105]);
 const mask=layout.masks.find(m=>m.name==='Foreground wreck');assert.equal(mask.points[1].y,.7);assert.equal(mask.points[2].y,.7);
});
