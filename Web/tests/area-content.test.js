import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {AREA_DRONE_SPAWNS} from '../src/area-drone-spawns.js';
import {initializeAreaResidents} from '../src/combat.js';
import {createAreaRegistry} from '../src/area-registry.js';import {validateAreaContent,validateAreaMetadata,validateAreaGeometry} from '../src/engine/area-content.js';import {createGame,stepGame} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';import {travelTo} from '../src/travel.js';import {atmosphereForArea,atmosphereBudget} from '../src/atmosphere-areas.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const manifest=read('../public/world/manifest.json'),registry=createAreaRegistry({manifest}),layouts=Object.fromEntries(registry.ids.map(id=>[registry.get(id).layoutRef,read('../public/'+registry.asset(registry.get(id).layoutRef).path)]));
const raw=()=>read('../public/world/area-content.json');
test('loaded public content resolves declared existing mixed foundations and original effect presets through shared data',()=>{
 const data=validateAreaContent(raw(),registry,layouts);assert.equal(data.residents['east-bridge'].length,3);assert.equal(data.residents['east-bridge'][1].foundationRef,'original-rat');assert.equal(atmosphereForArea('east-bridge',data.atmosphere['east-bridge'].anchors).length,4);assert.equal(atmosphereBudget('east-bridge',data.atmosphere['east-bridge'].budget).quads,28);assert(Object.isFrozen(data.layouts['layout.east-bridge']));
});
test('actual provided mixed rows and effects reject bad references, coordinates, aliases and oversized effect budgets',()=>{
 for(const mutate of [c=>c.residents['east-bridge'][1].recipeRef='dog-pack-chaser',c=>c.residents['east-bridge'][1].pos.x=NaN,c=>c.residents['east-bridge'][1].patrol[1]={x:1e5,z:0},c=>c.residents['east-bridge'].push(structuredClone(c.residents['east-bridge'][0])),c=>c.residents.missing=c.residents['east-bridge'],c=>c.residents['east-bridge'][0].callback=true,c=>c.atmosphere['east-bridge'].anchors[0].preset='unknown',c=>c.atmosphere['east-bridge'].anchors[0].x=2,c=>c.atmosphere['east-bridge'].budget.quads=9,c=>c.atmosphere['east-bridge'].budget.textureBytes=1]){const c=raw();mutate(c);assert.throws(()=>validateAreaContent(c,registry,layouts));}
});
test('actual game declares Hollow and Rat through existing factories, native stats and recipes; revisits retain same actors',async()=>{
 const data=validateAreaContent(raw(),registry,layouts),world={bossData:data.bossData,areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},registry,move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
 const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,areaResidents:true,openingGroup:false,rat:true,animalVariants:true,residentPlacements:data.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 await travelTo(g,{areaId:'east-bridge'});const [h,r,boss]=g.enemies;assert.equal(h.rig,'hollow-scavenger');assert.equal(h.hp,40);assert.equal(h.radius,.4);assert.equal(r.rig,'original-rat');assert.equal(r.hp,20);assert.equal(r.radius,1.09);assert.equal(r.animalRecipe,'rat-ash');assert.equal(r.contactGoalReach,1.050307904880233);stepGame(g);assert.equal(g.enemies.length,3);await travelTo(g,{areaId:'east'});await travelTo(g,{areaId:'east-bridge'});assert.deepEqual(g.enemies,[h,r,boss]);assert.equal(g.supplies.issued.length,0);
});

test('declared drones cannot bypass the current persistent death-key and area boundary',()=>{
 const c=raw();Object.assign(c.residents['east-bridge'][1],{foundationRef:'low-hover-drone',recipeRef:'low-hover-watcher'});assert.throws(()=>validateAreaContent(c,registry,layouts),/Unsupported declared drone death placement/);
});
test('supported declared legacy drone spawns once and saved tombstone excludes it without duplicating legacy factory output',()=>{
 const c=raw();delete c.uniqueReward;delete c.population; // Isolated legacy-drone fixture replaces the entire Hale roster and its optional population policy.
 if(c.loot?.placements.east)delete c.loot.placements.east;c.residents.east=[{key:'east-drone-1',foundationRef:'low-hover-drone',recipeRef:'low-hover-watcher',pos:AREA_DRONE_SPAWNS.east[0].pos,patrol:AREA_DRONE_SPAWNS.east[0].patrol}];
 // Use actual legacy placement, which already has verified native-radius clearance.
 const data=validateAreaContent(c,registry,layouts);const w={areaId:'east',layout:{characterScale:1.265}},g=createGame(w,{pilot:'donor-knife',drone:true,supplies:true,areaResidents:true,openingGroup:false,residentPlacements:data.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 assert.equal(g.enemies.filter(e=>e.placementKey==='east-drone-1').length,1);g.droneDeaths=['east-drone-1'];g.enemies=[];g.areaInitialized=false;initializeAreaResidents(g);assert.equal(g.enemies.filter(e=>e.placementKey==='east-drone-1').length,0);
});

test('metadata validates globally without layouts; per-area and offline validation reject the same destination geometry',()=>{
 const c=raw();c.residents['east-bridge'][1].pos={x:1e5,z:0};
 const metadata=validateAreaMetadata(c,registry);assert.equal(metadata.layouts,undefined);
 assert.doesNotThrow(()=>validateAreaGeometry(registry,'westminster',layouts['layout.westminster'],metadata.residents));
 assert.throws(()=>validateAreaGeometry(registry,'east-bridge',layouts['layout.east-bridge'],metadata.residents),/Invalid registered area content/);
 assert.throws(()=>validateAreaContent(c,registry,layouts),/Invalid registered area content/);
 const missing={...layouts};delete missing['layout.area8'];assert.throws(()=>validateAreaContent(raw(),registry,missing));
});

test('optional placement appearance is validated and forwarded without replacing native foundation or stats',()=>{
 const original=validateAreaContent(raw(),registry,layouts),changed=raw();changed.residents['east-bridge'][0].appearanceRef='fixture-look';const data=validateAreaContent(changed,registry,layouts);
 const game=content=>createGame({bossData:content.bossData,areaId:'east-bridge',layout:{characterScale:1.265},spawn:{x:0,z:-6},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true},{pilot:'donor-knife',areaResidents:true,openingGroup:false,residentPlacements:content.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 const before=game(original).enemies[0],after=game(data).enemies[0];assert.equal(after.appearanceRef,'fixture-look');for(const field of ['placementKey','rig','contactRig','weapon','hp','radius','combatScale','bodyScale','mobSize','home','patrol'])assert.deepEqual(after[field],before[field],field);
 for(const value of [undefined,null,42,{},'../look']){const bad=raw();bad.residents['east-bridge'][0].appearanceRef=value;assert.throws(()=>validateAreaContent(bad,registry,layouts),/Invalid registered area content/);}
});
