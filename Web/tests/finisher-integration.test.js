import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,enemy,attack,stepGame} from '../src/combat.js';
const world={areaId:'westminster',spawn:{x:0,z:0},layout:{characterScale:1.3225},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
const support=[{id:'pistol-directional',clip:'Death',seconds:2.7333334386,cost:0,parts:[],prepared:true},{id:'decapitation',clip:'Death_SplitCrown',seconds:1,cost:1,parts:['head'],prepared:true}];
function fixture(){const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,finishers:true});g.wave=1;g.started=true;return g;}
function victim(g,key='westminster-roamer-3'){
 const e=Object.assign(enemy(0,{x:0,z:.9}),{rig:'hero',weapon:'knife',bodyScale:1,combatScale:1.3225,hp:1,placementKey:key,staggerUntil:100,finisherSupport:support});
 g.enemies=[e,Object.assign(enemy(0,{x:20,z:20}),{rig:'hero',weapon:'knife',bodyScale:1,combatScale:1.3225,staggerUntil:100})];return e;
}
function fire(g){Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,reserve:12,reloadingUntil:0,nextFireAt:0});stepGame(g,{actions:['fire'],aim:{x:0,z:1}});}
test('real pistol lethal path rotates ordinary then supported directional corpse, keeping live control and rewards once',()=>{
 const g=fixture(),first=victim(g);fire(g);assert.equal(first.finisher.recipeId,'ordinary');assert.deepEqual(first.finisher.impactDirection,{x:0,z:1});assert.equal(g.kills,1);
 const second=victim(g,'westminster-roamer-1');fire(g);assert.equal(second.finisher.recipeId,'pistol-directional');assert.equal(second.finisher.hitRegion,null);assert.equal(g.corpses.length,2);assert.equal(g.kills,2);assert.notEqual(first.finisher,second.finisher);
 const ledger=JSON.stringify(g.supplies),deaths=g.events.filter(e=>e.type==='death');assert.equal(deaths.length,1);assert.equal(g.finished,false);assert.equal(g.enemies.length,1);
 const before=g.player.pos.x;stepGame(g,{move:{x:1,z:0}});assert.ok(g.player.pos.x>before);assert.equal(g.kills,2);assert.equal(JSON.stringify(g.supplies),ledger);assert.equal(g.events.some(e=>e.type==='death'),false);
 assert.deepEqual(g.supplies.issued,['westminster-roamer-3','westminster-roamer-1']);assert.equal(g.supplies.pending.length,2);
});
test('native cutting lethal uses shared-contact impact direction and reserves one head; full active cap falls back',()=>{
 for(const occupied of [0,2]){
  const g=fixture();g.kills=1;g.finishers.recentRecipeId='ordinary';g.corpses=Array.from({length:occupied},(_,i)=>({id:100+i,finisherHeadUntil:100}));const e=victim(g);
  assert.equal(attack(g,'slash',{x:0,z:1}),true);for(let i=0;i<20;i++)stepGame(g);
  assert.equal(e.hp,0);assert.equal(e.finisher.recipeId,occupied?'ordinary':'decapitation');assert.deepEqual(e.finisher.impactDirection,{x:0,z:1});assert.equal(e.finisher.hitRegion,null);assert.equal(g.kills,2);assert.equal(g.corpses.length,occupied+1);
  if(!occupied)assert.ok(e.finisherHeadUntil>g.time);assert.deepEqual(g.supplies.issued,['westminster-roamer-3']);assert.equal(g.supplies.pending.length,1);
 }
});
test('unprepared victim safely uses ordinary without reserving or fabricating geometry',()=>{
 const g=fixture();g.kills=1;g.finishers.recentRecipeId='ordinary';const e=victim(g);e.finisherSupport=[];fire(g);assert.equal(e.finisher.recipeId,'ordinary');assert.equal(e.finisherHeadUntil,undefined);
});

test('pistol-only delivery retains ranged variety and ordinary cutting without head reservations',()=>{
 const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,finishers:'pistol-only'});g.wave=1;g.started=true;
 assert.equal(g.finishers.maxHeads,0);victim(g);fire(g);const ranged=victim(g,'westminster-roamer-1');fire(g);assert.equal(ranged.finisher.recipeId,'pistol-directional');
 const melee=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,finishers:'pistol-only'});melee.wave=1;melee.started=true;melee.kills=1;melee.finishers.recentRecipeId='ordinary';const cut=victim(melee,'westminster-roamer-5');assert.equal(attack(melee,'slash',{x:0,z:1}),true);for(let i=0;i<20;i++)stepGame(melee);
 assert.equal(cut.hp,0);assert.equal(cut.finisher.recipeId,'ordinary');assert.equal(cut.finisherHeadUntil,undefined);assert.equal(melee.kills,2);
});

