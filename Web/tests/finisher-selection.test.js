import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFinisher} from '../src/finisher-selection.js';
import {createGame,enemy,attack,stepGame} from '../src/combat.js';
const context={victimId:'westminster-roamer-3',lethal:true,weapon:'pistol',impactDirection:{x:3,z:4}};
// Declared test support only, not proof of any shipped clip/art readiness.
const pistol={id:'pistol-directional',clip:'SupportedPistolDeath',seconds:1.2,cost:1,parts:[],prepared:true};
const head={id:'decapitation',clip:'SupportedHeadDeath',seconds:1.6,cost:2,parts:['head'],prepared:true};
const split={id:'split-crown',clip:'SupportedCrownDeath',seconds:1.6,cost:2,parts:['crown'],prepared:true};
const opened={id:'opened',clip:'SupportedWaistDeath',seconds:1.6,cost:2,parts:['upper-body'],prepared:true};
const through={id:'run-through',clip:'SupportedShortThrustDeath',seconds:1.1,cost:1,parts:[],prepared:true};
const support=[pistol,head,split,opened,through];
const choose=(ctx=context,extra={})=>selectFinisher(ctx,{support,budget:4,ordinal:1,...extra});
const cut={...context,weapon:'knife',moveId:'light_right'};

test('no presentation for unconfirmed lethal events or missing/player victim identity',()=>{
  for(const value of [null,{}, {...context,lethal:false},{...context,lethal:1},
    {...context,victimId:0},{...context,victimId:NaN},{...context,victimId:''}])assert.equal(choose(value),null);
});
test('pistol selects only supported ballistic reaction or ordinary, never cutting or thrust',()=>{
  assert.equal(choose().recipeId,'pistol-directional');
  assert.equal(choose(context,{ordinal:0}).recipeId,'ordinary');
  assert.equal(choose(context,{support:[head,split,opened,through]}).recipeId,'ordinary');
  assert.equal(choose({...context,moveId:'thrust'}).recipeId,'pistol-directional');
});
test('cutting can use prepared head/crown/waist recipes but cannot use ballistic/RunThrough',()=>{
  assert.deepEqual([0,1,2,3].map(ordinal=>choose(cut,{ordinal}).recipeId),['ordinary','decapitation','split-crown','opened']);
  for(const moveId of ['light_left','heavy_overhead'])assert.equal(choose({...cut,moveId}).recipeId,'decapitation');
  assert.equal(choose(cut,{support:[pistol,through]}).recipeId,'ordinary');
});
test('RunThrough is restricted to known native knife thrust, not pommel/unknown damage',()=>{
  assert.equal(choose({...cut,moveId:'thrust'}).recipeId,'run-through');
  for(const ctx of [{...cut,moveId:'skill_pommel'},{...cut,moveId:'unknown'},
    {...context,weapon:'blast'},{...context,weapon:'fire'},{...context,weapon:'other'}])assert.equal(choose(ctx).recipeId,'ordinary');
});
test('missing support, preparation, parts, clip or budget falls back without claiming anatomy',()=>{
  for(const row of [{...head,prepared:false},{...head,parts:[]},{...head,parts:['wrong']},
    {...head,clip:''},{...head,seconds:0},{...head,seconds:Infinity},{...head,cost:0},{...head,cost:NaN}])
    assert.equal(choose(cut,{support:[row]}).recipeId,'ordinary');
  for(const budget of [0,1,-1,NaN,Infinity,1.5])assert.equal(choose(cut,{support:[head],budget}).recipeId,'ordinary');
  assert.equal(choose(cut,{support:[head],budget:2}).recipeId,'decapitation');
  assert.equal(choose(context,{support:undefined}).recipeId,'ordinary');
  assert.equal(choose(context,{support:[pistol,pistol]}).recipeId,'ordinary');
});
test('prepared no-part pistol jolt/collapse remains available with exhausted detached-head budget',()=>{
  const ranged={...pistol,clip:'Death',reactionClip:'Hit',seconds:3,cost:0};
  const decap={...head,clip:'Death_SplitCrown',cost:1};
  assert.equal(choose(context,{support:[ranged,decap],budget:0}).recipeId,'pistol-directional');
  assert.equal(choose(cut,{support:[ranged,decap],budget:0}).recipeId,'ordinary');
  assert.equal(choose(cut,{support:[ranged,decap],budget:1}).recipeId,'decapitation');
});
test('deterministic rotation is independent of support order and keeps ordinary in mix',()=>{
  assert.deepEqual([0,1,2,3,4,5].map(ordinal=>choose(context,{ordinal}).recipeId),
    ['ordinary','pistol-directional','ordinary','pistol-directional','ordinary','pistol-directional']);
  assert.deepEqual(choose(cut),choose(cut,{support:[...support].reverse()}));
  assert.equal(choose(cut,{ordinal:-1}).recipeId,'ordinary');assert.equal(choose(cut,{ordinal:NaN}).recipeId,'ordinary');
});
test('immediate repeats are excluded only when genuine eligible alternatives exist',()=>{
  assert.equal(choose(context,{recentRecipeId:'pistol-directional'}).recipeId,'ordinary');
  assert.equal(choose(context,{recentRecipeId:'ordinary',ordinal:0}).recipeId,'pistol-directional');
  assert.equal(choose(context,{recentRecipeId:'ordinary',budget:0}).recipeId,'ordinary');
  assert.notEqual(choose(cut,{recentRecipeId:'decapitation'}).recipeId,'decapitation');
});
test('duplicate death selection reuses the exact corpse outcome despite changed support/budget/context',()=>{
  const first=choose();Object.freeze(first);
  assert.equal(choose({...context,weapon:'knife',moveId:'thrust'},{chosen:first,support:[],budget:0,ordinal:999}),first);
  const other=choose({...context,victimId:'east-roamer-1'},{chosen:first});assert.notEqual(other,first);
  assert.equal(other.victimId,'east-roamer-1');assert.equal(first.victimId,'westminster-roamer-3');
});
test('actual direction is normalized/copied; missing and invalid direction safely choose ordinary',()=>{
  const first=choose();assert.deepEqual(first.impactDirection,{x:.6,z:.8});assert.notEqual(first.impactDirection,context.impactDirection);
  for(const impactDirection of [null,undefined,{x:0,z:0},{x:NaN,z:1},{x:Infinity,z:1}]){
    const out=choose({...context,impactDirection});assert.equal(out.recipeId,'ordinary');assert.equal(out.impactDirection,null);
  }
  assert.deepEqual(choose({...context,impactDirection:{x:-1,z:0}}).impactDirection,{x:-1,z:0});
});
test('unknown hit region stays unknown; explicit actual region is retained without damage inference',()=>{
  assert.equal(choose().hitRegion,null);assert.equal(choose({...context,hitRegion:null}).hitRegion,null);
  assert.equal(choose({...context,hitRegion:'torso'}).hitRegion,'torso');assert.equal(choose({...context,hitRegion:5}).hitRegion,null);
});
test('chosen DTO is compact/serializable and two nearby corpses own independent part state',()=>{
  const a=choose(cut),b=choose({...cut,victimId:'westminster-roamer-4'});
  assert.deepEqual(JSON.parse(JSON.stringify(a)),a);assert.notEqual(a,b);assert.notEqual(a.parts,b.parts);
  a.parts.push('test-only');assert.deepEqual(b.parts,['head']);assert.deepEqual(head.parts,['head']);
  assert.equal(Object.hasOwn(a,'hp'),false);assert.equal(Object.hasOwn(a,'reward'),false);
  assert.equal(Object.hasOwn(a,'timeScale'),false);assert.equal(Object.hasOwn(a,'attackerLock'),false);
});
test('frozen lethal/support inputs remain unchanged and do not acquire world state',()=>{
  const ctx=Object.freeze({...cut,impactDirection:Object.freeze({x:0,z:1})});
  const row=Object.freeze({...head,parts:Object.freeze(['head'])}),rows=Object.freeze([row]);
  assert.equal(selectFinisher(ctx,{support:rows,budget:2,ordinal:1}).recipeId,'decapitation');
  assert.equal(Object.hasOwn(ctx,'chosen'),false);assert.equal(row.prepared,true);
});
test('confirmed native/pistol corpse selection leaves the real once-only kill/reward path intact',()=>{
  const world={areaId:'westminster',spawn:{x:0,z:0},layout:{characterScale:1.3225},
    move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
  for(const weapon of ['knife','pistol']){
    const g=createGame(world,{pilot:'donor-knife',pistol:weapon==='pistol',supplies:true});g.wave=1;g.started=true;
    const victim=Object.assign(enemy(0,{x:0,z:.9}),{rig:'hero',weapon:'knife',bodyScale:1,
      combatScale:1.3225,hp:1,placementKey:'westminster-roamer-3',staggerUntil:100});
    const survivor=Object.assign(enemy(0,{x:20,z:20}),{rig:'hero',weapon:'knife',bodyScale:1,combatScale:1.3225,staggerUntil:100});
    g.enemies=[victim,survivor];const events=[];
    if(weapon==='pistol'){Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,reserve:12});
      stepGame(g,{actions:['fire'],aim:{x:0,z:1}});events.push(...g.events);
    }else{assert.equal(attack(g,'slash'),true);for(let i=0;i<20;i++){stepGame(g);events.push(...g.events);}}
    const deaths=events.filter(e=>e.type==='death');assert.equal(deaths.length,1);assert.equal(deaths[0].actor,victim);
    const shot=events.find(e=>e.type==='shot'),ctx={victimId:victim.id,lethal:victim.hp===0,
      weapon:deaths[0].weapon,moveId:deaths[0].moveId,impactDirection:shot?.direction??g.player.facing};
    const selected=choose(ctx);assert.equal(selected.recipeId,weapon==='pistol'?'pistol-directional':'decapitation');
    const ledger=JSON.stringify(g.supplies);assert.equal(choose(ctx,{chosen:selected,budget:0}),selected);
    assert.equal(g.kills,1);assert.equal(g.corpses.length,1);assert.equal(JSON.stringify(g.supplies),ledger);
    assert.deepEqual(g.supplies.issued,['westminster-roamer-3']);assert.equal(g.supplies.pending.length,1);
    assert.equal(g.enemies[0],survivor);assert.equal(g.finished,false);
  }
});

