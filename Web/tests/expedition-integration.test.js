import {historicalRegistry,currentAtlas} from './helpers/historical-registry.js';
import{AREA_MOB_SPAWNS}from'../src/area-mob-spawns.js';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{createGame,stepGame,enemy}from'../src/combat.js';import{createRunPersistence}from'../src/engine/run-core.js';import{createGeometry}from'../src/world-geometry.js';import{validateAreaLoot}from'../src/engine/area-loot.js';import{validateExpeditionData,EXPEDITION_SAVE_KEY,AREA_BOSS_SAVE_KEY,selectedPistolProfile}from'../src/engine/expedition-core.js';import{createProgressionComponent,PROGRESSION_SAVE_KEY}from'../src/engine/progression-core.js';import{progressionOptions}from'../src/engine/progression-runtime.js';import*as oldCodec from'../src/engine/run-state.js';import{stepPistol,PISTOL_RULES}from'../src/pistol.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),content=currentAtlas(read('./fixtures/original139-area-content.json')),registry=historicalRegistry(Object.keys(content.expedition.atlas)),data=validateExpeditionData(content.expedition,registry),baseId='westminster-start-pistol-v1',reward=data.contract.rewardVariantId;
function fixture({records=new Map(),legacy=false,extension=true,bosses=false,extraBossKey=null}={}){
 let quota=false,readsFail=false,observe=null;const writes=[];
 const world={bossData:bosses?{version:1}:null,areaId:'westminster',registry,spawn:{x:0,z:-6},layout:read('../public/world/westminster/layout.json'),residentPlacements:extraBossKey?{...content.residents,east:[...AREA_MOB_SPAWNS.east,{key:extraBossKey,bossRef:'fixture-boss'}]}:content.residents,progressionData:content.progression,expeditionData:extension?data:null,lootRules:validateAreaLoot(content.loot,registry,content.residents)};
 function area(id){world.areaId=id;world.geometry=createGeometry(read('../public/world/'+id+'/layout.json'));world.move=(...args)=>world.geometry.move(...args);world.lineClear=(...args)=>world.geometry.lineClear(...args);}
 area('westminster');const fresh=()=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,animalVariants:true});let g=null;
 const storage={getItem(k){if(readsFail)throw Error('read denied');return records.get(k)??null;},setItem(k,raw){writes.push({key:k,raw});observe?.(k,raw);if(quota)throw Error('quota');records.set(k,raw);}};
 const persistence=createRunPersistence({getRun:()=>g,setRun:next=>g=next,createFreshRun:fresh,storage});g=fresh();
 if(legacy){g.pistol={...g.pistol,collected:true,equipped:true,magazine:4,reserve:7};g.player.weapon='pistol';const p=createProgressionComponent({baseCodec:oldCodec,getRun:()=>g,...progressionOptions(g)});records.set(PROGRESSION_SAVE_KEY,p.codec.encodeRun(g));}
 return{world,records,writes,persistence,get run(){return g;},restore(){persistence.restoreSavedRun(g);return g;},quota(v){quota=v;},readFailure(v){readsFail=v;},observe(v){observe=v;},area,at(action){const anchor=action==='recover'?data.contract.case:data.contract.giver;area(anchor.areaId);g.player.pos={...anchor.position};},command(action,allowed=true){return persistence.dispatchExpedition(g,{type:'expedition',action},allowed);},select(variantId){return persistence.dispatchExpedition(g,{type:'selectVariant',variantId},true);},reload(){return fixture({records});}};
}
function through(f,...actions){for(const action of actions){f.at(action);assert(f.command(action).ok,action);}}
test('real v4/Core migration writes one v5 successor,retains exact138 raw,and F3 includes visits/stages',()=>{
 const f=fixture({legacy:true}),old=f.records.get(PROGRESSION_SAVE_KEY);f.restore();assert.equal(f.run.runSaveInvalid,undefined);assert.equal(f.records.get(PROGRESSION_SAVE_KEY),old);assert.equal(JSON.parse(f.records.get(EXPEDITION_SAVE_KEY)).version,5);assert.deepEqual(f.run.expedition.visitedIds,['westminster']);const n=f.writes.length;assert(f.persistence.persistRun(f.run));assert.equal(f.writes.length,n);
 f.at('accept');assert(f.command('accept').ok);assert.equal(f.run.expedition.status,'accepted');f.area('east');assert(f.persistence.persistRun(f.run));assert.deepEqual(f.run.expedition.visitedIds,['westminster','east']);assert.equal(f.records.get(PROGRESSION_SAVE_KEY),old);const saved=JSON.parse(f.records.get(EXPEDITION_SAVE_KEY));assert.equal(saved.expedition.status,'accepted');assert.deepEqual(saved.expedition.visitedIds,['westminster','east']);
 const p=createProgressionComponent({baseCodec:oldCodec,getRun:()=>f.run,...progressionOptions(f.run)});assert(p.codec.restoreRun(f.run,old,null),'Retained138 record remains readable by actualv4codec');
});
test('legacy v2/v3/pistol-only and fresh records get safe optional defaults without overwriting source',()=>{
 const original=fixture();original.run.pistol={...original.run.pistol,collected:true,equipped:true,magazine:3,reserve:8};const v3=oldCodec.encodeRun(original.run),v2=JSON.parse(v3);v2.version=2;v2.supplies={version:1,issued:[],collected:[],pending:[]};
 for(const[key,raw]of[[oldCodec.RUN_SAVE_KEY,JSON.stringify(v2)],['armagedom:area-run:v3',v3],[oldCodec.PISTOL_SAVE_KEY,oldCodec.encodePistol(original.run.pistol)]]){const f=fixture({records:new Map([[key,raw]])});f.restore();assert(!f.run.runSaveInvalid);assert.equal(f.run.expedition.status,'available');assert.equal(f.run.pistol.magazine,3);assert.equal(f.records.get(key),raw);assert(f.records.has(EXPEDITION_SAVE_KEY));}
 const fresh=fixture();fresh.restore();assert.equal(fresh.run.expedition.status,'available');assert(!fresh.run.pistol.collected);
});
test('present corrupt/unknown v5 never falls back to validv4 and preserves raw; read failure grants nothing',()=>{
 const seed=fixture({legacy:true});seed.restore();const valid=seed.records.get(EXPEDITION_SAVE_KEY);
 for(const raw of['{bad',JSON.stringify({...JSON.parse(valid),expedition:{...JSON.parse(valid).expedition,selectedPistolVariant:'unknown'}}),JSON.stringify({...JSON.parse(valid),future:1})]){const f=fixture({records:new Map(seed.records)});f.records.set(EXPEDITION_SAVE_KEY,raw);f.restore();assert(f.run.runSaveInvalid);assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);assert(!f.command('accept').ok);}
 const denied=fixture({legacy:true});denied.readFailure(true);denied.restore();assert(denied.run.runSaveInvalid);assert(!denied.records.has(EXPEDITION_SAVE_KEY));assert(!denied.command('claim').ok);
});
test('quota during first migration leaves old snapshot readable and no false visit/contract grant',()=>{
 const f=fixture({legacy:true}),raw=f.records.get(PROGRESSION_SAVE_KEY);f.quota(true);f.restore();assert(!f.records.has(EXPEDITION_SAVE_KEY));assert.equal(f.records.get(PROGRESSION_SAVE_KEY),raw);assert.equal(f.run.expedition.status,'available');f.at('accept');assert.equal(f.command('accept').code,'storage-unavailable');assert.equal(f.run.expedition.status,'available');f.quota(false);assert(f.command('accept').ok);assert.equal(f.run.expedition.status,'accepted');
});
test('actual stage/location/alive/scope eligibility rejects forged transitions while guard kill is optional',()=>{
 const f=fixture({legacy:true});f.restore();f.at('accept');assert(!f.command('claim').ok);assert(!f.command('accept',false).ok);f.run.player.hp=0;assert(!f.command('accept').ok);f.run.player.hp=150;assert(f.command('accept').ok);assert(!f.command('recover').ok);f.at('recover');f.run.player.pos.x+=3;assert(!f.command('recover').ok);f.at('recover');f.run.enemies=[{placementKey:data.contract.guard.placementKey,hp:40}];assert(f.command('recover').ok);assert.equal(f.run.enemies[0].hp,40);assert(!f.command('claim').ok);f.at('claim');assert(f.command('claim').ok);
});
test('claim commits receipt+entitlement before publishing,neverautoselects/refills,and duplicateclaim is inert across reload',()=>{
 const f=fixture({legacy:true});f.restore();through(f,'accept','recover');f.at('claim');const ammo={mag:f.run.pistol.magazine,res:f.run.pistol.reserve};f.quota(true);assert.equal(f.command('claim').code,'storage-unavailable');assert.equal(f.run.expedition.status,'recovered');assert.equal(f.run.expedition.rewardReceipt,null);f.quota(false);f.observe((key,raw)=>{if(key===EXPEDITION_SAVE_KEY&&JSON.parse(raw).expedition.status==='claimed'){assert.equal(f.run.expedition.status,'recovered');assert.equal(f.run.expedition.rewardReceipt,null);}});assert(f.command('claim').ok);f.observe(null);assert.equal(f.run.expedition.selectedPistolVariant,baseId);assert.equal(f.run.pistol.magazine,ammo.mag);assert.equal(f.run.pistol.reserve,ammo.res);const n=f.writes.length;assert.equal(f.command('claim').code,'already-collected');assert.equal(f.writes.length,n);const again=f.reload();again.restore();again.at('claim');assert.equal(again.run.expedition.status,'claimed');assert.equal(again.command('claim').code,'already-collected');
});
test('select requires entitlement and real slot; durablefailure leaves selection/ammo/clocks unchanged',()=>{
 const f=fixture({legacy:true});f.restore();assert(!f.select(reward).ok);through(f,'accept','recover','claim');f.run.pistol.reloadingUntil=f.run.time+1.3;f.run.pistol.nextFireAt=f.run.time+.4;const before={...f.run.pistol};f.quota(true);assert.equal(f.select(reward).code,'storage-unavailable');assert.equal(f.run.expedition.selectedPistolVariant,baseId);assert.deepEqual(f.run.pistol,before);f.quota(false);assert(f.select(reward).ok);assert.deepEqual(f.run.pistol,before);assert.equal(selectedPistolProfile(f.run).damage,30);assert.equal(selectedPistolProfile(f.run).reload,1.6);assert(f.select(baseId).ok);assert.deepEqual(f.run.pistol,before);assert.equal(selectedPistolProfile(f.run).damage,25);
});
test('resolved pistol profile changes actual shotdamage/reload duration once,baseline remainsunchanged',()=>{
 const f=fixture({legacy:true});f.restore();through(f,'accept','recover','claim');assert(f.select(reward).ok);const input={time:0,origin:{x:0,z:0},aim:{x:1,z:0},fire:true,targets:[],lineClear:()=>true};const rewardShot=stepPistol({...f.run.pistol,nextFireAt:0,reloadingUntil:0},{...input,profile:selectedPistolProfile(f.run)});assert.equal(rewardShot.events.find(e=>e.type==='shot').damage,30);assert.equal(rewardShot.state.magazine,f.run.pistol.magazine-1);const reload=stepPistol({...rewardShot.state,nextFireAt:0,magazine:0},{time:2,reload:true,profile:selectedPistolProfile(f.run)});assert.equal(reload.state.reloadingUntil,3.6);assert(f.select(baseId).ok);const normal=stepPistol({...f.run.pistol,nextFireAt:0,reloadingUntil:0},{...input,profile:selectedPistolProfile(f.run)});assert.equal(normal.events.find(e=>e.type==='shot').damage,PISTOL_RULES.damage);assert.equal(stepPistol({...normal.state,nextFireAt:0,magazine:0},{time:2,reload:true}).state.reloadingUntil,3.3);
});
test('Retry retains onlynewDTO at every stage while old combat/progressionreset and physicalstasheligibility stay138',()=>{
 for(const stages of[[],['recover'],['accept'],['accept','recover'],['accept','recover','claim']]){const f=fixture({legacy:true});f.restore();through(f,...stages);if(stages.includes('claim'))assert(f.select(reward).ok);f.area('westminster');const expected=structuredClone(f.run.expedition),old=f.run;f.quota(true);assert(!f.persistence.retry());assert.equal(f.run,old);f.quota(false);assert(f.persistence.retry());assert.deepEqual(f.run.expedition,expected);assert.equal(f.run.player.hp,150);assert.equal(f.run.pistol.collected,false);assert.equal(f.run.pistol.magazine,0);assert.equal(f.run.pistol.reserve,0);assert.equal(f.run.progression.proficiency[baseId],0);assert(!f.select(reward).ok);if(stages.includes('claim')){f.run.player.pos={...f.run.pistol.pickupPos};assert(f.persistence.dispatchPistol(f.run,{type:'claimPickup',pickupId:baseId},true).ok);assert.equal(selectedPistolProfile(f.run).damage,30);assert.equal(f.run.expedition.rewardReceipt,data.contract.receiptId);}}
});

