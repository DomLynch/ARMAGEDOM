import test from 'node:test';import assert from 'node:assert/strict';
import {createGame} from '../src/combat.js';import {travelTo} from '../src/travel.js';import {ANIMAL_CYCLES,nextAnimalCycle} from '../src/animal-cycle.js';import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';import {encodeRun,restoreRun,applySavedRun,commitFreshRun} from '../src/pistol-save.js';
const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
function fixture(cycle='A',area='westminster'){
 const world={areaId:area,layout:{characterScale:1.265},spawn:{x:0,z:-6},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
 return createGame(world,{pilot:'donor-knife',encounter,pistol:true,supplies:true,vest:true,rat:true,dog:true,roach:true,drone:true,animalVariants:true,animalCycle:cycle,areaResidents:true,openingGroup:false});
}
test('two fixed cycles cover exactly eighteen animal appearances and preserve every protected supplier and drone',async()=>{
 const seen=new Set();for(const cycle of ['A','B']){const g=fixture(cycle);for(const area of ['westminster','east','south']){if(area!=='westminster')await travelTo(g,{areaId:area});assert.equal(g.enemies.length,area==='westminster'?7:10);assert.equal(g.enemies.filter(e=>e.rig==='low-hover-drone').length,1);for(const e of g.enemies){if(e.animalRecipe){seen.add(e.animalRecipe);assert.equal(e.animalRecipe,ANIMAL_CYCLES[cycle][e.placementKey]);assert.equal(e.mobSize,1);}if(['westminster-roamer-1','westminster-roamer-3','westminster-roamer-5'].includes(e.placementKey))assert.equal(e.rig,'hollow-scavenger');}}}
 assert.equal(seen.size,18);assert(seen.has('rat-heavy')&&seen.has('dog-gaunt-hound')&&seen.has('dog-stocky-yard')&&seen.has('roach-heavy-shell')&&seen.has('roach-skitter'));
});
test('conditional creature translations preserve keys and the exact patrol vector',()=>{
 for(const cycle of ['A','B'])for(const area of ['east','south']){const g=fixture(cycle,area);for(const e of g.enemies.filter(e=>e.animalRecipe)){const p=AREA_MOB_SPAWNS[area].find(p=>p.key===e.placementKey),dx=e.pos.x-p.pos.x,dz=e.pos.z-p.pos.z;if(e.placementKey==='east-roamer-9'){assert(Math.abs(dx+.014)<1e-10);assert(Math.abs(dz+.278)<1e-10);}else if(cycle==='A'&&e.placementKey==='east-roamer-5'){assert.equal(dx,0);assert(Math.abs(dz+.046)<1e-10);}else{assert.equal(dx,0);assert.equal(dz,0);}for(let i=0;i<2;i++){assert(Math.abs((e.patrol[i].x-e.home.x)-(p.patrol[i].x-p.pos.x))<1e-9);assert(Math.abs((e.patrol[i].z-e.home.z)-(p.patrol[i].z-p.pos.z))<1e-9);}}}
});
test('cold refresh restores B before assignment and filters killed stable keys without rerolling',async()=>{
 const g=fixture('B');g.supplies.issued=['westminster-roamer-2','westminster-roamer-4'];g.droneDeaths=['westminster-drone-1'];g.player.hp=91;const raw=encodeRun(g),fresh=fixture();applySavedRun(fresh,restoreRun(fresh,raw));assert.equal(fresh.animalCycle,'B');assert.equal(fresh.enemies.length,4);assert.equal(fresh.enemies.find(e=>e.placementKey==='westminster-roamer-6').animalRecipe,'dog-mangy-stray');assert.equal(fresh.player.hp,91);await travelTo(fresh,{areaId:'east'});assert.equal(fresh.enemies.find(e=>e.placementKey==='east-roamer-5').animalRecipe,'rat-heavy');await travelTo(fresh,{areaId:'westminster'});assert.equal(fresh.enemies.length,4);assert.equal(fresh.animalCycle,'B');
 const old=JSON.parse(encodeRun(fixture()));delete old.animalCycle;assert.equal(restoreRun(fixture(),JSON.stringify(old)).animalCycle,'A');for(const cycle of [null,'C',{},0]){old.animalCycle=cycle;assert.equal(restoreRun(fixture(),JSON.stringify(old)),null);}
});
test('Retry changes cycle only with a durable atomic fresh-run save; failure retains health/ammo/deaths and prior record',()=>{
 const prior=fixture('A');prior.player.hp=72;prior.droneDeaths=['east-drone-1'];Object.assign(prior.pistol,{collected:true,equipped:true,magazine:2,reserve:5});let record=encodeRun(prior);const proposed=fixture(nextAnimalCycle(prior.animalCycle));
 assert.equal(commitFreshRun(prior,proposed,()=>false),prior);assert.equal(record,encodeRun(prior));assert.equal(prior.animalCycle,'A');assert.equal(prior.player.hp,72);
 const committed=commitFreshRun(prior,proposed,g=>{record=encodeRun(g);return true});assert.equal(committed.animalCycle,'B');assert.equal(committed.player.hp,150);assert.deepEqual(committed.droneDeaths,[]);assert.equal(committed.pistol.collected,false);assert.equal(JSON.parse(record).animalCycle,'B');assert.equal(nextAnimalCycle(committed.animalCycle),'A');
});
