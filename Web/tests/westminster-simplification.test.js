import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {publicAreaRegistry as registry} from '../src/area-registry.js';
import {createGeometry} from '../src/world-geometry.js';
import {LondonWorld} from '../src/world.js';
import {createRouteGuidance,validateTutorialPath,capsuleSegmentClear} from '../src/engine/route-guidance.js';
import {selectedAtlasRoute} from '../src/engine/expedition-runtime.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';
import {bossExitGate} from '../src/engine/area-bosses.js';
import {MARKED_SAVE_KEY} from '../src/engine/marked-core.js';
import {HUB_SAVE_KEY} from '../src/engine/hub-core.js';
import {fixture} from './helpers/rifle-fixture.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const data=validateAreaMetadata(read('../public/world/area-content.json'),registry);
const make=(records=new Map())=>fixture({areaId:registry.initialArea,records,extraWorld:{bossEquipmentData:data.bossEquipmentData,safehouseData:data.safehouseData,reaperData:data.reaperData,markedData:data.markedData}});
const raw18=fs.readFileSync(new URL('./fixtures/navigation203-source202-v18.json',import.meta.url),'utf8').trim();
const raw17=fs.readFileSync(new URL('./fixtures/marked196-source195-v17.json',import.meta.url),'utf8');
test('the former Westminster shortcut threshold stays dead; the grid Westminster-Hub link sits on the east edge and its hub door on the west edge',()=>{
 {
  const id='westminster',layout=read('../public/world/'+id+'/layout.json'),g=createGeometry(layout),position=g.ground({x:.345,y:.965});
  assert(g.clear(position,.4));assert(!layout.guidance.some(row=>row.to==='central-hub'));
  assert.equal(LondonWorld.prototype.travelAt.call({areaId:id,registry,geometry:g},position),null);
  const world={areaId:'westminster',THREE,layout,geometry:g,group:new THREE.Group(),toRender:(p,y=0)=>new THREE.Vector3(p.x,y,-p.z),travelAt:()=>null};
  const cue=createRouteGuidance(world);assert(cue);assert.equal(cue.group.getObjectByName('Central Safehouse side entrance'),undefined);cue.dispose();
 }
 {
  const g=createGeometry(read('../public/world/central-hub/layout.json')),position=g.ground({x:.025,y:.45});
  assert(g.clear(position,.4));assert.equal(LondonWorld.prototype.travelAt.call({areaId:'central-hub',registry,geometry:g},position)?.areaId,'westminster');
 }
 assert.deepEqual(registry.links('central-hub').map(l=>l.to).sort(),['area7','east','south','westminster']);
});
test('original Shelter tutorial retains every legal waypoint and clearly names Westminster Shelter',()=>{
 const layout=read('../public/world/westminster/layout.json'),g=createGeometry(layout),row=validateTutorialPath(layout,g),anchor=layout.setPieceSlot.at;
 assert.deepEqual(layout.tutorialPath.at(-1),anchor);assert.equal(row.path.length,6);
 const world={areaId:'westminster',THREE,layout,geometry:g,group:new THREE.Group(),camera:new THREE.PerspectiveCamera(),toRender:(p,y=0)=>new THREE.Vector3(p.x,y,-p.z),travelAt:()=>null};
 const cue=createRouteGuidance(world);cue.setTutorial(true);
 for(let i=0;i<row.path.length-1;i++){const p=row.path[i],next=cue.resolve(p);assert(next);assert(capsuleSegmentClear(g,p,next.target));assert.match(cue.hint(p),/AHEAD/);assert(!cue.hint(p).includes('SHELTER'));assert(!cue.hint(p).includes('CENTRAL'));}
 cue.dispose();
});
test('Westminster ships no safehouse: only the Central Hub site remains, and the empty set-piece slot marks the old spot',()=>{
 const layout=read('../public/world/westminster/layout.json'),site=data.safehouseData;
 assert.equal(site.areaId,'central-hub');assert(site.wholeArea);assert.equal(site.additionalSites,undefined);
 assert.deepEqual(layout.setPieceSlot,{id:'westminster-steps-set-piece',contents:null,at:layout.tutorialPath.at(-1)});
 assert.equal(fs.existsSync(new URL('../public/world/westminster/safehouse-patch.png',import.meta.url)),false);
});
test('the uncollected pistol is the first route target, then the arrow moves on to the steps',()=>{
 const layout=read('../public/world/westminster/layout.json'),g=createGeometry(layout),start=g.ground(layout.tutorialPath[0]),pistol={x:-0.85,z:-6.15};
 const world={areaId:'westminster',THREE,layout,geometry:g,group:new THREE.Group(),camera:new THREE.PerspectiveCamera(),toRender:(p,y=0)=>new THREE.Vector3(p.x,y,-p.z),travelAt:()=>null};
 const cue=createRouteGuidance(world);cue.setTutorial(true);
 assert.equal(cue.resolve(start).row.kind,'tutorial');
 cue.setPistolTarget(pistol);
 const first=cue.resolve(start);assert.equal(first.row.kind,'pistol');assert.deepEqual(first.target,pistol);assert.match(cue.hint(start),/PISTOL/);
 assert.equal(cue.resolve({x:pistol.x+0.6,z:pistol.z}).row.kind,'pistol');
 assert.notEqual(cue.resolve({x:pistol.x+0.1,z:pistol.z})?.row.kind,'pistol');
 cue.setPistolTarget(null);assert.equal(cue.resolve(start).row.kind,'tutorial');
 cue.setTutorial(false);cue.setPistolTarget(pistol);assert.notEqual(cue.resolve(start)?.row.kind,'pistol');
 cue.dispose();
});
test('selected atlas routes follow the grid: Westminster and the Hub are neighbours again',()=>{
 assert.deepEqual(selectedAtlasRoute(registry,'westminster','central-hub').map(l=>l.to),['central-hub']);
 assert.deepEqual(selectedAtlasRoute(registry,'central-hub','westminster').map(l=>l.to),['westminster']);
 for(const from of registry.ids)for(const to of registry.ids){const route=selectedAtlasRoute(registry,from,to);if(from!==to){assert(route.length>0,from+' to '+to);assert.equal(route.at(-1).to,to);}}
});
test('genuine prior18 and17 cold restores retain resources/visits and start at legal Westminster without a saved route or position',()=>{
 for(const [key,raw] of [[MARKED_SAVE_KEY,raw18],[HUB_SAVE_KEY,raw17]]){
  const records=new Map([[key,raw],[HUB_SAVE_KEY,raw17]]),f=make(records),spawn={...f.g.player.pos},before=JSON.parse(raw);f.restore();assert(!f.g.runSaveInvalid);assert.equal(f.world.areaId,'westminster');assert.deepEqual(f.g.player.pos,spawn);assert(f.world.geometry.clear(spawn,.4));
  const saved=JSON.parse(records.get(MARKED_SAVE_KEY));assert.equal(saved.hp,before.hp);for(const field of ['pistol','bossEquipment','locker','progression','expedition'])assert.deepEqual(saved[field],before[field],field);if(before.marked)assert.deepEqual(saved.marked,before.marked);assert.equal(records.get(HUB_SAVE_KEY),raw17);
  for(const field of ['areaId','position','pos','pin','arrival'])assert(!Object.hasOwn(saved,field));
 }
});
test('legacy early hub-only visit saves cold-start safely with the hub exits open and without resetting progress',()=>{
 const old=make();old.restore();old.world.areaId='central-hub';old.g.player.pos={x:-999,z:-999};assert(old.p.persistRun(old.g));const raw=old.records.get(MARKED_SAVE_KEY),saved=JSON.parse(raw);assert.deepEqual(saved.expedition.visitedIds,['westminster','central-hub']);
 const restored=make(old.records),spawn={...restored.g.player.pos};restored.restore();assert(!restored.g.runSaveInvalid);assert.equal(restored.world.areaId,'westminster');assert.deepEqual(restored.g.player.pos,spawn);assert.deepEqual(JSON.parse(old.records.get(MARKED_SAVE_KEY)),saved);
 restored.world.areaId='central-hub';for(const to of ['east','south','area7'])assert.equal(bossExitGate(restored.g,to),null,to);
});
