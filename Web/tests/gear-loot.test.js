import test from 'node:test';import assert from 'node:assert/strict';
import {validateAreaLoot} from '../src/engine/area-loot.js';import {publicAreaRegistry} from '../src/area-registry.js';import {createGame,initializeAreaResidents} from '../src/combat.js';import {createRunPersistence} from '../src/engine/run-core.js';import {issueSupply,collectedGearSource} from '../src/supplies.js';import {encodeRun,restoreRun,RUN_SAVE_KEY} from '../src/engine/run-state.js';import {vestAvailable} from '../src/vest.js';
const pistol='westminster-start-pistol-v1',vest='westminster-worn-vest-v1',v3='armagedom:area-run:v3';
function rules(){return validateAreaLoot({version:1,tables:{pistol:{outcomes:[{itemId:pistol,quantity:1,weight:1,conditions:['pistol-unowned']}]},vest:{outcomes:[{itemId:vest,quantity:1,weight:1,conditions:['vest-not-equipped']}]}},placements:{east:{'east-roamer-1':'pistol','east-roamer-2':'vest','east-roamer-3':'pistol'}}},publicAreaRegistry);}
function fixture({nullInitially=false,records=new Map()}={}){
 const world={areaId:'east',spawn:{x:0,z:0},layout:{characterScale:1.265},lootRules:rules(),lineClear:()=>true,move:(p,d)=>({x:p.x+d.x,z:p.z+d.z})};
 const fresh=()=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true});let g=nullInitially?null:fresh(),quota=false,writes=0;
 const storage={getItem:key=>records.get(key)??null,setItem(key,raw){if(quota)throw Error('quota');records.set(key,raw);writes++;}};
 const persistence=createRunPersistence({getRun:()=>g,setRun:next=>g=next,createFreshRun:fresh,storage});if(!g)g=fresh();
 return{world,records,persistence,get g(){return g},get writes(){return writes},quota(value){quota=value},issue(key,position={x:0,z:0}){g.supplies=issueSupply(g.supplies,{areaId:'east',placementKey:key,position,hp:0,rules:g.lootRules}).state;}};
}
test('existing gear quantity/conditions are closed; no NPC weapon aliases or changed West outcomes',()=>{
 assert.equal(rules()['east-roamer-1'].outcomes[0].itemId,pistol);assert.equal(rules()['westminster-roamer-1'].outcomes[0].quantity,3);
 for(const itemId of ['knife','teeth','bolt','arbitrary-vest'])assert.throws(()=>validateAreaLoot({version:1,tables:{gear:{outcomes:[{itemId,quantity:1,weight:1,conditions:[]}]}},placements:{}},publicAreaRegistry));
});
test('actual Core/IO quota leaves gear and ledger untouched; retry grants once, duplicate owned drop stays pending',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);f.issue('east-roamer-1');assert(f.persistence.persistRun(f.g));const before=encodeRun(f.g),raw=f.records.get(v3);f.quota(true);f.persistence.collectNearbySupplies(f.g,{});assert.equal(encodeRun(f.g),before);assert.equal(f.records.get(v3),raw);assert.equal(f.g.events.length,0);
 f.quota(false);f.persistence.collectNearbySupplies(f.g,{});assert.equal(f.g.pistol.collected,true);assert.equal(f.g.player.weapon,'pistol');assert.equal(f.g.pistol.magazine,6);assert.equal(f.g.pistol.reserve,12);assert.equal(f.g.supplies.pending.length,0);const writes=f.writes;f.persistence.collectNearbySupplies(f.g,{});assert.equal(f.writes,writes);
 f.g.pistol.magazine=2;f.g.pistol.reserve=1;f.issue('east-roamer-3');const events=f.g.events.length;f.persistence.collectNearbySupplies(f.g,{});assert.equal(f.g.pistol.magazine,2);assert.equal(f.g.pistol.reserve,1);assert.equal(f.g.supplies.pending.length,1);assert.equal(f.g.events.length,events);
});
test('foreign collected vest outcome restores equipment without unlocking original West bag; pending/tampered stamp rejected',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);f.issue('east-roamer-2');assert.equal(vestAvailable(f.g.vest,f.g.supplies,f.g.lootRules),false);f.persistence.collectNearbySupplies(f.g,{});assert.equal(f.g.vest.equipped,true);assert(collectedGearSource(f.g.supplies,f.g.lootRules,vest));assert.equal(vestAvailable({...f.g.vest,equipped:false},f.g.supplies,f.g.lootRules),false);
 const raw=f.records.get(v3),saved=restoreRun(f.g,raw,null);assert(saved?.vest.equipped);assert.equal(f.g.events.at(-1).actor,f.g.player);assert(!Object.isFrozen(f.g.player));
 const bad=JSON.parse(raw);bad.supplies.rolls[0].tableStamp+='x';assert.equal(restoreRun(f.g,JSON.stringify(bad),null),null);
 const pending=fixture();pending.issue('east-roamer-2');pending.g.vest.equipped=true;assert.equal(restoreRun(pending.g,encodeRun(pending.g),null),null);
});
test('real area/radius/LOS and same-tick cancel/dodge/hurt/swing/death deny gear without consuming it',()=>{
 for(const block of [f=>f.world.areaId='south',f=>f.g.player.pos.x=2,f=>f.world.lineClear=()=>false,f=>f.g.player.hurtUntil=1,f=>f.g.player.swing={},f=>f.g.player.hp=0]){const f=fixture();f.issue('east-roamer-1');block(f);const before=encodeRun(f.g);f.persistence.collectNearbySupplies(f.g,{});assert.equal(encodeRun(f.g),before);assert.equal(f.g.pistol.collected,false);}
 for(const intent of [{cancel:true},{dodge:true}]){const f=fixture();f.issue('east-roamer-1');f.persistence.collectNearbySupplies(f.g,intent);assert.equal(f.g.pistol.collected,false);assert.equal(f.g.supplies.pending.length,1);}
});
test('browser-created-before-game context uses separate v3 key; migrates old run2 without altering old-reader bytes',()=>{
 const legacy=fixture();legacy.g.supplies={version:1,issued:[],collected:[],pending:[]};const old=JSON.parse(encodeRun(legacy.g));old.version=2;const raw=JSON.stringify(old),records=new Map([[RUN_SAVE_KEY,raw]]);const f=fixture({nullInitially:true,records});f.persistence.restoreSavedRun(f.g);assert.equal(records.get(RUN_SAVE_KEY),raw);assert.equal(JSON.parse(records.get(v3)).version,3);f.issue('east-roamer-2');f.persistence.collectNearbySupplies(f.g,{});assert.equal(records.get(RUN_SAVE_KEY),raw);
 records.set(v3,'{corrupt');const bad=fixture({records});bad.persistence.restoreSavedRun(bad.g);assert.equal(bad.g.runSaveInvalid,true);assert.equal(records.get(v3),'{corrupt');assert.equal(records.get(RUN_SAVE_KEY),raw);assert(bad.persistence.retry());assert.equal(records.get(RUN_SAVE_KEY),raw);
});

