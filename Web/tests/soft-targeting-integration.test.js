import {readFileSync} from 'node:fs';import {InputState} from '../src/input.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,stepGame,enemy,attack} from '../src/combat.js';
const direction=a=>({x:Math.sin(a*Math.PI/180),z:Math.cos(a*Math.PI/180)});
const angle=v=>Math.atan2(v.x,v.z)*180/Math.PI;
const tick=(g,i={})=>stepGame(g,i);
function fixture(){const world={areaId:'westminster',spawn:{x:0,z:0},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};const g=createGame(world,{pilot:'donor-knife'});g.wave=1;return g;}
function target(g,a=28,d=1.25){const f=direction(a);const e=Object.assign(enemy(0,{x:f.x*d,z:f.z*d}),{rig:'hollow-scavenger',contactRig:'hero',combatScale:1.265,bodyScale:1,hp:1000,maxHP:1000,staggerUntil:100,ready:100});g.enemies.push(e);return e;}
for(const [action,last] of [['slash',null],['slash','light_right'],['stab',null],['heavy',null],['special',null]])test(`${action}/${last} gently turns only accepted windup and preserves actual native contact`,()=>{
 const g=fixture(),e=target(g);g.player.lastMove=last;
 tick(g,{actions:[action]});const s=g.player.swing;assert(s);assert.ok(angle(g.player.facing)>0&&angle(g.player.facing)<28,'bounded first turn');
 let hit=false;for(let i=0;i<s.def.windupTicks+s.def.activeTicks;i++){tick(g);if(i===7){assert.ok(Math.abs(angle(g.player.facing)-28)<1e-8);assert.deepEqual(g.player.facing,s.dir);}hit||=g.events.some(v=>v.type==='hit'&&v.actor===e);}
 assert.ok(hit,'original blade/pommel contact still resolves');assert.equal(e.hp,1000-s.def.damage);
});
test('selected direction is a snapshot; active/recovery and idle never chase',()=>{
 const g=fixture(),e=target(g);tick(g,{actions:['heavy']});e.pos={x:-1,z:1};for(let i=0;i<23;i++)tick(g,{aim:direction(-90),move:direction(-90)});
 assert.ok(Math.abs(angle(g.player.facing)-28)<1e-8);const facing={...g.player.facing};for(let i=0;i<10;i++)tick(g);assert.deepEqual(g.player.facing,facing);
});
test('explicit aim beats active movement; movement beats facing for a fresh attack',()=>{
 for(const [i,wanted] of [[{aim:direction(90),move:direction(-90)},118],[{move:direction(90)},118]]){const g=fixture();target(g,118);tick(g,{...i,actions:['stab']});for(let n=0;n<8;n++)tick(g);assert.ok(Math.abs(angle(g.player.facing)-wanted)<1e-8);}
});
test('behind, obstacle, unseen, out-of-range and no-target attacks retain original intent',()=>{
 for(const kind of ['behind','wall','unseen','far','empty']){const g=fixture(),e=kind==='empty'?null:target(g,kind==='behind'?170:28,kind==='far'?6:1.25);if(kind==='wall')g.world.lineClear=()=>false;tick(g,{actions:['stab'],combatVisibleIds:kind==='unseen'?[]:undefined});for(let i=0;i<8;i++)tick(g);assert.deepEqual(g.player.facing,{x:0,z:1});assert.ok(!e||e.hp===1000);}
});
test('buffer resolves fresh intent and target when the action really starts',()=>{
 const g=fixture(),e=target(g,28);g.player.ready=.1;tick(g,{actions:['stab']});assert.equal(g.player.swing,null);assert.equal(angle(g.player.facing),0);e.pos={x:1.25,z:0};for(let i=0;i<8;i++)tick(g,{move:direction(90)});assert.ok(g.player.swing);assert.ok(Math.abs(angle(g.player.facing)-90)<1e-8);
});
test('rejected/cancelled actions do not auto turn',()=>{
 for(const mode of ['hurt','stamina','cooldown']){const g=fixture();target(g);if(mode==='hurt')g.player.hurtUntil=10;if(mode==='stamina')g.player.guard=0;if(mode==='cooldown')g.player.specialReady=10;tick(g,{actions:['special']});assert.equal(g.player.swing,null);assert.equal(angle(g.player.facing),0);}
 const g=fixture();target(g);tick(g,{actions:['heavy']});tick(g,{cancel:true});const f={...g.player.facing};for(let i=0;i<8;i++)tick(g);assert.deepEqual(g.player.facing,f);
});
function pistol(){const g=fixture();g.pistol={collected:true,equipped:true,magazine:6,reserve:12,reloadingUntil:0,nextFireAt:0,pickupPos:{x:0,z:0},pickupAreaId:'westminster'};g.player.weapon='pistol';return g;}
test('ordinary pistol tap assists; target cannot creep outside original intent on later shots',()=>{
 const g=pistol(),e=target(g,8,8);tick(g,{actions:['fire']});assert.equal(g.events.find(v=>v.type==='shot').targetId,e.id);assert.equal(e.hp,975);assert.equal(g.pistolTargetId,null);
 e.pos={x:direction(18).x*8,z:direction(18).z*8};while(g.time<g.pistol.nextFireAt)tick(g);tick(g,{actions:['fire']});const shot=g.events.find(v=>v.type==='shot');assert.equal(shot.targetId,null);assert.deepEqual(shot.direction,{x:0,z:1});assert.equal(e.hp,975);
});
test('cooldown/dry/reload cannot auto rotate or track, deliberate aim still steers',()=>{
 for(const mode of ['cooldown','dry','reload']){const g=pistol();target(g,8,8);if(mode==='cooldown')g.pistol.nextFireAt=10;if(mode==='dry')g.pistol.magazine=0;if(mode==='reload')g.pistol.reloadingUntil=10;tick(g,{held:['fire']});assert.deepEqual(g.player.facing,{x:0,z:1});assert.equal(g.pistolTargetId,null);assert.ok(!g.events.some(v=>v.type==='shot'));tick(g,{held:['fire'],manualPistolAim:true,aim:direction(-90)});assert.ok(Math.abs(angle(g.player.facing)+90)<1e-8);}
});

