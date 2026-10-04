import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,stepGame,enemy,attack} from '../src/combat.js';import {travelTo} from '../src/travel.js';
const world=()=>({areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6}}});
const game=()=>createGame(world(),{pilot:'donor-knife',pistol:true});
const tick=(g,i={})=>stepGame(g,i,1/60);
test('ordinary spawn can explicitly collect once, fire along aim, consume ammo and keep melee off',()=>{
 const g=game();assert.equal(g.pistol.collected,false);tick(g,{actions:['pickup']});assert.equal(g.pistol.collected,true);assert.equal(g.player.weapon,'pistol');assert.equal(g.pistol.magazine,6);
 g.enemies=[enemy(0,{x:0,z:-2})];g.enemies[0].hp=20;g.wave=1;tick(g,{actions:['fire'],aim:{x:0,z:1}});
 assert.equal(g.pistol.magazine,5);assert.equal(g.kills,1);assert.equal(g.finished,true);assert.equal(g.won,true);assert.ok(g.events.some(e=>e.type==='shot'&&e.kind==='bullet'&&!e.parry));assert.equal(g.player.swing,null);
});
test('pistol hit consumes ammunition but does not bypass a real blocked line or aim behind',()=>{
 const g=game();tick(g,{actions:['pickup']});g.enemies=[enemy(0,{x:0,z:-2})];const target=g.enemies[0],hp=target.hp;
 g.world.lineClear=(a,b)=>b.z<=-4;tick(g,{actions:['fire'],aim:{x:0,z:1}});assert.equal(g.pistol.magazine,5);assert.equal(target.hp,hp);assert.equal(g.events.find(e=>e.type==='shot').targetId,null);
});
test('pistol disables knife guard/special, permits movement, and holster restores melee without extra Heavy',()=>{
 const g=game();tick(g,{actions:['pickup']});const start={...g.player.pos};tick(g,{actions:['special'],held:['slash'],guard:true,guardPressed:true,move:{x:1,z:0}});
 assert.equal(g.player.guarding,false);assert.equal(g.player.swing,null);assert.ok(g.player.pos.x>start.x);assert.equal(attack(g,'slash'),false);
 tick(g,{actions:['heavy']});assert.equal(g.player.weapon,'knife');assert.equal(g.player.swing,null);tick(g,{actions:['slash']});assert.equal(g.player.swing.action,'slash');
});
test('area round trip and re-equip preserve collected pickup/ammo; retry gets new state',async()=>{
 const g=game();tick(g,{actions:['pickup']});tick(g,{actions:['fire']});const ammo=g.pistol.magazine;await travelTo(g,{areaId:'east'});await travelTo(g,{areaId:'westminster'});
 tick(g,{actions:['pickup']});assert.equal(g.pistol.magazine,ammo);tick(g,{actions:['heavy']});tick(g,{actions:['pickup']});assert.equal(g.player.weapon,'pistol');assert.equal(g.pistol.magazine,ammo);assert.equal(game().pistol.collected,false);
});
