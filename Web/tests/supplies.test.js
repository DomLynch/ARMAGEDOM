import test from 'node:test';
import assert from 'node:assert/strict';
import {AREA1_SUPPLIES,createSuppliesState,issueSupply,collectSupply,isSuppliesState} from '../src/supplies.js';
const position={x:0,z:0};
const resources={hp:80,maxHP:150,pistolOwned:true,reserve:9};
const kill=(state,key='westminster-roamer-1',extra={})=>issueSupply(state,
  {areaId:'westminster',placementKey:key,position,hp:0,...extra});
const collect=(state,extra={})=>collectSupply(state,{dropId:state.pending[0]?.id,
  areaId:'westminster',position,resources,lineClear:()=>true,...extra});

test('exact six stable residents give3/2 rounds and one dressing; others explicitly empty',()=>{
  let state=createSuppliesState();
  for(const key of Object.keys(AREA1_SUPPLIES))state=kill(state,key).state;
  assert.equal(state.issued.length,6);assert.equal(state.pending.length,3);
  assert.deepEqual(state.pending.map(d=>[d.placementKey,d.kind,d.remaining]),[
    ['westminster-roamer-1','rounds',3],['westminster-roamer-3','rounds',2],
    ['westminster-roamer-5','dressing',1]]);
});
test('only actual known Westminster dead residents can issue',()=>{
  const state=createSuppliesState();
  for(const extra of [{hp:1},{hp:NaN},{hp:Infinity},{areaId:'east'},
    {placementKey:'westminster-roamer-7'},{placementKey:'east-roamer-1'},{position:{x:NaN,z:0}}])
    assert.equal(kill(state,undefined,extra).state,state);
  assert.equal(state.issued.length,0);
});
test('same resident issues once before and after collection; identity ignores actor serial',()=>{
  const out=kill(createSuppliesState());
  assert.equal(out.drop.id,'area1-supply-v1:westminster-roamer-1');
  assert.equal(kill(out.state).state,out.state);
  const done=collect(out.state).state;
  assert.equal(kill(done).state,done);assert.equal(done.pending.length,0);
  assert.deepEqual(done.collected,[out.drop.id]);
  assert.equal(collectSupply(done,{dropId:out.drop.id,areaId:'westminster',position,resources,lineClear:()=>true}).award,null);
});
test('rounds require ownership and cap space; denied bundle stays available',()=>{
  const state=kill(createSuppliesState()).state;
  for(const [r,reason] of [[{...resources,pistolOwned:false,reserve:0},'pistol-required'],
    [{...resources,reserve:12},'reserve-full']]){
    const out=collect(state,{resources:r});assert.equal(out.state,state);assert.equal(out.resources,r);
    assert.equal(out.award,null);assert.equal(out.reason,reason);
  }
});
test('partial reserve collection keeps remaining rounds without reissuing bundle',()=>{
  let out=collect(kill(createSuppliesState()).state,{resources:{...resources,reserve:11}});
  assert.equal(out.resources.reserve,12);assert.equal(out.award.amount,1);
  assert.equal(out.state.pending[0].remaining,2);assert.equal(out.state.collected.length,0);
  assert.equal(kill(out.state).state,out.state);
  const full=collect(out.state,{resources:out.resources});assert.equal(full.state,out.state);
  out=collect(out.state,{resources:{...out.resources,reserve:10}});
  assert.equal(out.resources.reserve,12);assert.equal(out.award.amount,2);
  assert.equal(out.state.pending.length,0);assert.equal(out.state.collected.length,1);
});
test('dressing restores20percent maxHP once, clamps excess and waits at full health',()=>{
  const state=kill(createSuppliesState(),'westminster-roamer-5').state;
  const full=collect(state,{resources:{...resources,hp:150}});
  assert.equal(full.state,state);assert.equal(full.reason,'health-full');
  const healed=collect(state);assert.equal(healed.resources.hp,110);assert.equal(healed.award.amount,30);
  assert.equal(healed.resources.reserve,resources.reserve);assert.equal(healed.state.pending.length,0);
  const nearFull=collect(state,{resources:{...resources,hp:149}});
  assert.equal(nearFull.resources.hp,150);assert.equal(nearFull.award.amount,1);
});
test('dressing needs no pistol and cannot resurrect a dead player',()=>{
  const state=kill(createSuppliesState(),'westminster-roamer-5').state;
  assert.equal(collect(state,{resources:{...resources,pistolOwned:false,reserve:0}}).resources.hp,110);
  const dead=collect(state,{resources:{...resources,hp:0}});assert.equal(dead.reason,'dead');assert.equal(dead.state,state);
});
test('walk-near requires same area, inclusive1.3m distance and unobstructed segment',()=>{
  const state=kill(createSuppliesState()).state;
  for(const [extra,reason] of [[{areaId:'east'},'wrong-area'],[{position:{x:1.3001,z:0}},'out-of-range'],
    [{lineClear:()=>false},'blocked']]){
    const out=collect(state,extra);assert.equal(out.reason,reason);assert.equal(out.state,state);
  }
  assert.equal(collect(state,{position:{x:1.3,z:0}}).award.amount,3);
});
test('invalid resources and missing LOS cannot consume rewards',()=>{
  const state=kill(createSuppliesState()).state;
  for(const r of [{...resources,hp:NaN},{...resources,hp:151},{...resources,reserve:13},
    {...resources,reserve:1.5},{...resources,pistolOwned:false}, {...resources,maxHP:0}])
    assert.equal(collect(state,{resources:r}).reason,'invalid');
  assert.equal(collect(state,{lineClear:undefined}).reason,'invalid');
  assert.equal(state.pending[0].remaining,3);
});
test('issued ledger and partial amount survive JSON/area roundtrip; only Retry starts fresh',()=>{
  const issued=kill(createSuppliesState()).state;
  const partial=collect(issued,{resources:{...resources,reserve:11}});
  const saved=JSON.parse(JSON.stringify({version:1,supplies:partial.state,resources:partial.resources}));
  assert.equal(kill(saved.supplies).state,saved.supplies);
  assert.equal(collect(saved.supplies,{areaId:'south',resources:saved.resources}).state,saved.supplies);
  assert.equal(saved.supplies.pending[0].remaining,2);
  const retry=createSuppliesState();assert.deepEqual(retry,{version:1,issued:[],collected:[],pending:[]});
  assert.equal(kill(retry).drop.remaining,3);assert.equal(saved.supplies.pending[0].remaining,2);
});
test('frozen input is preserved; DTO changes reserve/HP only, not magazine/equipment',()=>{
  const state=kill(createSuppliesState()).state;
  Object.freeze(state.pending[0].position);Object.freeze(state.pending[0]);Object.freeze(state.pending);
  Object.freeze(state.issued);Object.freeze(state.collected);Object.freeze(state);
  const r=Object.freeze({...resources,magazine:2,equipped:false});
  const out=collect(state,{resources:r});assert.equal(out.resources.reserve,12);
  assert.equal(out.resources.magazine,2);assert.equal(out.resources.equipped,false);
  assert.equal(r.reserve,9);assert.equal(state.pending.length,1);
});
test('malformed saved ledger fails closed instead of regenerating or overgranting drops',()=>{
  const good=kill(createSuppliesState()).state;
  assert.equal(isSuppliesState(good),true);
  const invalid=[{...good,version:2},{...good,issued:[]},{...good,issued:[...good.issued,...good.issued]},
    {...good,pending:[]},{...good,collected:[good.pending[0].id]},
    {...good,pending:[...good.pending,...good.pending]},
    {...good,pending:[{...good.pending[0],remaining:4}]},
    {...good,pending:[{...good.pending[0],remaining:0}]},
    {...good,pending:[{...good.pending[0],kind:'dressing'}]},
    {...good,pending:[{...good.pending[0],areaId:'east'}]},
    {...good,pending:[{...good.pending[0],position:{x:NaN,z:0}}]},null];
  for(const state of invalid){
    assert.equal(isSuppliesState(state),false);assert.equal(kill(state).state,state);
    const out=collectSupply(state,{areaId:'westminster',dropId:good.pending[0].id,position,resources,lineClear:()=>true});
    assert.equal(out.reason,'invalid');assert.equal(out.state,state);assert.equal(out.award,null);
  }
});
