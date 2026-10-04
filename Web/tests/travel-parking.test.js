import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,spawnWave,stepGame} from '../src/combat.js';
import {travelTo} from '../src/travel.js';

for (const group of [false,true]) test(`parked ${group?'Hollow group':'Goblin'} preserves remaining stamina and admission delays`,async()=>{
  const world={areaId:'westminster',spawn:{x:0,z:0},layout:{characterScale:1},
    move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,
    async loadArea(id){this.areaId=id;return{x:0,z:0};}};
  const encounter=group?{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}}:undefined;
  const game=createGame(world,{pilot:'donor-knife',encounter});
  spawnWave(game);
  game.enemies.forEach((e,i)=>{e.pos={x:i*.2,z:1};const d=Math.hypot(e.pos.x,e.pos.z);e.facing={x:-e.pos.x/d,z:-e.pos.z/d};});
  stepGame(game,{});
  const enemy=game.enemies[0],before={time:game.time,stamina:enemy.stamina,recovery:enemy.guardRecoverAt,admission:game.nextEnemyAttackAt};
  assert.ok(enemy.swing,'fixture starts a real attack and spends stamina');
  assert.equal(before.stamina,82);
  await travelTo(game,{areaId:'east'});
  for(let i=0;i<600;i++)stepGame(game,{});
  await travelTo(game,{areaId:'westminster'});
  const elapsed=game.time-before.time;
  assert.ok(Math.abs(enemy.guardRecoverAt-before.recovery-elapsed)<1e-8,'parked recovery delay elapsed during travel');
  if(group)assert.ok(Math.abs(game.nextEnemyAttackAt-before.admission-elapsed)<1e-8,'parked group admission delay elapsed during travel');
  stepGame(game,{});
  assert.equal(enemy.stamina,before.stamina,'return must not regenerate before the preserved deadline');
  assert.equal(game.events.some(e=>e.type==='enemy-attack'),false,'return must not skip group attack admission delay');
});
