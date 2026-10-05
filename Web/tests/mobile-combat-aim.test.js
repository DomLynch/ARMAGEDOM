import test from 'node:test';import assert from 'node:assert/strict';
import {createMobileAimState,stepMobileAim,followMobileAngle,mobileStickVector,mobileAimRay} from '../src/mobile-combat-aim.js';
const rad=d=>d*Math.PI/180,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const target=(id='west-3',angle=4,distance=2)=>({id,pos:{x:Math.sin(rad(angle))*distance,z:Math.cos(rad(angle))*distance},radius:.4,hp:40,hostile:true,visible:true,areaId:'westminster'});
const input={mobile:true,moveHeld:true,move:{x:0,z:1},position:{x:0,z:0},targets:[target()],areaId:'westminster',lineClear:()=>true};
const step=(state=createMobileAimState(),extra={})=>stepMobileAim(state,{...input,...extra});
test('13percent radial deadzone and linear strength preserve immediate release',()=>{
 assert.deepEqual(mobileStickVector(13,0,100),{x:0,y:0});near(mobileStickVector(56.5,0,100).x,.5);
 const moving=step().state,out=step(moving,{moveHeld:false});assert.deepEqual(out.move,{x:0,z:0});assert.equal(out.state.targetId,null);assert.equal(out.state.steering,null);
});
test('shortest arc crosses seam with reference exponential rate10/24',()=>{
 const delta=followMobileAngle(rad(179),rad(-179),1/60,10)-rad(179);near(delta,rad(2)*(1-Math.exp(-1/6)));
 const s=step(createMobileAimState(),{targets:[],move:{x:1,z:0}});near(s.state.heading,Math.PI/2*(1-Math.exp(-.4)));
});
test('absolute partial gain and distance2to6 fade never converge raw error away',()=>{
 let state=createMobileAimState();for(let i=0;i<180;i++){const out=step(state);near(out.correction,rad(4)*.4125);near(out.state.rawHeading,0);state=out.state;}
 near(state.heading,rad(4)*.4125);
 near(step(createMobileAimState(),{targets:[target('a',4,4)]}).correction,rad(4)*.4125*.5);
 assert.equal(step(createMobileAimState(),{targets:[target('a',4,6)]}).state.targetId,null);
});
test('stable retained ID survives reorder and is not stolen by aligned competitor',()=>{
 const state=step().state,out=step(state,{targets:[target('other',0),target()]});assert.equal(out.state.targetId,'west-3');
 assert.equal(step(state,{targets:[target(),target('other',0)]}).state.targetId,'west-3');
});
test('bearing travel preserves intentional raw error while held and manual turn-away exits',()=>{
 const state=step().state,moved=step(state,{targets:[target('west-3',10)]});near(moved.state.rawHeading,rad(6));near(moved.correction,rad(4)*.4125);
 const exit=step(state,{deliberateExit:true});assert.equal(exit.state.targetId,null);assert.equal(exit.correction,0);
 let turned=state;for(let i=0;i<10;i++)turned=step(turned,{move:{x:1,z:0}}).state;assert.equal(turned.targetId,null);
});
test('lift cancel death pointer wrongarea hidden friendly LOS missingcallback clear retention',()=>{
 const state=step().state;
 for(const extra of [{moveHeld:false},{cancel:true},{alive:false},{pointerHeading:0},
  {areaId:'east'},{targets:[{...target(),visible:false}]},{targets:[{...target(),hostile:false}]},
  {targets:[{...target(),hp:0}]},{targets:[]},{lineClear:()=>false},{lineClear:undefined}])assert.equal(step(state,extra).state.targetId,null);
 assert.deepEqual(step(state,{cancel:true}).move,{x:0,z:0});
});
test('acquire6 and retain9 use raw heading not assisted body direction',()=>{
 assert.equal(step(createMobileAimState(),{targets:[target('a',6.1)]}).state.targetId,null);
 const state={...createMobileAimState(),targetId:'a',bearing:rad(8),rawHeading:0,heading:rad(8),steering:0,previousMove:0};
 assert.equal(step(state,{targets:[target('a',8)]}).state.targetId,'a');
 assert.equal(step({...state,rawHeading:rad(-2)},{targets:[target('a',8)]}).state.targetId,null);
});
test('selection ties are ID-stable and duplicate/malformed targets cannot lock',()=>{
 assert.equal(step(createMobileAimState(),{targets:[target('z'),target('a')]}).state.targetId,'a');
 assert.equal(step(createMobileAimState(),{targets:[target(),target()]}).state.targetId,null);
 assert.equal(step(createMobileAimState(),{targets:[{...target(),pos:{x:NaN,z:1}}]}).state.targetId,null);
});
test('actual ARM ray target is independent of retainedID and wall callback, including pointblank',()=>{
 const on=target('first',0,.1);assert.equal(mobileAimRay({x:0,z:0},0,[on,target('far',0,3)],()=>true).targetId,'first');
 assert.equal(mobileAimRay({x:0,z:0},0,[target('other',90,2)],()=>true).targetId,null);
 assert.equal(mobileAimRay({x:0,z:0},0,[on],()=>false),null);
});
test('frozen state/cohort inputs untouched; invalid steps reject explicitly',()=>{
 const state=Object.freeze(createMobileAimState()),t=Object.freeze(target());step(state,{targets:Object.freeze([t])});assert.equal(state.targetId,null);
 for(const dt of [-1,NaN,Infinity,.2])assert.throws(()=>step(state,{dt}),RangeError);
});

