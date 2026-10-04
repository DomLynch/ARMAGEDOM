import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,stepGame} from '../src/combat.js';
import {createGeometry} from '../src/world-geometry.js';

const layout=JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json',import.meta.url)));
function london(){return {spawn:{x:0,z:-6},layout,...createGeometry(layout)};}
const open={spawn:{x:0,z:0},layout:{characterScale:1},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};

test('actual Westminster 120-forward entry never spawns Goblin on player',()=>{
  const world=london(),g=createGame(world,{pilot:'donor-knife'});
  for(let i=0;i<120;i++)stepGame(g,{move:{x:0,z:1}});
  assert.equal(g.enemies.length,1);
  const enemy=g.enemies[0],gap=Math.hypot(enemy.pos.x-g.player.pos.x,enemy.pos.z-g.player.pos.z);
  assert.ok(gap>=enemy.radius+g.player.radius,`overlapping spawn gap ${gap}`);
  assert.ok(world.clear(enemy.pos,enemy.radius),'Goblin circle outside actual London road');
  assert.ok(world.clear(g.player.pos,g.player.radius),'player circle outside actual London road');
});

test('all spawn offsets blocked postpones wave safely and retries after clearance',()=>{
  const world={...open,move:(p)=>({...p})},g=createGame(world,{pilot:'donor-knife'});
  g.started=true;g.nextWave=0;
  for(let i=0;i<3;i++)stepGame(g,{});
  assert.equal(g.wave,0,'failed placement must not advance wave');
  assert.equal(g.enemies.length,0,'failed placement must not create overlap');
  assert.equal(g.finished,false,'failed placement must not complete encounter');
  world.move=open.move;
  stepGame(g,{});
  assert.equal(g.wave,1);
  assert.equal(g.enemies.length,1);
  const enemy=g.enemies[0];
  assert.ok(Math.hypot(enemy.pos.x-g.player.pos.x,enemy.pos.z-g.player.pos.z)>=enemy.radius+g.player.radius);
  stepGame(g,{});
  assert.equal(g.enemies.length,1,'retry must not duplicate opponent');
});

test('stationary same-tick aim and dodge retreats from current aim',()=>{
  const g=createGame(open,{pilot:'donor-knife'});
  stepGame(g,{dodge:true,aim:{x:1,z:0}});
  assert.ok(g.player.pos.x<0,'right aim must retreat left');
  assert.ok(Math.abs(g.player.pos.z)<1e-8,'previous forward facing must not determine dodge');
  assert.equal(g.player.dodgeDirection.x,-1);
  assert.ok(Math.abs(g.player.dodgeDirection.z)<1e-8);
});

test('movement-driven dodge overrides aim and retains press-time direction',()=>{
  const g=createGame(open,{pilot:'donor-knife'});
  stepGame(g,{dodge:true,move:{x:0,z:1},aim:{x:1,z:0}});
  assert.deepEqual(g.player.dodgeDirection,{x:0,z:1});
  stepGame(g,{aim:{x:-1,z:0},move:{x:1,z:0}});
  assert.deepEqual(g.player.dodgeDirection,{x:0,z:1});
});

test('same-tick aim/dodge cannot cancel a committed attack',()=>{
  const g=createGame(open,{pilot:'donor-knife'});
  stepGame(g,{actions:['slash'],aim:{x:0,z:1}});
  const swing=g.player.swing;
  stepGame(g,{dodge:true,aim:{x:1,z:0}});
  assert.equal(g.player.swing,swing);
  assert.equal(g.player.dodgeUntil,0);
  assert.deepEqual(swing.dir,{x:0,z:1});
});

test('stationary dodge ignores zero or nonfinite same-tick aim',()=>{
  for(const aim of [{x:0,z:0},{x:NaN,z:1},{x:Infinity,z:0}]){
    const g=createGame(open,{pilot:'donor-knife'});
    stepGame(g,{dodge:true,aim});
    assert.ok(Math.abs(g.player.dodgeDirection.x)<1e-8);
    assert.equal(g.player.dodgeDirection.z,-1);
  }
});

test('separated projected offsets still require actual circle clearance',()=>{
  const world={...open,clear:()=>false},g=createGame(world,{pilot:'donor-knife'});
  g.started=true;g.nextWave=0;stepGame(g,{});
  assert.equal(g.wave,0);
  assert.equal(g.enemies.length,0);
  world.clear=()=>true;stepGame(g,{});
  assert.equal(g.wave,1);
  assert.equal(g.enemies.length,1);
});