test('neutral pistol dodge updates real unassisted heading for the next ordinary tap',()=>{const g=pistol();tick(g,{dodge:true});for(let i=0;i<40;i++)tick(g);assert.ok(Math.abs(angle(g.player.facing)-180)<1e-8||Math.abs(angle(g.player.facing)+180)<1e-8);const facing={...g.player.facing};tick(g,{actions:['fire']});const shot=g.events.find(e=>e.type==='shot');assert.ok(Math.hypot(shot.direction.x-facing.x,shot.direction.z-facing.z)<1e-8);assert.ok(Math.hypot(g.player.facing.x-facing.x,g.player.facing.z-facing.z)<1e-8);});

test('held melee resolves anew at each accepted action and invalid aim falls back to movement',()=>{const g=fixture(),e=target(g);tick(g,{held:['stab']});const first=g.player.swing.start;while(g.player.swing)tick(g);e.pos={x:g.player.pos.x-1.25,z:g.player.pos.z};tick(g,{held:['stab'],aim:{x:NaN,z:0},move:direction(-90)});assert.ok(g.player.swing.start>first);assert.ok(Math.abs(angle(g.player.facing)+90)<1e-8);assert.ok(Math.abs(angle(g.player.swing.dir)+90)<1e-8);});

for(const callback of ['pause','resize'])test(`actual main ${callback} callback cancels pending assistance without destroying committed swing`,()=>{const g=fixture();target(g);tick(g,{actions:['heavy']});const swing=g.player.swing,facing={...g.player.facing},state=new InputState();state.down(1,'slash',{x:0,y:0});const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),pause=source.slice(source.indexOf('function pause(value)'),source.indexOf('const hud =')),resize=source.slice(source.indexOf('function resize()'),source.indexOf('window.addEventListener("resize", resize)'));const callbacks=new Function('game','input','audio','hud',`let paused=false,accumulator=0,last=0,renderer=null,loaded=false,world=null,atmosphere=null,contextLost=false;${pause}${resize};return {pause,resize};`)(g,{clear:()=>state.clear()},{pause(){}},{resize(){}});if(callback==='pause'){callbacks.pause(true);callbacks.pause(false);}else callbacks.resize();assert.equal(g.player.swing,swing);assert.equal(swing.turnTo,null);assert.equal(state.pointers.size,0);for(let i=0;i<8;i++)tick(g,state.take());assert.deepEqual(g.player.facing,facing);assert.deepEqual(swing.dir,facing);});
