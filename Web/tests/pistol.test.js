import test from 'node:test';
import assert from 'node:assert/strict';
import {PISTOL_RULES as R,createPistolState,collectPistol,equipPistol,stepPistol,tracePistol} from '../src/pistol.js';
const zero={x:0,z:0}, forward={x:0,z:1};
const target=(id,z,x=0,hp=40)=>({id,pos:{x,z},radius:.4,hp});
const context={time:0,areaId:'westminster',position:zero,aim:forward,targets:[target(1,4)],lineClear:()=>true};
const fresh=()=>createPistolState({pickupPos:zero});
const armed=()=>collectPistol(fresh(),context).state;
const shot=(state,time=0,extra={})=>stepPistol(state,{...context,time,fire:true,...extra});

test('pickup is explicit, in-area/in-range, one-time and immutable',()=>{
  const state=fresh();Object.freeze(state);Object.freeze(state.pickupPos);
  for(const input of [{...context,areaId:'east'},{...context,position:{x:2,z:0}}])
    assert.equal(collectPistol(state,input).state,state);
  assert.equal(stepPistol(state,context).state.collected,false);
  const out=stepPistol(state,{...context,collect:true});
  assert.equal(out.state.collected,true);assert.equal(out.state.equipped,true);
  assert.equal(out.state.magazine,6);assert.equal(out.state.reserve,12);
  assert.deepEqual(out.events.map(e=>e.type),['pickup','equip']);
  const spent=shot(out.state).state;
  assert.equal(collectPistol(spent,context).state.magazine,5);
  assert.equal(state.collected,false);
});
test('pickup boundary is inclusive and invalid placement fails',()=>{
  assert.equal(collectPistol(fresh(),{...context,position:{x:R.pickupRadius,z:0}}).state.collected,true);
  assert.equal(collectPistol(fresh(),{...context,position:{x:NaN,z:0}}).state.collected,false);
  assert.throws(()=>createPistolState({pickupPos:{x:Infinity,z:0}}));
});
test('explicit direction chooses ray hit, never nearest off-axis foe',()=>{
  const targets=[target(9,1,1),target(3,7),target(2,4),target(4,-1)];
  const before=JSON.stringify(targets), state=armed();Object.freeze(state);
  const out=shot(state,0,{aim:{x:0,z:9},targets});
  assert.equal(out.events[0].targetId,2);assert.equal(out.events[0].end.z,3.6);
  assert.deepEqual(out.events[0].direction,forward);assert.equal(out.events[0].kind,'bullet');
  assert.equal(out.events[0].parry,false);assert.equal(out.events[0].damage,25);
  assert.equal(JSON.stringify(targets),before);assert.equal(state.magazine,6);
});
test('explicit aim overrides facing; zero aim never auto-targets',()=>{
  const out=shot(armed(),0,{aim:{x:1,z:0},targets:[target(1,4)]});
  assert.equal(out.events[0].targetId,null);assert.equal(out.events[0].end.x,18);
  assert.equal(shot(armed(),0,{aim:zero}).events.length,0);
  assert.equal(shot(armed(),0,{aim:zero}).state.magazine,6);
  assert.equal(shot(armed(),0,{aim:undefined,facing:forward}).events[0].targetId,1);
});
test('wall before enemy stops tracer and damage, near enemy before wall wins',()=>{
  const lineClear=(_a,b)=>b.z<2;
  const blocked=shot(armed(),0,{lineClear});
  assert.equal(blocked.events[0].targetId,null);assert.ok(blocked.events[0].end.z<2);
  assert.ok(blocked.events[0].end.z>1.9999);assert.equal(blocked.state.magazine,5);
  const visible=shot(armed(),0,{lineClear,targets:[target(2,1)]});
  assert.equal(visible.events[0].targetId,2);
});
test('dead, invalid, behind, out-of-range targets cannot absorb bullet',()=>{
  const out=shot(armed(),0,{targets:[target(1,1,0,0),target(2,-2),target(3,19),
    {...target(4,1),radius:NaN},{...target(5,1),pos:{x:NaN,z:1}},target(6,1,0,Infinity)]});
  assert.equal(out.events[0].targetId,null);assert.equal(out.events[0].end.z,18);
});
test('tangent hit and target surface exactly at range are valid',()=>{
  assert.equal(tracePistol(zero,forward,[target(1,4,.4)],()=>true).targetId,1);
  assert.equal(tracePistol(zero,forward,[target(2,18.4)],()=>true).targetId,2);
});
test('invalid direction/obstacle contract cannot spend ammo or damage',()=>{
  for(const extra of [{aim:{x:NaN,z:1}},{position:{x:Infinity,z:0}},
    {lineClear:undefined},{lineClear:()=>false}]) {
    const out=shot(armed(),0,extra);assert.equal(out.events.length,0);assert.equal(out.state.magazine,6);
  }
  assert.throws(()=>shot(armed(),NaN));
});
test('held fire is cadence bounded at fixed ticks and never underflows',()=>{
  let state=armed(),shots=0,dry=0;
  for(let tick=0;tick<600;tick++) {
    const out=shot(state,tick/60);state=out.state;
    shots+=out.events.filter(e=>e.type==='shot').length;
    dry+=out.events.filter(e=>e.type==='dry').length;
  }
  assert.equal(shots,6);assert.equal(state.magazine,0);assert.equal(state.reserve,12);
  assert.equal(dry,3);
});
test('cadence cannot be bypassed by repeated input, holster or cancel',()=>{
  const state=shot(armed()).state;
  assert.equal(shot(state,0).events.length,0);
  const holstered=equipPistol(state,false).state;
  assert.equal(shot(holstered,.1).events.length,0);
  const reequipped=equipPistol(holstered,true).state;
  assert.equal(shot(reequipped,.1).events.length,0);
  assert.equal(shot(stepPistol(reequipped,{time:.1,cancel:true}).state,.1).events.length,0);
  assert.equal(shot(reequipped,R.cadence).events[0].type,'shot');
});
test('reload transfers finite reserve only on completion',()=>{
  const spent=shot(armed()).state;
  const begin=stepPistol(spent,{...context,time:R.cadence,reload:true});
  assert.equal(begin.state.reloadingUntil,R.cadence+R.reload);assert.equal(begin.state.magazine,5);
  assert.equal(begin.state.reserve,12);assert.equal(begin.events[0].type,'reload-start');
  const waiting=shot(begin.state,R.cadence+R.reload-.01);assert.equal(waiting.events.length,0);
  const done=stepPistol(waiting.state,{...context,time:R.cadence+R.reload});
  assert.equal(done.state.magazine,6);assert.equal(done.state.reserve,11);
  assert.equal(done.events[0].type,'reload-complete');
});
test('no reload when full, reserve empty or unequipped; reload beats fire',()=>{
  assert.equal(stepPistol(armed(),{...context,reload:true}).events.length,0);
  assert.equal(stepPistol({...armed(),magazine:0,reserve:0},{...context,reload:true}).events.length,0);
  assert.equal(stepPistol(fresh(),{...context,reload:true,fire:true}).events.length,0);
  const out=stepPistol({...armed(),magazine:0},{...context,reload:true,fire:true});
  assert.deepEqual(out.events.map(e=>e.type),['reload-start']);
});
test('cancel/holster/incapacity wins over same-tick reload completion and fire',()=>{
  const state={...armed(),magazine:0,reloadingUntil:1};
  for(const input of [{cancel:true},{canAct:false},{holster:true}]) {
    const out=stepPistol(state,{...context,time:1,fire:true,...input});
    assert.equal(out.state.magazine,0);assert.equal(out.state.reserve,12);
    assert.equal(out.state.reloadingUntil,0);assert.equal(out.events[0].type,'reload-cancel');
    assert.equal(out.events.some(e=>e.type==='shot'),false);
  }
});
test('area round trip preserves ammo/ownership, Retry creates exactly one fresh drop',()=>{
  const spent=shot(armed()).state;
  const east=stepPistol(spent,{...context,areaId:'east',time:1,collect:true}).state;
  const back=stepPistol(east,{...context,time:2,collect:true}).state;
  assert.equal(back.magazine,5);assert.equal(back.reserve,12);assert.equal(back.collected,true);
  const retry=fresh();assert.equal(retry.collected,false);assert.equal(retry.magazine,0);
  assert.equal(collectPistol(retry,context).state.magazine,6);
});
test('all eighteen granted rounds can be fired, with no reload creating ammo',()=>{
  let state=armed(),fired=0,time=0;
  for(let magazine=0;magazine<3;magazine++) {
    for(let i=0;i<6;i++) {
      const out=shot(state,time);state=out.state;time+=R.cadence;
      fired+=out.events.filter(e=>e.type==='shot').length;
    }
    const reload=stepPistol(state,{...context,time,reload:true});state=reload.state;
    if(magazine<2) {
      time+=R.reload;state=stepPistol(state,{...context,time}).state;
    } else assert.equal(reload.events.length,0);
  }
  assert.equal(fired,18);assert.equal(state.magazine+state.reserve,0);
  assert.equal(shot(state,time).events[0].type,'dry');
});
test('partial final reserve tops up only available rounds',()=>{
  const initial={...armed(),magazine:2,reserve:1};
  const start=stepPistol(initial,{...context,reload:true}).state;
  const done=stepPistol(start,{...context,time:R.reload});
  assert.equal(done.state.magazine,3);assert.equal(done.state.reserve,0);
  assert.equal(done.events[0].rounds,1);
});
test('fire release emits no later shots and cancelled reload needs a new request',()=>{
  const state=shot(armed()).state;
  const release=stepPistol(state,{...context,time:2});
  assert.equal(release.state.magazine,5);assert.equal(release.events.length,0);
  const start=stepPistol(state,{...context,time:R.cadence,reload:true}).state;
  const cancel=stepPistol(start,{...context,time:R.cadence+.1,cancel:true}).state;
  const later=stepPistol(cancel,{...context,time:3});
  assert.equal(later.state.magazine,5);assert.equal(later.state.reserve,12);
  assert.equal(later.events.length,0);
});