test('actual combat applies selected profile and base-family progression multiplier exactly once',()=>{
 for(const[id,damage]of[[reward,30],[baseId,25]]){const f=fixture({legacy:true});f.restore();through(f,'accept','recover','claim');assert(f.select(id).ok);f.area('westminster');
 // A coherent model award supplies the controlled mastery input; no subsequent persistence claim.
 f.run.progression=f.run.progressionModel.award(f.run.progression,[{placementKey:'east-roamer-2',areaId:'east',weaponId:baseId}]).state;const multiplier=f.run.progressionModel.bonuses(f.run.progression,baseId).damageMultiplier;assert(multiplier>1);
 f.run.player.pos={x:0,z:-6};const target=enemy(0,{x:0,z:-3});target.hp=100;f.run.enemies=[target];f.run.wave=1;const hp=target.hp;
 stepGame(f.run,{actions:['fire'],aim:{x:0,z:1}},1/60);assert.equal(f.run.pistol.magazine,3);assert(Math.abs(hp-target.hp-damage*multiplier)<1e-9);assert.equal(f.run.events.find(e=>e.type==='shot').damage,damage);}
});
test('carried state saved in East restores fresh West without claiming or pretending reload was travel',()=>{
 const f=fixture({legacy:true});f.restore();through(f,'accept','recover');assert.equal(f.world.areaId,'east');const resumed=f.reload();resumed.restore();assert.equal(resumed.world.areaId,'westminster');assert.equal(resumed.run.expedition.status,'recovered');assert.equal(resumed.run.expedition.rewardReceipt,null);assert.equal(resumed.run.expedition.selectedPistolVariant,baseId);assert(resumed.writes.every(row=>JSON.parse(row.raw).expedition.status==='recovered'),'visit save does not automatically claim');resumed.at('claim');assert(resumed.command('claim').ok);
});
test('malformed Core commands never mutate contract or write and F3 sees selection-only changes',()=>{
 const f=fixture({legacy:true});f.restore();f.at('accept');const n=f.writes.length;
 for(const command of[{type:'expedition',action:'skip'},{type:'expedition',action:'accept',extra:1},{type:'selectVariant',variantId:reward,extra:1}])assert(!f.persistence.dispatchExpedition(f.run,command,true).ok);
 assert.equal(f.writes.length,n);assert.equal(f.run.expedition.status,'available');through(f,'accept','recover','claim');assert(f.select(reward).ok);const raw=f.records.get(EXPEDITION_SAVE_KEY);assert.equal(JSON.parse(raw).expedition.selectedPistolVariant,reward);assert(f.select(baseId).ok);assert.notEqual(f.records.get(EXPEDITION_SAVE_KEY),raw);const stable=f.writes.length;assert(f.persistence.persistRun(f.run));assert.equal(f.writes.length,stable);
});