test('confirmed cosmetic pistol death reserves one head; nonlethal, miss and full cap do not',()=>{
 const gunHead={id:'pistol-decapitation',clip:'Death',seconds:2.733333,cost:1,parts:['head'],prepared:true};
 for(const occupied of [0,2]){
  const g=fixture();g.kills=1;g.finishers.recentRecipeId='ordinary';
  g.corpses=Array.from({length:occupied},(_,i)=>({id:100+i,finisherHeadUntil:100}));
  const e=victim(g);e.finisherSupport=[...support,gunHead];e.hp=40;
  fire(g);assert.equal(e.hp,15);assert.equal(e.finisher,undefined);assert.equal(e.finisherHeadUntil,undefined);assert.equal(g.kills,1);
  Object.assign(g.pistol,{nextFireAt:0});stepGame(g,{actions:['fire'],aim:{x:0,z:-1}});
  assert.equal(e.hp,15);assert.equal(e.finisher,undefined);assert.equal(g.kills,1);
  fire(g);assert.equal(e.hp,0);assert.equal(e.finisher.recipeId,occupied?'pistol-directional':'pistol-decapitation');
  assert.equal(e.finisher.hitRegion,null);assert.equal(g.kills,2);assert.equal(g.events.filter(e=>e.type==='death').length,1);
  assert.deepEqual(g.supplies.issued,['westminster-roamer-3']);
  if(!occupied)assert.ok(e.finisherHeadUntil>g.time);
 }
});

test('cutting crown reserves actual shared part cost without fabricating a detached head',()=>{
 const g=fixture();g.kills=1;const e=victim(g);e.finisherSupport=[{id:'split-crown',clip:'Death_SplitCrown',seconds:1,cost:1,parts:['crown'],prepared:true}];
 assert(attack(g,'slash',{x:0,z:1}));for(let i=0;i<20;i++)stepGame(g);assert.equal(e.finisher.recipeId,'split-crown');assert.equal(e.finisher.seconds,1);assert(e.finisherPartsUntil>g.time);assert.equal(e.finisherHeadUntil,undefined);assert.equal(g.kills,2);assert.equal(g.enemies.length,1);const kills=g.kills,issued=JSON.stringify(g.supplies);for(let i=0;i<25;i++)stepGame(g);stepGame(g,{move:{x:1,z:0}});assert(g.player.pos.x>0);assert.equal(g.kills,kills);assert.equal(JSON.stringify(g.supplies),issued);
});
test('generic crown cost consumes the same finite budget as existing heads and expires normally',()=>{
 for(const [partsUntil,cost,expected]of [[100,2,'ordinary'],[100,1,'split-crown'],[0,2,'split-crown']]){
  const g=fixture();g.kills=1;g.corpses=[{id:999,finisherPartsUntil:partsUntil,finisher:{cost,parts:['crown']}}];const e=victim(g);e.finisherSupport=[{id:'split-crown',clip:'Death_SplitCrown',seconds:1,cost:1,parts:['crown'],prepared:true}];assert(attack(g,'slash',{x:0,z:1}));for(let i=0;i<20;i++)stepGame(g);assert.equal(e.finisher.recipeId,expected);if(expected==='ordinary')assert.equal(e.finisherPartsUntil,undefined);
 }
});

test('Opened reserves generic cost with no detached-head alias and tracks the latest confirmed victim',()=>{
 for(const occupied of [0,2]){const g=fixture();g.kills=1;g.corpses=occupied?[{id:999,finisherPartsUntil:100,finisher:{cost:2}}]:[];const e=victim(g);e.finisherSupport=[{id:'opened',clip:'Death_SplitCrown',seconds:1,cost:1,parts:['upper-body'],prepared:true}];assert(attack(g,'slash',{x:0,z:1}));for(let i=0;i<20;i++)stepGame(g);assert.equal(e.finisher.recipeId,occupied?'ordinary':'opened');assert.equal(g.finishers.lastVictimId,e.id);assert.equal(e.finisherHeadUntil,undefined);assert.equal(g.kills,2);if(!occupied)assert(e.finisherPartsUntil>g.time);}
});