const gunHead={id:'pistol-decapitation',clip:'Death',seconds:2.733333,cost:1,parts:['head'],prepared:true};
test('cosmetic gun head is scheduled once per five total kills; fallback and repeat policies retain ordinary mix',()=>{
 const rows=[{...pistol,cost:0},gunHead];
 const selected=Array.from({length:20},(_,ordinal)=>choose(context,{support:rows,ordinal}).recipeId);
 assert.deepEqual(selected.map((id,i)=>id==='pistol-decapitation'?i:null).filter(i=>i!==null),[1,6,11,16]);
 for(const ordinal of [1,6,11,16]){
  assert.equal(choose(context,{support:rows,ordinal,budget:0}).recipeId,ordinal%2?'pistol-directional':'ordinary');
  assert.notEqual(choose(context,{support:rows,ordinal,recentRecipeId:'pistol-decapitation'}).recipeId,'pistol-decapitation');
  assert.equal(choose(cut,{support:[gunHead],ordinal}).recipeId,'ordinary');
 }
 const chosen=choose(context,{support:rows,ordinal:1});assert.equal(chosen.hitRegion,null);
 assert.equal(choose(context,{support:[],ordinal:0,budget:0,chosen}),chosen);
 assert.equal(choose({...context,lethal:false},{support:rows,ordinal:1}),null);
 assert.equal(choose({...context,impactDirection:null},{support:rows,ordinal:1}).recipeId,'ordinary');
 for(const row of [{...gunHead,prepared:false},{...gunHead,parts:[]},{...gunHead,seconds:NaN}])
  assert.equal(choose(context,{support:[row],ordinal:1}).recipeId,'ordinary');
});

test('registered-space presentation fallback preserves lethal identity and reconciles cost without mutating selection',async()=>{
 const {withPresentedRecipe}=await import('../src/finisher-selection.js');const chosen={version:1,victimId:7,recipeId:'opened',damageType:'cutting',clip:'Death_SplitCrown',seconds:1,cost:1,parts:['upper-body'],impactDirection:{x:1,z:0},hitRegion:null},before=JSON.stringify(chosen);
 const actual=withPresentedRecipe(chosen,{id:'ordinary',clip:'Death',seconds:2.4,cost:0,parts:[]});assert.equal(actual.victimId,7);assert.equal(actual.damageType,'cutting');assert.deepEqual(actual.impactDirection,chosen.impactDirection);assert.deepEqual([actual.recipeId,actual.clip,actual.seconds,actual.cost,actual.parts],['ordinary','Death',2.4,0,[]]);assert.equal(JSON.stringify(chosen),before);assert.equal(withPresentedRecipe(chosen,{id:'opened'}),chosen);
});
