import test from 'node:test';
import assert from 'node:assert/strict';
import {createVestState,isVestState,vestAvailable,collectVest,damageAfterVest,VEST_RULES} from '../src/vest.js';
import {createSuppliesState,issueSupply} from '../src/supplies.js';
const position={x:0,z:0};
const kills=count=>{let state=createSuppliesState();for(const key of ['westminster-roamer-2','westminster-roamer-4','westminster-roamer-6'].slice(0,count))
  state=issueSupply(state,{areaId:'westminster',placementKey:key,position,hp:0}).state;return state;};
const input={supplies:kills(2),areaId:'westminster',position,bagPosition:position,lineClear:()=>true,hp:80};
const collect=(state=createVestState(),extra={})=>collectVest(state,{...input,...extra});

test('one stable vest unlocks after any two existing West keys, including empty kills',()=>{
  const state=createVestState();assert.equal(state.itemId,VEST_RULES.itemId);
  assert.equal(vestAvailable(state,kills(0)),false);assert.equal(vestAvailable(state,kills(1)),false);
  assert.equal(vestAvailable(state,kills(2)),true);assert.equal(vestAvailable(state,kills(3)),true);
  assert.equal(collect(state,{supplies:kills(1)}).reason,'locked');
});
test('existing030 saved issued keys qualify without a new kill or counter',()=>{
  const supplies=JSON.parse(JSON.stringify(kills(2)));
  assert.equal(vestAvailable(createVestState(),supplies),true);
  assert.equal(collect(createVestState(),{supplies}).state.equipped,true);
  assert.deepEqual(supplies,kills(2));
});
test('walk-near equips exactly once; bag remains unavailable after refresh/area return',()=>{
  const state=createVestState();const out=collect(state);
  assert.equal(out.equipped,true);assert.equal(out.state.equipped,true);assert.equal(state.equipped,false);
  assert.equal(vestAvailable(out.state,input.supplies),false);
  const restored=JSON.parse(JSON.stringify(out.state));assert.equal(isVestState(restored),true);
  const duplicate=collect(restored);assert.equal(duplicate.state,restored);assert.equal(duplicate.reason,'already-equipped');
  assert.equal(vestAvailable(restored,kills(3)),false);
});
test('only living player same-area inclusive1.3m LOS can equip',()=>{
  for(const [extra,reason] of [[{hp:0},'dead'],[{areaId:'east'},'wrong-area'],
    [{position:{x:1.3001,z:0}},'out-of-range'],[{lineClear:()=>false},'blocked']]){
    const state=createVestState(),out=collect(state,extra);assert.equal(out.state,state);assert.equal(out.reason,reason);
  }
  assert.equal(collect(createVestState(),{position:{x:1.3,z:0}}).equipped,true);
});
test('malformed ledger, vest state and positions never unlock/equip',()=>{
  const states=[null,{version:2,itemId:VEST_RULES.itemId,equipped:false},
    {version:1,itemId:'other-vest',equipped:false},{version:1,itemId:VEST_RULES.itemId,equipped:1}];
  for(const state of states){assert.equal(isVestState(state),false);assert.equal(vestAvailable(state,input.supplies),false);
    assert.equal(collect(state).reason,'invalid');}
  for(const extra of [{supplies:{version:1,issued:['east-roamer-1','east-roamer-2'],collected:[],pending:[]}},
    {supplies:{...input.supplies,issued:['westminster-roamer-2','westminster-roamer-2']}},
    {position:{x:NaN,z:0}},{bagPosition:{x:Infinity,z:0}},{hp:NaN},{hp:-1},{lineClear:undefined}])
    assert.equal(collect(createVestState(),extra).reason,'invalid');
});
test('equipping preserves frozen inputs and does not heal or change supply/resources',()=>{
  const state=Object.freeze(createVestState()),supplies=kills(2),before=JSON.stringify(supplies);
  Object.freeze(supplies.issued);Object.freeze(supplies.collected);Object.freeze(supplies.pending);Object.freeze(supplies);
  const out=collect(state,{supplies});assert.equal(out.state.equipped,true);assert.equal(state.equipped,false);
  assert.equal(JSON.stringify(supplies),before);assert.deepEqual(Object.keys(out.state).sort(),['equipped','itemId','version']);
  assert.equal(Object.hasOwn(out,'hp'),false);
});
test('10percent applies only to equipped unblocked damage, with normal minimum1',()=>{
  const equipped=collect().state,empty=createVestState();
  for(const [amount,expected] of [[10,9],[9,8.1],[14,12.6],[25,22.5],[1,1],[1.05,1]]){
    assert.equal(damageAfterVest(amount,equipped),expected);
    assert.equal(damageAfterVest(amount,empty),amount);
    assert.equal(damageAfterVest(amount,equipped,{blocked:true}),amount);
  }
});
test('zero stays zero and tiny positives are never increased or made negative',()=>{
  const equipped=collect().state;
  for(const amount of [0,.001,.25,.99])assert.equal(damageAfterVest(amount,equipped),amount);
  assert.equal(damageAfterVest(0,equipped,{blocked:true}),0);
});
test('invalid damage fails explicitly; invalid equipment cannot grant protection',()=>{
  for(const amount of [-1,NaN,Infinity])assert.throws(()=>damageAfterVest(amount,collect().state),RangeError);
  for(const state of [null,{equipped:true},{...collect().state,itemId:'other'}])assert.equal(damageAfterVest(10,state),10);
});
test('no stacking multiplier; fresh Retry resets vest and shared kill eligibility together',()=>{
  const equipped=collect().state;
  assert.equal(damageAfterVest(10,{...equipped,count:99,reduction:1}),9);
  const retry=createVestState();assert.equal(retry.equipped,false);assert.equal(vestAvailable(retry,createSuppliesState()),false);
  assert.equal(damageAfterVest(10,retry),10);assert.equal(equipped.equipped,true);
});
