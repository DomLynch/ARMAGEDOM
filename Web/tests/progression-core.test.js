import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as base from '../src/engine/run-state.js';
import {createCore} from '../src/core/index.js';
import {createRunStorage} from '../src/core/io/local-run-storage.js';
import {createRunOperation} from '../src/core/run-operation.js';
import {createPickupOperation} from '../src/core/pickup-operation.js';
import {createPistolOperation} from '../src/core/pistol-operation.js';
import {createGame} from '../src/combat.js';
import {collectSupply,issueSupply,hasExtendedLoot} from '../src/supplies.js';
import {collectVest,VEST_RULES} from '../src/vest.js';
import {collectPistol,equipPistol,grantPistol} from '../src/pistol.js';
import {collectGearSupply,GEAR_ITEMS} from '../src/supplies.js';
import {grantVest} from '../src/vest.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
import {validateAreaLoot} from '../src/engine/area-loot.js';
import {publicAreaRegistry} from '../src/area-registry.js';
import * as f3 from './fixtures/progression-f3-state.js';
import {createRunStorage as createF3RunStorage} from './fixtures/progression-f3-io.js';
const componentURL=process.env.PROGRESSION_COMPONENT_URL??new URL('../src/engine/progression-core.js',import.meta.url).href;
const {createProgressionComponent,PROGRESSION_SAVE_KEY}=await import(componentURL);
const pistol='westminster-start-pistol-v1',v3='armagedom:area-run:v3';
const content=JSON.parse(readFileSync(new URL('../public/world/area-content.json',import.meta.url)));
const placements={...AREA_MOB_SPAWNS,...content.residents};
const row=()=>({version:1,killScore:20,scoreCap:100,damagePerPoint:.001,hpPerVitality:2,staminaPerEndurance:1,damagePerAttribute:.01,weapons:{knife:{damageAttribute:'strength'},[pistol]:{damageAttribute:'dexterity'}}});
function fixture({records=new Map(),nullInitially=false,data=row(),guard={}}={}){
 const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},lootRules:validateAreaLoot(content.loot,publicAreaRegistry,content.residents),lineClear:()=>true};
 const fresh=cycle=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,animalVariants:true,animalCycle:cycle});let g=null;
 const selected={...base,...guard,get RUN_SAVE_KEY(){return hasExtendedLoot(g?.lootRules)?v3:base.RUN_SAVE_KEY;}};
 const component=createProgressionComponent({baseCodec:selected,getRun:()=>g,data,placements,baseMaxHP:150,baseMaxStamina:100});
 if(!nullInitially)g=fresh('A');
 let quota=false,observer=null;const attempts=[],reads=[];
 const storage={getItem(key){reads.push(key);return records.get(key)??null;},setItem(key,raw){attempts.push({key,raw});observer?.(raw);if(quota)throw Error('quota');records.set(key,raw);}};
 const selectedStorage={getItem(key){const raw=storage.getItem(key);return key===v3&&raw==null?storage.getItem(base.RUN_SAVE_KEY):raw;},setItem:storage.setItem};
 const io=(typeof guard.captureRunState==='function'?createF3RunStorage:createRunStorage)({codec:component.codec,storage:component.storageAdapter(selectedStorage)});
 const pickup=createPickupOperation({getRun:()=>g,collectSupply,collectVest,vestRules:VEST_RULES,vestBagPosition:base.VEST_BAG_POSITION,canCollectGear:()=>true,collectGearSupply,gearItems:GEAR_ITEMS,grantPistol,grantVest});
 const equip=createPistolOperation({getRun:()=>g,collectPistol,equipPistol,canAct:()=>true});
 const domain=createRunOperation({getRun:()=>g,setRun:next=>g=next,createFreshRun:()=>fresh(g.animalCycle==='A'?'B':'A'),applySavedRun:component.applySavedRun,claimPickup:pickup,equip});
 const core=createCore({executeDomain:component.wrapDomain(domain),codec:component.codec,readRun:()=>io.restore(g),writeRun:io.write});
 if(!g)g=fresh('A');
 return {get g(){return g},world,component,core,io,records,attempts,reads,fail:v=>quota=v,observe:fn=>observer=fn,
  dead(key,area='westminster',weaponId='knife',{issue=true}={}){
   world.areaId=area;g.player.weapon=weaponId===pistol?'pistol':'knife';
   if(weaponId===pistol)g.pistol={...g.pistol,collected:true,equipped:true,magazine:4,reserve:2};
   const victim={placementKey:key,areaId:area,hp:0,maxHP:40,pos:{x:0,z:0}};g.corpses.push(victim);
   if(issue)g.supplies=issueSupply(g.supplies,{rules:g.lootRules,placementKey:key,areaId:area,hp:0,position:victim.pos,cycle:g.animalCycle}).state;
   return {placementKey:key,areaId:area,weaponId,damageApplied:40};
  },save:()=>core.dispatch({type:'save'})};
}
test('legacy run2/run3/pistol-only default to neutral attributes and zero scores; lazy before-game key preserves all old bytes',()=>{
 const seed=fixture(),old=JSON.parse(base.encodeRun(seed.g));old.version=2;old.supplies={version:1,issued:[],collected:[],pending:[]};
 for(const [key,raw]of [[base.RUN_SAVE_KEY,JSON.stringify(old)],[v3,base.encodeRun(seed.g)],[base.PISTOL_SAVE_KEY,base.encodePistol(seed.g.pistol)]]){
  const f=fixture({nullInitially:true,records:new Map([[key,raw]])});assert(f.core.dispatch({type:'restore'}).ok);assert.deepEqual(f.g.progression.attributes,{vitality:10,strength:10,dexterity:10,endurance:10,intelligence:10});assert.deepEqual(f.g.progression.proficiency,{knife:0,[pistol]:0});assert.equal(f.g.player.maxHP,150);assert.equal(f.g.player.maxStamina,100);assert(f.save().ok);assert.equal(f.records.get(key),raw);assert.equal(JSON.parse(f.records.get(PROGRESSION_SAVE_KEY)).version,4);
 }
});
test('closed DTO rejects bad attributes/scores/IDs, forged totals, duplicate victims and policy drift without defaults',()=>{
 const f=fixture(),model=f.component.model;
 for(const change of [s=>s.attributes.vitality=21,s=>s.attributes.intelligence=9,s=>s.attributes.endurance=10.5,s=>s.proficiency.knife=20,s=>s.proficiency[pistol]=101,s=>s.extra=1,s=>s.rulesStamp+='x',s=>s.awards=[{placementKey:'unknown',areaId:'east',weaponId:'knife'}],s=>{s.awards=[{placementKey:undefined,areaId:undefined,weaponId:'knife'}];s.proficiency.knife=20;}]){const state=model.freshState();change(state);assert.equal(model.valid(state),false);}
 assert(f.save().ok);const packet=f.dead('westminster-roamer-2');assert(f.component.recordDeath(f.g,packet));assert(f.save().ok);
 const s=structuredClone(f.g.progression);s.awards.push({...s.awards[0]});assert.equal(model.valid(s),false);s.awards.pop();s.awards[0].areaId='east';assert.equal(model.valid(s),false);
 f.g.progression.proficiency.knife=40;assert.equal(f.save().code,'invalid-save');
 assert.equal(f.core.dispatch({type:'award',placementKey:'westminster-roamer-4',amount:20}).code,'invalid-command');
});
test('internal intent requires current registered dead victim, positive applied damage and actual supported weapon',()=>{
 const f=fixture(),packet=f.dead('westminster-roamer-2');
 for(const p of [{...packet,damageApplied:0},{...packet,damageApplied:41},{...packet,areaId:'east'},{...packet,placementKey:'unknown'},{...packet,weaponId:'pistol'},{...packet,extra:true}])assert.equal(f.component.recordDeath(f.g,p),false);
 f.g.corpses[0].hp=1;assert.equal(f.component.recordDeath(f.g,packet),false);f.g.corpses[0].hp=0;
 assert.equal(f.component.recordDeath({...f.g},packet),false);assert(f.component.recordDeath(f.g,packet));assert.equal(f.component.recordDeath(f.g,packet),false);
 assert.equal(f.g.progression,undefined);
});
test('pickup writer reconciles death+loot+score atomically BEFORE grant; quota retries same candidate and never emits free XP',()=>{
 const f=fixture();assert(f.save().ok);const raw=f.records.get(PROGRESSION_SAVE_KEY);const packet=f.dead('east-roamer-2','east');assert(f.component.recordDeath(f.g,packet));f.g.player.pos={x:0,z:0};f.fail(true);
 const command={type:'claimPickup',pickupId:'area-supply-v2:east-roamer-2'};
 for(let i=0;i<2;i++){assert.deepEqual(f.core.dispatch(command),{ok:false,code:'storage-unavailable',events:[]});assert.equal(f.records.get(PROGRESSION_SAVE_KEY),raw);assert.equal(f.g.progression.proficiency.knife,0);assert.equal(f.g.progression.awards.length,0);assert.equal(f.g.vest.equipped,false);assert.equal(f.g.supplies.pending.length,1);}
 assert.equal(f.attempts.at(-1).raw,f.attempts.at(-2).raw);
 f.fail(false);f.observe(saved=>{const dto=JSON.parse(saved);assert.equal(f.g.progression.proficiency.knife,0);assert.equal(f.g.vest.equipped,false);assert.equal(dto.progression.proficiency.knife,20);assert.equal(dto.vest.equipped,true);assert.deepEqual(dto.supplies.issued,['east-roamer-2']);assert.deepEqual(dto.supplies.collected,[command.pickupId]);});
 const result=f.core.dispatch(command);assert(result.ok&&result.changed);assert.equal(f.g.progression.proficiency.knife,20);assert.equal(f.g.vest.equipped,true);assert(result.events.some(e=>e.type==='proficiency-gain'&&e.amount===20));assert(!Object.isFrozen(f.g.player));f.observe(null);
 const n=f.attempts.length;assert.equal(f.core.dispatch(command).code,'already-collected');assert.equal(f.component.recordDeath(f.g,packet),false);assert.equal(f.attempts.length,n);
});
test('equip writer and regular save also reconcile pending awards; no arbitrary new command or IO owner',()=>{
 const f=fixture();assert(f.save().ok);const packet=f.dead('east-roamer-1','east',pistol);assert(f.component.recordDeath(f.g,packet));
 const out=f.core.dispatch({type:'equip',itemId:pistol,equipped:false});assert(out.ok);assert.equal(f.g.pistol.equipped,false);assert.equal(JSON.parse(f.records.get(PROGRESSION_SAVE_KEY)).progression.proficiency[pistol],20);
 const knife=f.dead('westminster-roamer-2');assert(f.component.recordDeath(f.g,knife));const saved=f.save();assert(saved.ok&&saved.changed);assert.equal(f.g.progression.proficiency.knife,20);assert(saved.events.some(e=>e.type==='proficiency-gain'));
});
test('one victim cannot award both weapons; independent distinct kills reach20/40/60/80/100 caps and ledger still records capped deaths',()=>{
 const f=fixture();assert(f.save().ok);
 for(const [weapon,area,keys]of [['knife','westminster',Array.from({length:6},(_,i)=>'westminster-roamer-'+(i+1))],[pistol,'east',Array.from({length:6},(_,i)=>'east-roamer-'+(i+1))]]){
  for(let i=0;i<keys.length;i++){const packet=f.dead(keys[i],area,weapon);assert(f.component.recordDeath(f.g,packet));assert(f.save().ok);assert.equal(f.g.progression.proficiency[weapon],[20,40,60,80,100,100][i]);assert.equal(f.component.recordDeath(f.g,{...packet,weaponId:weapon==='knife'?pistol:'knife'}),false);}
 }
 assert.equal(f.g.progression.awards.length,12);assert.equal(f.component.model.bonuses(f.g.progression,'knife').damageMultiplier,1.1);
 const attributes={...f.g.progression.attributes,strength:20};assert(Math.abs(f.component.model.bonuses({...f.g.progression,attributes},'knife').damageMultiplier-1.21)<1e-12);
});
test('an eligible intent cannot durably outrun its declared loot/drone death tombstone',()=>{
 const f=fixture();assert(f.save().ok);const packet=f.dead('westminster-roamer-2','westminster','knife',{issue:false});assert(f.component.recordDeath(f.g,packet));const raw=f.records.get(PROGRESSION_SAVE_KEY);
 assert.equal(f.save().code,'invalid-save');assert.equal(f.records.get(PROGRESSION_SAVE_KEY),raw);assert.equal(f.g.progression.proficiency.knife,0);
 f.g.supplies=issueSupply(f.g.supplies,{rules:f.g.lootRules,placementKey:packet.placementKey,areaId:packet.areaId,hp:0,position:{x:0,z:0}}).state;
 assert(f.save().ok);assert.equal(f.g.progression.proficiency.knife,20);
});
test('pending intent crosses an area switch, reload restores score+ledger and nonloot deaths filter without reaward',()=>{
 const f=fixture();assert(f.save().ok);const packet=f.dead('east-roamer-1','east');assert(f.component.recordDeath(f.g,packet));f.world.areaId='westminster';assert(f.save().ok);
 const records=new Map(f.records),r=fixture({records});assert(r.core.dispatch({type:'restore'}).ok);assert.equal(r.g.progression.proficiency.knife,20);assert.deepEqual(r.component.model.deadPlacements(r.g.progression,'east'),['east-roamer-1']);
 r.world.areaId='east';r.g.enemies=[{placementKey:'east-roamer-1',hp:40},{placementKey:'east-roamer-3',hp:40}];const dto=r.component.codec.restoreRun(r.g,records.get(PROGRESSION_SAVE_KEY),null);r.component.applySavedRun(r.g,dto);assert.deepEqual(r.g.enemies.map(e=>e.placementKey),['east-roamer-3']);
 r.g.corpses.push({placementKey:'east-roamer-1',areaId:'east',hp:0,maxHP:40});assert.equal(r.component.recordDeath(r.g,packet),false);
});
test('failed fresh Retry retains pending earned intent; successful Retry resets run/defaults and rejects stale intent',()=>{
 const f=fixture();assert(f.save().ok);const packet=f.dead('westminster-roamer-2');assert(f.component.recordDeath(f.g,packet));f.fail(true);const previous=f.g,raw=f.records.get(PROGRESSION_SAVE_KEY);
 assert.equal(f.core.dispatch({type:'retry'}).ok,false);assert.equal(f.g,previous);assert.equal(f.records.get(PROGRESSION_SAVE_KEY),raw);
 f.fail(false);assert(f.save().ok);assert.equal(f.g.progression.proficiency.knife,20);const second=f.dead('westminster-roamer-4');assert(f.component.recordDeath(f.g,second));assert(f.core.dispatch({type:'retry'}).ok);
 assert.notEqual(f.g,previous);assert.equal(f.g.animalCycle,'B');assert.deepEqual(f.g.progression.proficiency,{knife:0,[pistol]:0});assert.equal(f.g.progression.awards.length,0);assert.deepEqual(f.g.progression.attributes,{vitality:10,strength:10,dexterity:10,endurance:10,intelligence:10});assert.equal(f.component.recordDeath(previous,second),false);assert(f.save().ok);assert.equal(f.g.progression.awards.length,0);
});
test('corrupt present v4 never falls back to valid v3; explicit successful restore discards uncommitted intent',()=>{
 const f=fixture();const old=base.encodeRun(f.g);f.records.set(v3,old);f.records.set(PROGRESSION_SAVE_KEY,'{bad');assert.equal(f.core.dispatch({type:'restore'}).ok,false);assert.equal(f.records.get(v3),old);assert.deepEqual(f.reads,[PROGRESSION_SAVE_KEY]);assert.equal(f.save().ok,false);assert(f.core.dispatch({type:'retry'}).ok);
 const packet=f.dead('westminster-roamer-2');assert(f.component.recordDeath(f.g,packet));assert(f.core.dispatch({type:'restore'}).ok);assert(f.save().ok);assert.equal(f.g.progression.proficiency.knife,0);
});
test('v4 validates saved attribute-derived HP caps and applies neutral legacy defaults without double bonuses',()=>{
 const f=fixture();f.g.progression=f.component.model.freshState();f.g.progression.attributes.vitality=20;f.g.progression.attributes.endurance=20;f.g.player.maxHP=170;f.g.player.hp=160;assert(f.save().ok);
 const r=fixture({records:new Map(f.records)});assert(r.core.dispatch({type:'restore'}).ok);assert.equal(r.g.player.hp,160);assert.equal(r.g.player.maxHP,170);assert.equal(r.g.player.maxStamina,110);const bad=JSON.parse(f.records.get(PROGRESSION_SAVE_KEY));bad.hp=171;assert.equal(r.component.codec.restoreRun(r.g,JSON.stringify(bad),null),null);
});

