// The shared id counter feeds enemies, loot drops and bolts from one sequence (goldens and traces key on it).
// The sequence was recorded from UNCHANGED origin/main (cfd2eda0) into fixtures/enemy-id-sequence.json; never re-record it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createGame,enemy,attack,stepGame} from '../src/combat.js';
const open={move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
const FIXTURE=new URL('./fixtures/enemy-id-sequence.json',import.meta.url);
function script(){
  const seen=[],note=(tag,list)=>{for(const x of list)if(!seen.some(s=>s[1]===x.id))seen.push([tag,x.id]);};
  const g=createGame(open);
  const watch=()=>{note('enemy',g.enemies);note('loot',g.loot);note('bolt',g.bolts);};
  const step=(n)=>{for(let i=0;i<n;i++){g.player.hp=g.player.maxHP;stepGame(g,{},1/60);watch();}};
  seen.push(['direct',enemy(0,{x:0,z:0}).id],['direct',enemy(1,{x:1,z:1}).id]);
  g.started=true;g.wave=0;g.nextWave=0;
  for(let wave=0;wave<3;wave++){
    step(2);
    step(240);
    // two weak enemies in front of the player: two kills cross the loot cadence
    g.player.hp=g.player.maxHP;
    const weak=[0,1].map(i=>Object.assign(enemy(0,{x:0,z:-4+i*-1.5}),{hp:1,maxHP:1,staggerUntil:100}));
    seen.push(['direct',weak[0].id],['direct',weak[1].id]);
    g.enemies=weak;
    for(let k=0;k<2;k++){attack(g,'slash',{x:0,z:1});step(40);}
    g.enemies=[];g.nextWave=g.time;
  }
  // the drone's bolt (same counter), in the integration fixture of drone-integration.test.js
  const world={areaId:'westminster',layout:{characterScale:1.265},spawn:{x:0,z:-6},move:open.move,lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
  const encounter={id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}};
  const d=createGame(world,{pilot:'donor-knife',encounter,pistol:true,supplies:true,vest:true,drone:true,areaResidents:true,openingGroup:false});
  const drone=d.enemies.find(e=>e.rig==='low-hover-drone');
  d.enemies=[drone];d.player.pos={x:drone.pos.x,z:drone.pos.z-2};
  for(let i=0;i<40;i++){stepGame(d,{});for(const b of d.bolts)if(!seen.some(s=>s[1]===b.id))seen.push(['drone-bolt',b.id]);}
  return seen;
}
test('enemy, loot and bolt ids follow the sequence recorded on unchanged origin/main',()=>{
  const seen=script();
  if(process.env.RECORD_ENEMY_IDS)writeFileSync(FIXTURE,JSON.stringify(seen)+'\n');
  assert.deepEqual(seen,JSON.parse(readFileSync(FIXTURE,'utf8')));
  assert.ok(seen.some(s=>s[0]==='bolt'),'scenario must exercise bolt ids');
  assert.ok(seen.some(s=>s[0]==='drone-bolt'),'scenario must exercise the drone bolt id');
});
