import test from 'node:test';
import assert from 'node:assert/strict';
import {mobSizeProfile} from '../src/mob-size.js';
import {bladeContact,worldBlade,KNIFE_MOVES} from '../src/donor/knife.js';
import {createGame,enemy,attack,stepGame} from '../src/combat.js';
import {tracePistol} from '../src/pistol.js';
import {selectCombatTarget} from '../src/pistol-targeting.js';
const base=Object.freeze({bodyScale:1,combatScale:1.3225,radius:.4});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const body=(factor=1,pos={x:0,z:0})=>({rig:'hero',pos,facing:{x:0,z:1},...mobSizeProfile(base,factor)});
const sweep=(a,d)=>Array.from({length:6},(_,i)=>bladeContact(a,a,d,d,'light_right',13+i,14+i)).some(Boolean);
const world={spawn:{x:0,z:0},layout:{characterScale:1.3225},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
const ticks=(g,n,intent={})=>{for(let i=0;i<n;i++)stepGame(g,intent);};
function fight(factor,z=1.1){
  const g=createGame(world,{pilot:'donor-knife'});g.time=1;g.wave=1;
  const e=Object.assign(enemy(0,{x:0,z}),{rig:'hollow-scavenger',contactRig:'hero',weapon:'knife',
    ...mobSizeProfile(base,factor),hp:40,maxHP:40,ready:100,staggerUntil:100});g.enemies=[e];
  return {g,e};
}
function incoming(g,e){
  const def=KNIFE_MOVES.light_right;e.facing={x:0,z:-1};
  e.swing={action:'slash',def,moveId:def.moveId,path:def.path,dir:{...e.facing},
    start:g.time,end:g.time+def.windup+def.active+def.recovery,hitIds:new Set(),ageTicks:0};
}

test('absolute profiles preserve inputs/stats and scale geometry once for all approved sizes',()=>{
  const rich=Object.freeze({...base,hp:40,damage:10,moveSpeed:2.1});
  for(const [factor,scale,radius] of [[.85,1.124125,.34],[.9,1.19025,.36],[1,1.3225,.4],[1.1,1.45475,.44],[1.15,1.520875,.46]]){
    const p=mobSizeProfile(rich,factor);assert.equal(p.bodyScale,1);close(p.combatScale,scale);close(p.radius,radius);
    assert.deepEqual(Object.keys(p).sort(),['bodyScale','combatScale','radius']);
    assert.deepEqual(mobSizeProfile(rich,factor),p);assert.notEqual(mobSizeProfile(rich,factor),p);
  }
  assert.deepEqual(rich,{...base,hp:40,damage:10,moveSpeed:2.1});
  assert.deepEqual(mobSizeProfile(base,1),base);
  assert.equal(mobSizeProfile({...base,bodyScale:.78},1.15).bodyScale,.78);
});
test('invalid baseline/factors and derived overflow fail explicitly',()=>{
  for(const f of [undefined,null,'0.85',.84,.95,1.16,0,-1,NaN,Infinity])assert.throws(()=>mobSizeProfile(base,f),RangeError);
  for(const key of ['bodyScale','combatScale','radius'])for(const value of [undefined,'1',0,-1,NaN,Infinity])
    assert.throws(()=>mobSizeProfile({...base,[key]:value},1),RangeError);
  assert.throws(()=>mobSizeProfile(null,1),RangeError);
  assert.throws(()=>mobSizeProfile({...base,combatScale:Number.MAX_VALUE},1.15),RangeError);
});
test('minimum/maximum native blade endpoints match the pinned hero thrust frame',()=>{
  // Independently pinned frame12: [-.0137,1.31136,.37853,-.0137,1.31136,.76653].
  for(const [f,want] of [[.85,[[.0154005125,1.47413256,.42551503625],[.0154005125,1.47413256,.86167553625]]],
    [1.15,[[.0208359875,1.99441464,.57569681375],[.0208359875,1.99441464,1.16579631375]]]])
    worldBlade(body(f),'thrust',12).forEach((point,i)=>point.forEach((v,j)=>close(v,want[i][j])));
});
test('native blade sweep expands reach at maximum size while minimum whiffs boundary',()=>{
  const target=body(1,{x:0,z:1.5});assert.equal(sweep(body(.85),target),false);assert.equal(sweep(body(1.15),target),true);
  for(const f of [.85,1.15]){assert.equal(sweep(body(f),body(1,{x:0,z:.9})),true);assert.equal(sweep(body(f),body(1,{x:0,z:3})),false);}
});
test('native capsule expands once and changes an actual blade/body boundary',()=>{
  const player=body();
  assert.equal(bladeContact(player,player,body(.85,{x:.6,z:.7}),body(.85,{x:.6,z:.7}),'light_right',13,14),false);
  assert.equal(bladeContact(player,player,body(1.15,{x:.6,z:.7}),body(1.15,{x:.6,z:.7}),'light_right',13,14),true);
  for(const f of [.85,1.15])assert.equal(sweep(player,body(f,{x:2,z:2})),false);
});
test('min/max fixed-tick native contact keeps slash damage/guard costs and player scale',()=>{
  for(const f of [.85,1.15])for(const guard of [false,true]){
    const {g,e}=fight(f);incoming(g,e);ticks(g,20,{guard});
    assert.equal(g.player.hp,guard?150:140);assert.equal(g.player.guard,guard?90:100);
    assert.equal(g.player.combatScale,1.3225);assert.equal(g.player.bodyScale,1);assert.equal(g.player.radius,.4);
    assert.equal(e.maxHP,40);assert.equal(e.swing.def.damage,10);assert.equal(e.swing.def.windupTicks,14);
    assert.equal(g.events.some(event=>event.type==='death'),false);
  }
});
test('min/max parry remains native and wall blocks incoming blade contact',()=>{
  for(const f of [.85,1.15]){
    const {g,e}=fight(f);incoming(g,e);ticks(g,10);stepGame(g,{guard:true,guardPressed:true});
    const events=[];for(let i=0;i<9;i++){stepGame(g,{guard:true});events.push(...g.events);}
    assert.equal(g.player.hp,150);assert.equal(events.filter(x=>x.type==='parry').length,1);
    const blocked=fight(f);blocked.g.world={...world,lineClear:()=>false};incoming(blocked.g,blocked.e);ticks(blocked.g,20);
    assert.equal(blocked.g.player.hp,150);
  }
});
test('min/max actual player blade kill retains the same corpse/profile and authored death',()=>{
  for(const f of [.85,1.15]){
    const {g,e}=fight(f);e.hp=1;assert.equal(attack(g,'slash'),true);ticks(g,20);
    assert.equal(e.hp,0);assert.equal(g.corpses[0],e);assert.equal(e.response.clip,'Death');
    close(e.combatScale,f===.85?1.124125:1.520875);assert.equal(e.bodyScale,1);
  }
});
test('pistol first-hit uses the varied collision radius without changing damage/range',()=>{
  const target=f=>({id:'mob',hp:40,pos:{x:.4,z:3},...mobSizeProfile(base,f)});
  assert.equal(tracePistol({x:0,z:0},{x:0,z:1},[target(.85)],()=>true).targetId,null);
  assert.equal(tracePistol({x:0,z:0},{x:0,z:1},[target(1.15)],()=>true).targetId,'mob');
  assert.equal(tracePistol({x:0,z:0},{x:0,z:1},[target(1.15)],()=>false),null);
});
test('soft target retains cone/LOS and consumes caller supplied size-aware potential reach',()=>{
  const choose=(f,lineClear=()=>true)=>selectCombatTarget({position:{x:0,z:0},aim:{x:0,z:1},
    targets:[{id:'player',hp:150,pos:{x:0,z:1.7}}],range:1.2*mobSizeProfile(base,f).combatScale,lineClear});
  assert.equal(choose(.85),null);assert.equal(choose(1.15).targetId,'player');assert.equal(choose(1.15,()=>false),null);
});
