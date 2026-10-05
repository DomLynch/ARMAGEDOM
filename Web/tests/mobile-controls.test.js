import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,enemy,stepGame,resetMobileControls} from '../src/combat.js';
import {createMobileAimState} from '../src/mobile-combat-aim.js';
import {InputState} from '../src/input.js';
import {pistolCue} from '../src/pistol-targeting.js';
const world={areaId:'westminster',spawn:{x:0,z:0},layout:{characterScale:1.3225},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
const tick=(g,intent,n=1)=>{for(let i=0;i<n;i++)stepGame(g,intent);};
function fixture(angle=0,distance=4){
 const g=createGame(world,{pilot:'donor-knife',pistol:true,mobileControls:true});g.wave=1;g.started=true;
 Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,reserve:12});
 const e=Object.assign(enemy(0,{x:Math.sin(angle)*distance,z:Math.cos(angle)*distance}),{placementKey:'westminster-roamer-3',hp:1000,radius:.4,staggerUntil:1000});g.enemies=[e];return {g,e};
}
test('mobile body heading drives real pistol ray without old second snap; desktop keeps existing policy',()=>{
 const {g,e}=fixture(10*Math.PI/180);tick(g,{mobile:true,moveHeld:false,actions:['fire']});
 const shot=g.events.find(e=>e.type==='shot');assert.equal(shot.targetId,null);assert.deepEqual(shot.direction,g.player.facing);assert.equal(e.hp,1000);assert.equal(g.pistol.magazine,5);assert.equal(pistolCue(g).targetId,null);
 const d=fixture(10*Math.PI/180);tick(d.g,{mobile:false,aim:{x:0,z:1},actions:['fire']});assert.equal(d.e.hp,975);
});
test('left-stick smooth whole-body turn and lift stop actual translation immediately',()=>{
 const {g}=fixture();tick(g,{mobile:true,moveHeld:true,move:{x:1,z:0}},15);assert.ok(g.player.facing.x>.99);assert.ok(g.player.pos.x>0);assert.ok(g.player.velocity.x>0);
 const p={...g.player.pos};tick(g,{mobile:true,moveHeld:false,move:{x:0,z:0}},4);assert.deepEqual(g.player.pos,p);assert.deepEqual(g.player.velocity,{x:0,z:0});assert.equal(g.mobileAim.targetId,null);
 tick(g,{mobile:true,moveHeld:true,move:{x:-1,z:0}},30);assert.ok(g.player.facing.x<-.99);
});
test('integration maps stable registered IDs, actual LOS and visibility; reset clears retention and velocity',()=>{
 const {g,e}=fixture(3*Math.PI/180,2);tick(g,{mobile:true,moveHeld:true,move:{x:0,z:.02},combatVisibleIds:[e.id]},2);assert.equal(g.mobileAim.targetId,e.placementKey);
 g.world={...world,lineClear:()=>false};tick(g,{mobile:true,moveHeld:true,move:{x:0,z:.02},combatVisibleIds:[e.id]});assert.equal(g.mobileAim.targetId,null);
 g.world=world;tick(g,{mobile:true,moveHeld:true,move:{x:0,z:.02},combatVisibleIds:[]});assert.equal(g.mobileAim.targetId,null);
 resetMobileControls(g);assert.equal(g.mobileAim.targetId,null);assert.deepEqual(g.player.velocity,{x:0,z:0});assert.equal(g.mobileAiming,false);
});
test('ready short tap fires once; rejected cooldown tap never queues a later shot; cadence and finite reload remain native',()=>{
 const {g}=fixture();tick(g,{mobile:true,actions:['fire']});assert.equal(g.pistol.magazine,5);tick(g,{mobile:true,actions:['fire']});tick(g,{mobile:true},100);assert.equal(g.pistol.magazine,5);
 tick(g,{mobile:true,held:['fire']},80);assert.equal(g.pistol.magazine,3);assert.equal(g.pistol.reserve,12);
 tick(g,{mobile:true},75);tick(g,{mobile:true,actions:['stab']});assert.ok(g.pistol.reloadingUntil>g.time);tick(g,{mobile:true},180);assert.equal(g.pistol.magazine,6);assert.equal(g.pistol.reserve,9);
});
test('point-blank true-ray marker matches the first actual body independently of retained target',()=>{
 const {g,e}=fixture(0,.03);e.radius=.4;g.mobileAiming=true;g.mobileAim=createMobileAimState();assert.equal(g.mobileAim.targetId,null);assert.equal(pistolCue(g).targetId,e.id);
 tick(g,{mobile:true,actions:['fire']});assert.equal(g.events.find(e=>e.type==='shot').targetId,e.id);assert.equal(e.hp,975);
});