test('occupied v5 key rejects every legacy envelope without fallback or rewriting original bytes',()=>{
 const seed=fixture({legacy:true}),old=seed.records.get(PROGRESSION_SAVE_KEY),v3=oldCodec.encodeRun(seed.run),v2=JSON.parse(v3);v2.version=2;v2.supplies={version:1,issued:[],collected:[],pending:[]};
 for(const raw of[old,v3,JSON.stringify(v2),'null']){const f=fixture({records:new Map([[PROGRESSION_SAVE_KEY,old],[EXPEDITION_SAVE_KEY,raw]])});f.restore();assert(f.run.runSaveInvalid);assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);assert.equal(f.records.get(PROGRESSION_SAVE_KEY),old);assert.equal(f.writes.length,0);assert(!f.command('accept').ok);}
});

test('139 Retry cannot erase unreadable successor records; old138 recovery remains unchanged',()=>{
 for(const raw of['{bad','',JSON.stringify({version:9})]){const f=fixture({records:new Map([[EXPEDITION_SAVE_KEY,raw]])});f.restore();const before=f.run;assert(f.run.runSaveInvalid);assert(!f.persistence.retry());assert.equal(f.run,before);assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);assert.equal(f.writes.length,0);assert.match(f.run.message,/Original kept/);}
 const old=fixture({extension:false,records:new Map([[PROGRESSION_SAVE_KEY,'{bad']])});old.restore();assert(old.run.runSaveInvalid);assert(old.persistence.retry(),'pre139 reset contract stays intact');assert(!old.run.runSaveInvalid);
});