test('v4 extends F3 equality: unchanged save skips codec work but progression-only change cannot hit base cache',()=>{
 let encoded=0,validated=0;const guards={...f3,encodeRun(g){encoded++;return base.encodeRun(g);},restoreRun(...a){validated++;return base.restoreRun(...a);}};
 const f=fixture({guard:guards});assert(f.save().ok);const before={encoded,validated};for(let i=0;i<60;i++)assert(f.save().ok);assert.deepEqual({encoded,validated},before);
 const packet=f.dead('east-roamer-1','east');assert(f.component.recordDeath(f.g,packet));assert(f.save().ok);assert.equal(f.g.progression.proficiency.knife,20);assert.equal(JSON.parse(f.records.get(PROGRESSION_SAVE_KEY)).progression.proficiency.knife,20);assert(encoded>before.encoded&&validated>before.validated);
 const next={encoded,validated};assert(f.save().ok);assert.deepEqual({encoded,validated},next);
});
test('saved v4 unknown schema/extra fields and changed progression policy reject without legacy fallback',()=>{
 const f=fixture();assert(f.save().ok);const raw=f.records.get(PROGRESSION_SAVE_KEY),saved=JSON.parse(raw);
 for(const change of [s=>s.version=5,s=>s.extra=1,s=>s.progression=null,s=>s.progression.awards.push({placementKey:'east-roamer-1',areaId:'east',weaponId:'knife'}),s=>s.progression.proficiency.knife=.5]){const bad=structuredClone(saved);change(bad);assert.equal(f.component.codec.restoreRun(f.g,JSON.stringify(bad),null),null);}
 const altered=row();altered.damagePerPoint=.0005;const other=fixture({data:altered});assert.equal(other.component.codec.restoreRun(other.g,raw,null),null);
});