test('1.2 second cadence survives rapid tap/repress, cancellation and equip; no early queue',()=>{
 let state=armed();const first=shot(state,0);state=first.state;assert.equal(first.events[0].type,'shot');assert.equal(state.nextFireAt,1.2);
 for(const time of [.01,.1,.3,.6,.9,1,1.2-1e-9]) {
  state=stepPistol(state,{...context,time,fire:false}).state;
  state=stepPistol(state,{...context,time,cancel:true}).state;
  state=equipPistol(equipPistol(state,false).state,true).state;
  const early=shot(state,time);assert.equal(early.events.length,0);assert.equal(early.state.magazine,5);assert.equal(early.state.nextFireAt,1.2);state=early.state;
 }
 const idle=stepPistol(state,{...context,time:1.2});assert.equal(idle.events.length,0);assert.equal(idle.state.magazine,5);
 const next=shot(idle.state,1.2);assert.equal(next.events[0].type,'shot');assert.equal(next.state.magazine,4);assert.equal(next.state.nextFireAt,2.4);
});
test('held fire debits exactly one round per 1.2 seconds and late attempts never catch up in a burst',()=>{
 let state=armed();const times=[];
 for(let tick=0;tick<=400;tick++){const time=tick/60,out=shot(state,time);if(out.events.some(e=>e.type==='shot'))times.push(time);state=out.state;}
 assert.deepEqual(times,[0,1.2,2.4,3.6,4.8,6]);assert.equal(state.magazine,0);assert.equal(state.reserve,12);
 state=shot(armed(),0).state;const late=shot(state,4.5);assert.equal(late.state.magazine,4);assert.equal(late.state.nextFireAt,5.7);assert.equal(shot(late.state,4.5).events.length,0);
});