test('collected gear and equipment must agree; legitimately holstered collected pistol remains valid',()=>{
 const f=fixture();f.persistence.restoreSavedRun(f.g);f.issue('east-roamer-1');f.persistence.collectNearbySupplies(f.g,{});f.g.pistol.equipped=false;f.g.player.weapon='knife';assert(restoreRun(f.g,encodeRun(f.g),null));
 const missing=JSON.parse(encodeRun(f.g));missing.pistol.collected=false;missing.pistol.magazine=0;missing.pistol.reserve=0;assert.equal(restoreRun(f.g,JSON.stringify(missing),null),null);
 f.issue('east-roamer-2');f.persistence.collectNearbySupplies(f.g,{});const unequipped=JSON.parse(encodeRun(f.g));unequipped.vest.equipped=false;assert.equal(restoreRun(f.g,JSON.stringify(unequipped),null),null);
});

test('extended resident initialization respects issued deaths only in the actual area and retains unissued residents',()=>{
 const f=fixture();f.issue('east-roamer-1');f.issue('east-roamer-2');
 const g=createGame(f.world,{pilot:'donor-knife',encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}},pistol:true,supplies:true,vest:true,areaResidents:true,openingGroup:false});
 g.supplies=f.g.supplies;g.enemies=[];g.areaInitialized=false;initializeAreaResidents(g);assert(!g.enemies.some(e=>['east-roamer-1','east-roamer-2'].includes(e.placementKey)));assert(g.enemies.some(e=>e.placementKey==='east-roamer-3'));
 f.world.areaId='south';g.enemies=[];g.areaInitialized=false;initializeAreaResidents(g);assert(g.enemies.length>0);assert(g.enemies.every(e=>e.placementKey.startsWith('south-')));
});