test('v6 absent-only migration retains byteexact139v5 and old139codec can still restore its snapshot',()=>{
 const seed=fixture({legacy:true});seed.restore();through(seed,'accept','recover','claim');assert(seed.select(reward).ok);const raw=seed.records.get(EXPEDITION_SAVE_KEY),expected=structuredClone(seed.run.expedition),before={...seed.run.pistol};
 const f=fixture({bosses:true,records:seed.records});f.restore();assert(!f.run.runSaveInvalid);assert.deepEqual(f.run.expedition,expected);assert.equal(f.run.pistol.magazine,before.magazine);assert.equal(f.run.pistol.reserve,before.reserve);assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);assert.equal(JSON.parse(f.records.get(AREA_BOSS_SAVE_KEY)).version,6);assert(f.writes.every(row=>row.key===AREA_BOSS_SAVE_KEY));
 const rollback=fixture({records:new Map([[EXPEDITION_SAVE_KEY,raw]])});rollback.restore();assert(!rollback.run.runSaveInvalid);assert.deepEqual(rollback.run.expedition,expected);assert.equal(rollback.run.pistol.magazine,before.magazine);
 assert(f.persistence.retry());assert.deepEqual(f.run.expedition,expected);assert.equal(f.run.pistol.collected,false);assert.equal(f.run.pistol.magazine,0);assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);
});
test('occupied v6 rejects validoldversions, malformedraw and readfailure without fallback or destructiveRetry',()=>{
 const seed=fixture({legacy:true});seed.restore();const old=seed.records.get(EXPEDITION_SAVE_KEY);
 for(const raw of[old,'{bad','',JSON.stringify({...JSON.parse(old),version:4}),JSON.stringify({...JSON.parse(old),version:7})]){const f=fixture({bosses:true,records:new Map([...seed.records,[AREA_BOSS_SAVE_KEY,raw]])});f.restore();assert(f.run.runSaveInvalid);assert(!f.persistence.retry());assert.equal(f.records.get(AREA_BOSS_SAVE_KEY),raw);assert.equal(f.records.get(EXPEDITION_SAVE_KEY),old);assert.equal(f.writes.length,0);}
 const f=fixture({bosses:true,records:new Map(seed.records)});f.readFailure(true);f.restore();assert(f.run.runSaveInvalid);assert(!f.persistence.retry());assert(!f.records.has(AREA_BOSS_SAVE_KEY));assert.equal(f.records.get(EXPEDITION_SAVE_KEY),old);
});
test('v6 migration quota or corruptpreviousv5 leaves oldraw and grants no new durable state',()=>{
 const seed=fixture({legacy:true});seed.restore();const old=seed.records.get(EXPEDITION_SAVE_KEY);
 const quota=fixture({bosses:true,records:new Map(seed.records)});quota.quota(true);quota.restore();assert(!quota.records.has(AREA_BOSS_SAVE_KEY));assert.equal(quota.records.get(EXPEDITION_SAVE_KEY),old);quota.at('accept');assert.equal(quota.command('accept').code,'storage-unavailable');assert.equal(quota.run.expedition.status,'available');quota.quota(false);assert(quota.command('accept').ok);assert.equal(quota.records.get(EXPEDITION_SAVE_KEY),old);
 for(const raw of['{bad',seed.records.get(PROGRESSION_SAVE_KEY),JSON.stringify({...JSON.parse(old),version:6})]){const f=fixture({bosses:true,records:new Map([...seed.records,[EXPEDITION_SAVE_KEY,raw]])});f.restore();assert(f.run.runSaveInvalid);assert(!f.persistence.retry());assert(!f.records.has(AREA_BOSS_SAVE_KEY));assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);}
 const fresh=fixture({bosses:true});fresh.restore();assert(!fresh.run.runSaveInvalid);assert.equal(JSON.parse(fresh.records.get(AREA_BOSS_SAVE_KEY)).version,6);assert(!fresh.records.has(EXPEDITION_SAVE_KEY));
});

