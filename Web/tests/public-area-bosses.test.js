import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{createAreaRegistry}from'../src/area-registry.js';import{validateAreaContent,validateAreaGeometry}from'../src/engine/area-content.js';import{createGeometry}from'../src/world-geometry.js';import{probeOptionalPocket}from'./helpers/optional-pocket-route.js';import{bladeContact}from'../src/donor/knife.js';
const bytes=p=>readFileSync(new URL(p,import.meta.url)),read=p=>JSON.parse(bytes(p)),manifest=read('../public/world/manifest.json'),registry=createAreaRegistry({manifest}),raw=read('../public/world/area-content.json'),old=read('./fixtures/original139-area-content.json'),models=read('../public/assets/manifest-hollow.json').models,layouts=Object.fromEntries(registry.ids.map(id=>[registry.get(id).layoutRef,read('../public/'+registry.asset(registry.get(id).layoutRef).path)])),content=validateAreaContent(raw,registry,layouts);
test('actual three boss declarations retain139 residents, expedition, progression and old rewards, with only firstkill existing rewards',()=>{
 assert.deepEqual(raw.residents,old.residents);assert.deepEqual(raw.expedition,old.expedition);assert.deepEqual(raw.progression,old.progression);for(const [id,table]of Object.entries(old.loot.tables))assert.deepEqual(raw.loot.tables[id],table);for(const [area,rows]of Object.entries(old.loot.placements))assert.deepEqual(raw.loot.placements[area],rows);
 assert.equal(content.bossData.placements.length,3);for(const row of content.bossData.placements){const p=content.bossData.profiles[row.profileRef],reward=content.lootRules[row.key];assert.equal(content.residents[row.areaId].filter(r=>r.key===row.key).length,1);assert.equal(reward.outcomes.length,1);assert.deepEqual(reward.outcomes[0],row.profileRef==='surgeon'?{itemId:'dressing',quantity:1,weight:1,conditions:['health-missing']}:{itemId:'rounds',quantity:3,weight:1,conditions:['pistol-owned','reserve-space']});assert.equal(p.hazard!==null,row.profileRef==='surgeon');}
});
for(const row of content.bossData.placements)test('actual '+row.profileRef+' exact embedded model/clips/native trace reaches existing player capsule and all exits remain bypassable',()=>{
 const p=content.bossData.profiles[row.profileRef],d=models[p.modelRef],model=bytes('../public/assets/'+d.url);assert.equal(d.deferred,true);assert.equal(model.length,d.bytes);assert.equal(createHash('sha256').update(model).digest('hex'),d.sha256);const gltf=JSON.parse(model.subarray(20,20+model.readUInt32LE(12)).toString().trim()),clips=new Set(gltf.animations.map(a=>a.name));for(const clip of Object.values(d.clips))assert(clips.has(clip),clip);assert.equal(p.contactScale,d.scale*1.3225);
 for(const a of Object.values(p.attacks)){
  const frames=content.bossData.paths[a.path];assert.equal(frames.length,a.windupTicks+a.activeTicks+a.recoveryTicks+1);const attacker={pos:{x:0,z:0},facing:{x:0,z:1},rig:p.modelRef,combatScale:1.265,contactScale:1.265*p.contactScale,contactPaths:content.bossData.paths};let hit=false;
  for(let distance=.5;distance<=a.range*1.265;distance+=.025){const target={pos:{x:0,z:distance},combatScale:1.265,bodyScale:1};for(let tick=a.windupTicks;tick<a.windupTicks+a.activeTicks;tick++)if(bladeContact(attacker,attacker,target,target,a.path,tick-1,tick))hit=true;}
  assert(hit,'actual active native blade must reach unmodified player torso');
  const startTarget={pos:{x:0,z:a.range*1.265},combatScale:1.265,bodyScale:1};
  assert(Array.from({length:a.activeTicks},(_,i)=>a.windupTicks+i).some(tick=>bladeContact(attacker,attacker,startTarget,startTarget,a.path,tick-1,tick)),'AI attack-start boundary must itself reach stationary player without step-in or padded capsule');

  if(row.profileRef==='butcher'){
   const oldAttacker={...attacker,contactScale:1.265*1.3225};let oldHit=false;
   for(let distance=.5;distance<=3.2;distance+=.025){const target={pos:{x:0,z:distance},combatScale:1.265,bodyScale:1};for(let tick=a.windupTicks;tick<a.windupTicks+a.activeTicks;tick++)if(bladeContact(oldAttacker,oldAttacker,target,target,a.path,tick-1,tick))oldHit=true;}
   assert.equal(oldHit,false,'original uncalibrated scale1 blade sails above real player capsule');
  }
  const far={pos:{x:0,z:8},combatScale:1.265};assert.equal(bladeContact(attacker,attacker,far,far,a.path,a.windupTicks,a.windupTicks+1),false);
 }
 const layout=layouts[registry.get(row.areaId).layoutRef];validateAreaGeometry(registry,row.areaId,layout,content.residents,content.expedition,content.bossData);const routes=probeOptionalPocket({geometry:createGeometry(layout),registry,areaId:row.areaId,center:row.pos,avoidRadius:p.wakeDistance+.4});assert(routes.length>=3);for(const route of routes){assert(route.startClear&&route.entryOutsideBoss);assert.deepEqual(route.missingExits,[]);}
});