test('stopped touch aim keeps stateless partial correction without travel retention or feedback drift',()=>{
 let state=createMobileAimState();for(let i=0;i<180;i++){const out=step(state,{moveHeld:false,move:{x:0,z:0}});near(out.state.rawHeading,0);near(out.correction,rad(4)*.4125);assert.equal(out.state.targetId,null);assert.deepEqual(out.move,{x:0,z:0});state=out.state;}
 near(state.heading,rad(4)*.4125);const off=step(createMobileAimState(),{assistEnabled:false});near(off.correction,0);assert.equal(off.state.targetId,null);assert.deepEqual(off.move,{x:0,z:1});
 assert.equal(step(state,{moveHeld:false,lineClear:()=>false}).correction,0);assert.equal(step(state,{moveHeld:false,assistEnabled:false}).correction,0);
});

test('held deadzone keeps prior steering for manual resume and never acquires a new sticky target',()=>{
 const empty=step(createMobileAimState(),{move:{x:0,z:0}});assert.equal(empty.state.targetId,null);assert.equal(empty.correction,0);
 const retained=step().state,center=step(retained,{move:{x:0,z:0}}).state;assert.equal(center.targetId,retained.targetId);near(center.steering,retained.steering);near(center.previousMove,retained.previousMove);
 const resumed=step(center,{move:{x:Math.sin(rad(20)),z:Math.cos(rad(20))}});near(resumed.state.rawHeading,followMobileAngle(0,rad(20),1/60,10));assert.equal(resumed.state.targetId,retained.targetId);
});

test('pistol70percent corrects small medium/long errors into real unchanged circles without raw drift',()=>{
 for(const [distance,error] of [[8,4],[12,3],[14,2.5],[17,2]]){
  const t={...target('far',error,distance),radius:.34};let state=createMobileAimState(),out;
  for(let i=0;i<90;i++){out=step(state,{targets:[t],pistolEquipped:true});state=out.state;near(state.rawHeading,0);near(out.correction,rad(error)*.70);assert.equal(state.targetId,'far');if(i===14)assert.equal(mobileAimRay({x:0,z:0},state.heading,[t],()=>true).targetId,'far','ordinary .25s body convergence reaches actual circle');}
  near(state.heading,rad(error)*.70);assert.equal(mobileAimRay({x:0,z:0},state.heading,[t],()=>true).targetId,'far');const off=step(createMobileAimState(),{targets:[t],pistolEquipped:true,assistEnabled:false});assert.equal(off.correction,0);assert.equal(mobileAimRay({x:0,z:0},off.state.heading,[t],()=>true).targetId,null,'same original circle and raw error miss with assistance Off');
 }
 const t={...target('far',6,17),radius:.34},out=step(createMobileAimState(),{targets:[t],pistolEquipped:true});assert.equal(out.state.targetId,null);assert.equal(out.correction,0);assert.equal(mobileAimRay({x:0,z:0},out.state.heading,[t],()=>true).targetId,null);
});
test('pistol radius-based boundaries preserve retention, intentional escape, range and eligibility',()=>{
 const radius=.34,distance=17,acquire=Math.asin(.60*radius/distance)/.30,retain=Math.asin(.90*radius/distance)/.30;
 const t=angle=>({...target('far',angle*180/Math.PI,distance),radius});
 for(const angle of [acquire,acquire+1e-5])assert.equal(step(createMobileAimState(),{targets:[t(angle)],pistolEquipped:true}).state.targetId,null);
 const state={...createMobileAimState(),targetId:'far',bearing:retain-.001,steering:0,previousMove:0};assert.equal(step(state,{targets:[t(retain-.001)],pistolEquipped:true}).state.targetId,'far');
 assert.equal(step({...state,bearing:retain},{targets:[t(retain)],pistolEquipped:true}).state.targetId,null);
 const valid={...target('far',2,17),radius};for(const extra of [{assistEnabled:false},{lineClear:()=>false},{targets:[{...valid,hp:0}]},{targets:[{...valid,visible:false}]},{areaId:'east'},{cancel:true},{alive:false},{pointerHeading:0},{targets:[{...valid,radius:NaN}]},{targets:[{...valid,radius:0}]},{targets:[{...valid,radius:undefined}]},{targets:[{...valid,radius:-1}]},{targets:[{...valid,pos:{x:0,z:18}}]}])assert.equal(step(createMobileAimState(),{targets:[valid],pistolEquipped:true,...extra}).state.targetId,null);
 const lift=step(createMobileAimState(),{targets:[valid],pistolEquipped:true,moveHeld:false});assert.equal(lift.state.targetId,null);near(lift.correction,rad(2)*.70);
 assert.equal(step(createMobileAimState(),{targets:[valid],pistolEquipped:false}).state.targetId,null);near(step().correction,rad(4)*.4125,'knife correction remains original');
});