test('absent v6 accepts only139 placement catalogue in previousv5, not future boss awards disguised asv5',()=>{
 const seed=fixture({legacy:true});seed.restore();const f=fixture({bosses:true,extraBossKey:'fixture-new-boss'}),bad=JSON.parse(seed.records.get(EXPEDITION_SAVE_KEY));bad.progression=f.run.progressionModel.award(f.run.progression,[{placementKey:'fixture-new-boss',areaId:'east',weaponId:baseId}]).state;const raw=JSON.stringify(bad);f.records.set(EXPEDITION_SAVE_KEY,raw);f.restore();assert(f.run.runSaveInvalid);assert(!f.persistence.retry());assert.equal(f.records.get(EXPEDITION_SAVE_KEY),raw);assert(!f.records.has(AREA_BOSS_SAVE_KEY));
});

test('preaccept pickup survives original v5/v6 reload; giver recognises owned case and completes contract once',()=>{
 for(const bosses of [false,true]){
  const f=fixture({legacy:true,bosses});f.restore();const key=bosses?AREA_BOSS_SAVE_KEY:EXPEDITION_SAVE_KEY,ammo={...f.run.pistol};
  f.at('recover');const raw=f.records.get(key);f.quota(true);assert.equal(f.command('recover').code,'storage-unavailable');assert.equal(f.run.expedition.status,'available');assert.equal(f.records.get(key),raw);
  f.quota(false);assert(f.command('recover').ok);assert.equal(f.run.expedition.status,'recovered');assert.equal(f.run.expedition.version,1);assert.equal(f.run.expedition.rewardReceipt,null);assert.deepEqual(f.run.pistol,ammo);const n=f.writes.length;assert(!f.command('recover').ok);assert(!f.command('claim').ok);assert.equal(f.writes.length,n);
  const resumed=fixture({records:f.records,bosses});resumed.restore();assert.equal(resumed.run.expedition.status,'recovered');assert.equal(resumed.world.areaId,'westminster');assert.equal(resumed.run.expedition.rewardReceipt,null);resumed.at('claim');
  resumed.quota(true);assert.equal(resumed.command('claim').code,'storage-unavailable');assert.equal(resumed.run.expedition.status,'recovered');resumed.quota(false);assert(resumed.command('claim').ok);assert.equal(resumed.run.expedition.rewardReceipt,data.contract.receiptId);assert.deepEqual(resumed.run.pistol,ammo);assert.equal(resumed.run.expedition.selectedPistolVariant,baseId);const writes=resumed.writes.length;assert.equal(resumed.command('claim').code,'already-collected');assert.equal(resumed.writes.length,writes);
  const again=fixture({records:resumed.records,bosses});again.restore();again.at('claim');assert.equal(again.command('claim').code,'already-collected');
 }
});
test('preaccept pickup requires actual location, proximity, line-of-sight and legal input',()=>{
 const f=fixture({bosses:true});f.restore();assert(!f.command('recover').ok);f.at('recover');f.run.player.pos.x+=1.301;assert(!f.command('recover').ok);f.at('recover');assert(!f.command('recover',false).ok);
 const los=f.world.lineClear;f.world.lineClear=()=>false;assert(!f.command('recover').ok);f.world.lineClear=los;f.run.player.hp=0;assert(!f.command('recover').ok);f.run.player.hp=150;f.run.player.swing={};assert(!f.command('recover').ok);f.run.player.swing=null;assert(f.command('recover').ok);
});
