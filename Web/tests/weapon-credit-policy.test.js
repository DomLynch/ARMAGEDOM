import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {createProgressionModel}=await import(process.env.CREDIT_MODEL_URL??new URL('../src/engine/progression-state.js',import.meta.url).href);
import {WEAPON_CREDIT_DESCRIPTORS,deathWeaponDescriptor} from '../src/engine/weapon-credit-policy.js';
const pistol='westminster-start-pistol-v1',flame='flamethrower-area8-v1';
const data=JSON.parse(readFileSync(new URL('../public/world/area-content.json',import.meta.url))).progression;
const placements={east:Array.from({length:8},(_,i)=>({key:'east-roamer-'+(i+1)})),westminster:[{key:'westminster-roamer-1'}]},model=createProgressionModel({data,placements});
const row=(weaponId=flame,placementKey='east-roamer-2',areaId='east')=>({placementKey,areaId,weaponId});
test('only exact registered descriptors resolve; policies and descriptors are immutable',()=>{
 assert.deepEqual(deathWeaponDescriptor(flame),{id:flame,creditPolicy:'none'});assert.equal(deathWeaponDescriptor('knife').creditPolicy,'mastery');assert.equal(deathWeaponDescriptor(pistol).creditPolicy,'mastery');
 assert.deepEqual(Object.keys(WEAPON_CREDIT_DESCRIPTORS),['borough-marshals-pistol-v1','watchmans-pistol-v1','borough-butchers-rocket-launcher-v1','south-stalker-shotgun-v1','standard-grenade-v1','bridge-warden-rifle-v1','knife',pistol,flame]);assert(Object.isFrozen(WEAPON_CREDIT_DESCRIPTORS));for(const d of Object.values(WEAPON_CREDIT_DESCRIPTORS))assert(Object.isFrozen(d));
 for(const id of['unknown','flamethrower','__proto__','constructor',null,{},1])assert.equal(deathWeaponDescriptor(id),null);
});
test('registered flame appends one durable-shaped death row, zero XP events and no new family',()=>{
 const before=model.freshState(),result=model.award(before,[row()]);assert.equal(result.state.awards.length,1);assert.deepEqual(result.state.awards,[row()]);assert.deepEqual(result.events,[]);assert.deepEqual(result.state.proficiency,{knife:0,[pistol]:0});assert.equal(model.valid(result.state),true);assert.deepEqual(model.deadPlacements(result.state,'east'),['east-roamer-2']);assert.equal(before.awards.length,0);
 assert.equal(model.sameState(result.state,before),false);assert.throws(()=>model.bonuses(result.state,flame),TypeError);
});
test('duplicates across any known weapon cannot add another death row or mastery',()=>{
 const first=model.award(model.freshState(),[row(),row()]);assert.equal(first.state.awards.length,1);
 for(const weaponId of[flame,'knife',pistol]){const next=model.award(first.state,[row(weaponId)]);assert.deepEqual(next.state,first.state);assert.deepEqual(next.events,[]);}
 const knife=model.award(model.freshState(),[row('knife')]);assert.equal(knife.state.proficiency.knife,20);assert.deepEqual(model.award(knife.state,[row()]).state,knife.state);
});
test('unknown attribution, foreign source and spoofed flame mastery all fail closed',()=>{
 const fresh=model.freshState();for(const packet of[row('unknown'),row(flame,'east-roamer-2','westminster'),row(flame,'not-registered')])assert.throws(()=>model.award(fresh,[packet]),TypeError);
 const state=model.award(fresh,[row()]).state;
 assert.equal(model.valid({...state,awards:[row('unknown')]}),false);assert.equal(model.valid({...state,proficiency:{...state.proficiency,[flame]:20}}),false);assert.equal(model.valid({...state,proficiency:{...state.proficiency,knife:20}}),false);assert.equal(model.valid({...state,awards:[row(),row()]}),false);
 assert.throws(()=>model.award(state,[row('unknown')]),TypeError);assert.equal(fresh.awards.length,0);
});
test('knife and pistol preserve original score, event, bonuses and historical rules stamp',()=>{
 const fresh=model.freshState();assert.equal(fresh.rulesStamp,'[1,20,100,0.001,2,1,0.01,["knife","strength"],["westminster-start-pistol-v1","dexterity"]]');
 for(const id of['knife',pistol]){const result=model.award(fresh,[row(id)]);assert.equal(result.state.proficiency[id],20);assert.deepEqual(result.events,[{type:'proficiency-gain',...row(id),score:20,amount:20}]);assert.equal(model.bonuses(result.state,id).damageMultiplier,1.02);assert.equal(model.maxHP(result.state),150);assert.equal(model.maxStamina(result.state),100);assert(model.valid(JSON.parse(JSON.stringify(result.state))));}
});
test('mixed known deaths recompute only mastery credits and retain the original cap',()=>{
 const rows=[row(flame,'east-roamer-1'),...Array.from({length:6},(_,i)=>row('knife','east-roamer-'+(i+2))),row(pistol,'westminster-roamer-1','westminster')];
 const result=model.award(model.freshState(),rows);assert.equal(result.state.awards.length,8);assert.equal(result.state.proficiency.knife,100);assert.equal(result.state.proficiency[pistol],20);assert.equal(result.events.length,6);assert.equal(model.valid(result.state),true);assert.equal(result.events.some(e=>e.weaponId===flame),false);
});
test('historical knife/pistol-only state stays valid; flame row support does not prove legacy v7 admission',()=>{
 const historical=model.award(model.freshState(),[row('knife'),row(pistol,'east-roamer-3')]).state;assert(model.valid(JSON.parse(JSON.stringify(historical))));
 const next=model.award(historical,[row(flame,'east-roamer-4')]).state;assert.deepEqual(next.proficiency,historical.proficiency);assert.equal(next.awards.length,historical.awards.length+1);assert.equal(model.valid(next),true);
 // Outer legacy-v7 decoder MUST explicitly reject new flame attribution rows.
 // This generic model has no read-origin/save-version authority and accepts them.
});