test('unavailable pistol guard cannot freeze left-stick body turning; actual knife guard aim remains native',()=>{
 const {g}=fixture();tick(g,{mobile:true,moveHeld:true,move:{x:1,z:0},guard:true},20);assert.ok(g.player.facing.x>.99);assert.equal(g.player.guarding,false);
 const position={...g.player.pos};g.pistol.equipped=false;tick(g,{mobile:true,moveHeld:false,guard:true,aim:{x:0,z:-1}});assert.deepEqual(g.player.velocity,{x:0,z:0});assert.deepEqual(g.player.pos,position);assert.deepEqual(g.player.facing,{x:0,z:-1});assert.equal(g.player.guarding,true);
});

test('translation consumes steered intent rather than original raw direction, including stale lift vectors',()=>{
 const {g}=fixture();tick(g,{mobile:true,moveHeld:true,move:{x:0,z:1}});g.player.pos={x:0,z:0};g.player.velocity={x:0,z:0};
 tick(g,{mobile:true,moveHeld:true,move:{x:1,z:0}});assert.ok(g.player.pos.x>0);assert.ok(g.player.pos.z>g.player.pos.x*3,'travel initially preserves forward direction while smoothly turning right');
 const position={...g.player.pos};tick(g,{mobile:true,moveHeld:false,move:{x:1,z:0}});assert.deepEqual(g.player.pos,position);assert.deepEqual(g.player.velocity,{x:0,z:0});
});

// Controlled domain fixture driven through the real touch state, not a synthetic
// post-mapping intent. Native compiled-game coverage is recorded separately.
test('real left-stick input acquires off-centre target, tracks travel, exits deliberately and stops on lift',()=>{
 const {g,e}=fixture(4*Math.PI/180,4),input=new InputState(),arc=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const frame=()=>{const raw=input.take();stepGame(g,{...raw,mobile:true,move:{x:raw.move.x,z:-raw.move.y},combatVisibleIds:[e.id]});};
 const steer=degrees=>{const a=degrees*Math.PI/180;input.move(11,{x:Math.sin(a)*13,y:-Math.cos(a)*13});};
 input.down(11,'move',{x:0,y:0});steer(0);for(let i=0;i<30;i++)frame();
 assert.equal(g.mobileAim.targetId,e.placementKey);const error=arc(g.mobileAim.bearing-g.mobileAim.rawHeading);assert.ok(error>3*Math.PI/180&&error<5*Math.PI/180);assert.ok(g.mobileAim.heading>g.mobileAim.rawHeading);const bearing=g.mobileAim.bearing;
 for(let i=0;i<30;i++)frame();assert.equal(g.mobileAim.targetId,e.placementKey);assert.ok(g.mobileAim.bearing>bearing);assert.ok(Math.abs(arc(g.mobileAim.bearing-g.mobileAim.rawHeading)-error)<1e-8,'travel preserves intentional aim error');
 steer(7);for(let i=0;i<30;i++)frame();assert.equal(g.mobileAim.targetId,e.placementKey,'partial manual turn retains target');
 steer(25);for(let i=0;i<30;i++)frame();assert.equal(g.mobileAim.targetId,null,'manual turn escapes 9degree retention');
 input.up(11);const position={...g.player.pos};for(let i=0;i<8;i++)frame();assert.deepEqual(g.player.pos,position);assert.equal(g.mobileAim.targetId,null);
 input.down(11,'move',{x:0,y:0});g.mobileAssistEnabled=false;steer(0);for(let i=0;i<30;i++)frame();assert.equal(g.mobileAim.targetId,null);input.clear();resetMobileControls(g);assert.equal(g.mobileAiming,false);
});

test('real touch state and equipped-pistol mode produce medium/long body-ray25 hits; matched Off rays miss',()=>{
 for(const [distance,error] of [[8,4],[12,3],[14,2.5],[17,2]])for(const enabled of [true,false]){
  const {g,e}=fixture(error*Math.PI/180,distance);e.radius=.34;g.mobileAssistEnabled=enabled;const input=new InputState();input.down(11,'move',{x:0,y:0});input.move(11,{x:0,y:-7});
  const frame=()=>{const raw=input.take();stepGame(g,{...raw,mobile:true,move:{x:raw.move.x,z:-raw.move.y},combatVisibleIds:[e.id]});};
  for(let i=0;i<15;i++)frame();assert.equal(g.mobileAim.targetId,enabled?e.placementKey:null);input.down(21,'fire',{x:100,y:0});frame();const shot=g.events.find(e=>e.type==='shot');assert.ok(shot);assert.deepEqual(shot.direction,g.player.facing);assert.equal(shot.targetId,enabled?e.id:null);assert.equal(e.hp,enabled?975:1000);assert.equal(g.pistol.magazine,5);assert.equal(g.pistol.reserve,12);input.clear();resetMobileControls(g);assert.equal(g.mobileAim.targetId,null);
 }
});
