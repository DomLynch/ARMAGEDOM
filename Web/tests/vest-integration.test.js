import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createGame,stepGame,receiveHit} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';import {travelTo} from '../src/travel.js';
import {encodeRun,restoreRun,applySavedRun,collectNearbySupplies,collectNearbyVest,VEST_BAG_POSITION,RUN_SAVE_KEY,encodePistol} from '../src/pistol-save.js';
const world=()=>({areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id,entry){this.areaId=id;return entry;}});
const game=()=>createGame(world(),{pilot:'donor-knife',pistol:true,supplies:true,vest:true,areaResidents:true,openingGroup:false,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
const tick=(g,i={})=>stepGame(g,i);
function killResident(g,key='westminster-roamer-3'){
 if(!g.pistol.collected)tick(g,{actions:['pickup']});const e=g.enemies.find(e=>e.placementKey===key);for(const e of g.enemies)e.staggerUntil=1000;g.player.pos={x:e.pos.x,z:e.pos.z-5};
 for(let n=0;n<2;n++){while(g.time+1e-8<g.pistol.nextFireAt)tick(g);tick(g,{actions:['fire'],aim:{x:0,z:1}});}
 assert.equal(e.hp,0);assert.ok(g.events.some(v=>v.type==='death'&&v.actor===e));return e;
}
import {createVestState,vestAvailable} from '../src/vest.js';
import {createGeometry} from '../src/world-geometry.js';

function unlock(g){killResident(g);killResident(g,'westminster-roamer-4');assert.equal(g.supplies.issued.length,2);return g;}
test('two actual native kills unlock one bag; atomic write precedes equip and duplicate denial preserves state',()=>{
 const g=unlock(game());assert.equal(vestAvailable(g.vest,g.supplies),true);g.player.pos={x:0,z:-6};collectNearbyVest(g,()=>assert.fail('spawn outside radius'));
 g.player.pos={...VEST_BAG_POSITION};const before={hp:g.player.hp,mag:g.pistol.magazine,reserve:g.pistol.reserve};let raw;
 collectNearbyVest(g,next=>{assert.equal(g.vest.equipped,false);assert.equal(next.vest.equipped,true);raw=encodeRun(next);return true;});assert.equal(g.vest.equipped,true);assert.deepEqual({hp:g.player.hp,mag:g.pistol.magazine,reserve:g.pistol.reserve},before);assert.equal(JSON.parse(raw).vest.equipped,true);assert.equal(JSON.parse(raw).version,2);assert.equal(g.events.filter(e=>e.type==='vest-pickup').length,1);collectNearbyVest(g,()=>assert.fail('duplicate equip write'));assert.equal(g.vest.equipped,true);assert.equal(vestAvailable(g.vest,g.supplies),false);
});
test('failed storage cannot equip, consume bag, protect or publish equip event',()=>{
 const g=unlock(game());g.player.pos={...VEST_BAG_POSITION};const raw=encodeRun(g);collectNearbyVest(g,()=>false);assert.equal(encodeRun(g),raw);assert.equal(g.vest.equipped,false);assert.equal(vestAvailable(g.vest,g.supplies),true);assert.equal(g.events.some(e=>e.type==='vest-pickup'),false);receiveHit(g,{amount:14,origin:{x:g.player.pos.x,z:g.player.pos.z+1},block:false,moveId:'heavy_overhead'});assert.equal(g.player.hp,136);
});
test('narrow valid030 migration preserves HP/ammo/reward tombstones and old kills qualify immediately',()=>{
 const g=unlock(game());g.player.hp=80;g.pistol.magazine=2;g.pistol.reserve=4;const old=JSON.parse(encodeRun(g));old.version=1;delete old.vest;const f=game(),saved=restoreRun(f,JSON.stringify(old));assert.equal(saved.hp,80);assert.equal(saved.pistol.magazine,2);assert.equal(saved.pistol.reserve,4);assert.deepEqual(saved.supplies,g.supplies);assert.deepEqual(saved.vest,createVestState());applySavedRun(f,saved);assert.equal(f.enemies.length,4);assert.equal(vestAvailable(f.vest,f.supplies),true);f.player.pos={...VEST_BAG_POSITION};collectNearbyVest(f,()=>true);assert.equal(f.vest.equipped,true);assert.equal(f.player.hp,80);
});
test('corrupt successor/vest or cross-ledger equipped state never falls back to legacy',()=>{
 const g=game(),good=JSON.parse(encodeRun(g)),legacy=encodePistol(g.pistol);
 for(const bad of [{...good,vest:undefined},{...good,vest:{...good.vest,equipped:true}},{...good,vest:{...good.vest,itemId:'other'}},{...good,vest:{...good.vest,version:2}},{...good,version:3},{...good,version:1}])assert.equal(restoreRun(g,JSON.stringify(bad),legacy),null);
 const old={...good,version:1};delete old.vest;assert.equal(restoreRun(g,JSON.stringify(old)).vest.equipped,false);assert.equal(restoreRun(g,'{',legacy),null);
});
test('final native HP seam reduces unblocked hit ONCE while guard chip/parry/cost remain exact',()=>{
 for(const mode of ['normal','block','parry']){
  const a=game(),b=game();b.vest.equipped=true;
  for(const g of [a,b]){g.player.guarding=mode!=='normal';g.player.guardStart=g.time-1;g.player.parryUntil=mode==='parry'?g.time+.1:0;receiveHit(g,{amount:14,origin:{x:0,z:-5},block:mode!=='normal',parry:mode==='parry',moveId:'heavy_overhead'});}
  if(mode==='normal'){assert.equal(a.player.hp,136);assert.ok(Math.abs(b.player.hp-137.4)<1e-8);assert.equal(b.events.find(e=>e.type==='hit').amount,12.6);}else{assert.equal(a.player.hp,b.player.hp);assert.equal(a.player.guard,b.player.guard);assert.deepEqual(a.events.map(e=>[e.type,e.amount,e.cost]),b.events.map(e=>[e.type,e.amount,e.cost]));}
 }
 const tiny=game();tiny.vest.equipped=true;receiveHit(tiny,{amount:.2,origin:{x:0,z:-5},block:false});assert.ok(Math.abs(tiny.player.hp-149.8)<1e-8);
});
test('equipment and original reward state survive JSON refresh/area return and coherent Retry clears all',async()=>{
 const g=unlock(game());g.player.pos={...VEST_BAG_POSITION};collectNearbyVest(g,()=>true);const f=game();applySavedRun(f,restoreRun(f,encodeRun(g)));assert.equal(f.vest.equipped,true);assert.equal(f.enemies.length,4);assert.deepEqual(f.supplies,g.supplies);await travelTo(f,{areaId:'east',entryPoint:{x:0,z:0}});await travelTo(f,{areaId:'westminster',entryPoint:{x:0,z:-6}});assert.equal(f.vest.equipped,true);assert.equal(f.enemies.length,4);assert.equal(vestAvailable(f.vest,f.supplies),false);const retry=game();assert.equal(restoreRun(retry,encodeRun(retry)).vest.equipped,false);assert.equal(retry.enemies.length,6);assert.equal(retry.player.hp,150);assert.equal(retry.pistol.collected,false);assert.deepEqual(retry.supplies.issued,[]);
});
test('actual native layout circle/LOS reaches near-stash bag without spawn auto-equip',()=>{
 const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url))),geometry=createGeometry(layout),spawn={x:0,z:-6};assert.ok(geometry.clear(VEST_BAG_POSITION,.4));assert.ok(geometry.lineClear(spawn,VEST_BAG_POSITION));const end=geometry.move(spawn,{x:VEST_BAG_POSITION.x,z:VEST_BAG_POSITION.z-spawn.z},.4);assert.ok(Math.hypot(end.x-VEST_BAG_POSITION.x,end.z-VEST_BAG_POSITION.z)<1e-8);assert.ok(Math.hypot(spawn.x-VEST_BAG_POSITION.x,spawn.z-VEST_BAG_POSITION.z)>1.3);assert.equal(Math.abs(VEST_BAG_POSITION.x+.85),1.15);
});
