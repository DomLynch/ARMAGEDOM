import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createGame,stepGame,receiveHit} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';import {travelTo} from '../src/travel.js';
import {encodeRun,restoreRun,applySavedRun,collectNearbySupplies,RUN_SAVE_KEY,encodePistol} from '../src/pistol-save.js';
const world=()=>({areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id,entry){this.areaId=id;return entry;}});
const game=()=>createGame(world(),{pilot:'donor-knife',pistol:true,supplies:true,areaResidents:true,openingGroup:false,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
const tick=(g,i={})=>stepGame(g,i);
function killResident(g,key='westminster-roamer-3'){
 if(!g.pistol.collected)tick(g,{actions:['pickup']});const e=g.enemies.find(e=>e.placementKey===key);for(const e of g.enemies)e.staggerUntil=1000;g.player.pos={x:e.pos.x,z:e.pos.z-5};
 for(let n=0;n<2;n++){while(g.time+1e-8<g.pistol.nextFireAt)tick(g);tick(g,{actions:['fire'],aim:{x:0,z:1}});}
 assert.equal(e.hp,0);assert.ok(g.events.some(v=>v.type==='death'&&v.actor===e));return e;
}
test('actual accepted pistol death issues one supply, native walk-near collection saves before resource gain and reload uses it',()=>{
 const g=game(),e=killResident(g);assert.equal(g.supplies.issued.length,1);assert.equal(g.supplies.pending[0].remaining,2);assert.deepEqual(g.supplies.pending[0].position,e.pos);g.pistol.reserve=0;g.player.pos={...e.pos};let saved;
 collectNearbySupplies(g,next=>{assert.equal(g.pistol.reserve,0);assert.equal(g.supplies.pending.length,1);saved=encodeRun(next);return true;});assert.equal(g.pistol.reserve,2);assert.equal(g.pistol.magazine,4);assert.equal(g.supplies.pending.length,0);assert.equal(g.supplies.collected.length,1);assert.ok(g.events.some(e=>e.type==='supply-pickup'&&e.amount===2));collectNearbySupplies(g,()=>assert.fail('repeated collection'));
 const restored=game();applySavedRun(restored,restoreRun(restored,saved));assert.equal(restored.enemies.length,5);assert.ok(!restored.enemies.some(v=>v.placementKey===e.placementKey));assert.equal(restored.pistol.reserve,2);
 while(g.time<g.pistol.nextFireAt)tick(g);tick(g,{actions:['stab']});while(g.pistol.reloadingUntil)tick(g);assert.equal(g.pistol.magazine,6);assert.equal(g.pistol.reserve,0);
});
test('full reserve leaves the item, partial collection keeps one round, failed write cannot award or consume it',()=>{
 const g=game(),e=killResident(g);g.player.pos={...e.pos};let calls=0;collectNearbySupplies(g,()=>{calls++;return true;});assert.equal(calls,0);assert.equal(g.supplies.pending[0].remaining,2);assert.equal(g.pistol.reserve,12);
 g.pistol.reserve=11;const before=encodeRun(g);collectNearbySupplies(g,()=>false);assert.equal(encodeRun(g),before);collectNearbySupplies(g,()=>true);assert.equal(g.pistol.reserve,12);assert.equal(g.supplies.pending[0].remaining,1);assert.equal(g.supplies.collected.length,0);
 g.pistol.reserve=10;collectNearbySupplies(g,()=>true);assert.equal(g.pistol.reserve,11);assert.equal(g.supplies.pending.length,0);
});
test('actual dressing death heals only missing health with atomic denial at full HP or write failure',()=>{
 const g=game(),e=killResident(g,'westminster-roamer-5');g.player.pos={...e.pos};collectNearbySupplies(g,()=>assert.fail('full HP cannot write'));assert.equal(g.supplies.pending[0].kind,'dressing');
 receiveHit(g,{amount:30,origin:{x:g.player.pos.x+1,z:g.player.pos.z},block:false,parry:false});assert.equal(g.player.hp,120);const before=encodeRun(g);collectNearbySupplies(g,()=>false);assert.equal(encodeRun(g),before);let raw;collectNearbySupplies(g,next=>{assert.equal(g.player.hp,120);raw=encodeRun(next);return true;});assert.equal(g.player.hp,150);assert.equal(JSON.parse(raw).hp,150);assert.equal(g.supplies.collected.length,1);
});
test('pending/collected rewards and killed empty residents survive JSON restore and area return without reissuing',async()=>{
 const g=game(),e=killResident(g,'westminster-roamer-4');assert.equal(g.supplies.pending.length,0);assert.deepEqual(g.supplies.issued,['westminster-roamer-4']);const raw=encodeRun(g),fresh=game();applySavedRun(fresh,restoreRun(fresh,raw));assert.equal(fresh.enemies.length,5);assert.ok(!fresh.enemies.some(v=>v.placementKey===e.placementKey));
 await travelTo(fresh,{areaId:'east',entryPoint:{x:0,z:0}});assert.equal(fresh.enemies.length,9);await travelTo(fresh,{areaId:'westminster',entryPoint:{x:0,z:-6}});assert.equal(fresh.enemies.length,5);assert.deepEqual(fresh.supplies.issued,['westminster-roamer-4']);
 const retry=game(),saved=restoreRun(retry,encodeRun(retry));assert.equal(saved.pistol.collected,false);assert.deepEqual(saved.supplies,{version:1,issued:[],collected:[],pending:[]});assert.equal(saved.hp,150);assert.equal(retry.enemies.length,6);
});
test('all six tombstones restore cleared area without creating residents on later ticks or returning',async()=>{
 const g=game();g.supplies.issued=g.enemies.map(e=>e.placementKey);g.supplies.pending=g.enemies.filter(e=>[1,3,5].some(n=>e.placementKey.endsWith('-'+n))).map(e=>({id:'area1-supply-v1:'+e.placementKey,placementKey:e.placementKey,areaId:'westminster',position:{...e.pos},kind:e.placementKey.endsWith('-5')?'dressing':'rounds',remaining:e.placementKey.endsWith('-1')?3:e.placementKey.endsWith('-3')?2:1}));const f=game();applySavedRun(f,restoreRun(f,encodeRun(g)));assert.equal(f.enemies.length,0);assert.equal(f.encounterCleared,true);assert.equal(f.encounterActive,false);for(let i=0;i<180;i++)tick(f,{move:{x:.1,z:0}});assert.equal(f.enemies.length,0);await travelTo(f,{areaId:'east',entryPoint:{x:0,z:0}});await travelTo(f,{areaId:'westminster',entryPoint:{x:0,z:-6}});assert.equal(f.enemies.length,0);assert.equal(f.encounterCleared,true);
});
test('successor validates whole resource/ledger record and never migrates legacy over corrupt data',()=>{
 const g=game();tick(g,{actions:['pickup']});g.pistol.magazine=2;g.pistol.reserve=4;g.player.hp=80;const legacy=encodePistol(g.pistol),migrated=restoreRun(g,null,legacy);assert.equal(migrated.pistol.magazine,2);assert.equal(migrated.pistol.reserve,4);assert.equal(migrated.hp,80);assert.deepEqual(migrated.supplies.issued,[]);
 const good=JSON.parse(encodeRun(g));for(const bad of ['{','null',JSON.stringify({...good,pistol:undefined}),JSON.stringify({...good,hp:151}),JSON.stringify({...good,hp:-1}),JSON.stringify({...good,supplies:{...good.supplies,issued:['unknown']}}),JSON.stringify({...good,pistol:null})])assert.equal(restoreRun(g,bad,legacy),null);
});
test('actual sole main writer retries a failed identical write, never sets stale cache or writes legacy key',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),fn=source.slice(source.indexOf('function persistRun(g)'),source.indexOf('function restoreSavedRun'));let fail=true;const writes=[];const storage={setItem(key,raw){assert.equal(key,RUN_SAVE_KEY);if(fail)throw Error('quota');writes.push(raw);}};
 const save=new Function('localStorage','encodeRun','RUN_SAVE_KEY',`let runSaveCache=null;${fn};return persistRun;`)(storage,encodeRun,RUN_SAVE_KEY),g=game();assert.equal(save(g),false);fail=false;assert.equal(save(g),true);assert.equal(writes.length,1);assert.equal(save(g),true);assert.equal(writes.length,1);
});
