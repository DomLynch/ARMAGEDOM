import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeometry} from '../src/world-geometry.js';
import {createMovementTrace,movementBoundary} from '../src/engine/movement-trace.js';
function node(){return{style:{},children:[],listeners:new Map(),append(...v){this.children.push(...v)},remove(){this.removed=true},addEventListener(t,f){this.listeners.set(t,f)},removeEventListener(t){this.listeners.delete(t)},getBoundingClientRect(){return{x:0,y:0,width:393,height:695}}};}
function fixture(){
 const doc=node();doc.body=node();doc.createElement=()=>node();const win=node();Object.assign(win,{innerWidth:393,innerHeight:695,devicePixelRatio:3});
 const layout={height:15,distance:20,targetZ:0,fieldOfView:40,road:[{x:.2,y:.9},{x:.8,y:.9},{x:.8,y:.2},{x:.2,y:.2}],blockers:[]},geometry=createGeometry(layout);
 const world={areaId:'westminster',layout,geometry,move:geometry.move,cameraRight:{x:1,z:0},cameraForward:{x:0,z:1},center:{x:.5,y:.5}};
 const s={world,canvas:node(),game:{time:0,player:{pos:geometry.ground({x:.5,y:.6}),radius:.4,hp:128},enemies:[]},input:{state:{stick:{x:.75,y:0}}}};return{s,doc,win};
}
test('disabled trace performs no DOM work or world wrapping',()=>{const s={};assert.equal(createMovementTrace(s,{enabled:false,document:null}),null);assert.deepEqual(s,{});});
test('trace preserves movement results and reports denied full-radius step without changing state',()=>{
 const{s,doc,win}=fixture(),original=s.world.move,trace=createMovementTrace(s,{enabled:true,document:doc,window:win,identity:{version:'109'},capacity:3});
 const intent={move:{x:1,z:0},moveHeld:true,actions:[],held:[]};trace.beforeStep(intent);const start={...s.game.player.pos},delta={x:1,z:0},expected=original(start,delta,.4),actual=s.world.move(s.game.player.pos,delta,.4);assert.deepEqual(actual,expected);assert.deepEqual(s.game.player.pos,start);s.game.player.pos=actual;trace.afterStep();
 s.game.player.pos=s.world.geometry.ground({x:.79,y:.6});trace.beforeStep(intent);const result=s.world.move(s.game.player.pos,{x:20,z:0},.4);s.game.player.pos=result;trace.afterStep();const row=trace.report().rows.at(-1);assert(row.calls[0].boundary);assert.equal(row.calls[0].boundary.clear,false);assert.equal(row.calls[0].radius,.4);assert.equal(row.calls[0].boundary.nearest[0].name,'road');
 trace.beforeStep(intent);trace.afterStep();trace.beforeStep(intent);trace.afterStep();assert.equal(trace.report().rows.length,3);assert(!('supplies' in trace.report()));trace.dispose();assert.equal(s.world.move,original);assert(doc.body.children[0].removed);assert.equal(doc.listeners.size,0);assert.equal(win.listeners.size,0);
});
test('pointer cancellation records coordinates and identity without mutating input or save',()=>{const{s,doc,win}=fixture(),trace=createMovementTrace(s,{enabled:true,document:doc,window:win});doc.listeners.get('pointercancel')({pointerId:7,pointerType:'touch',clientX:22,clientY:33,target:{id:'move'},buttons:0});assert.equal(trace.report().rows[0].type,'pointercancel');assert.deepEqual(s.input.state.stick,{x:.75,y:0});trace.setIdentity({version:'109',sourceCommit:'abc'});assert.equal(trace.report().identity.sourceCommit,'abc');trace.dispose();});
test('boundary diagnostic uses the real radius rather than centre-point clearance',()=>{const{s}=fixture(),p=s.world.geometry.ground({x:.799,y:.6});const r=movementBoundary(s.world,p,.4);assert.equal(r.clear,s.world.geometry.clear(p,.4));assert.equal(r.nearest[0].name,'road');});

test('Retry replacement repaints immediately and report reflects stopped-loop state',()=>{const{s,doc,win}=fixture(),trace=createMovementTrace(s,{enabled:true,document:doc,window:win}),intent={move:{x:1,z:0},moveHeld:true,actions:[],held:[]};s.game.time=20;trace.beforeStep(intent);trace.afterStep();const prior=doc.body.children[0].children[0].textContent;s.game={...s.game,time:.1,player:{...s.game.player,pos:{x:99,z:2}}};trace.beforeStep(intent);trace.afterStep();const line=doc.body.children[0].children[0].textContent;assert.notEqual(line,prior);assert(line.includes('99.00,2.00'));s.paused=true;s.traveling=true;s.contextLost=true;const current=trace.report().current;assert.equal(current.paused,true);assert.equal(current.traveling,true);assert.equal(current.contextLost,true);assert.deepEqual(current.pos,{x:99,z:2});trace.dispose();});

test('copy action is available within the paused modal and removed on disposal',()=>{const{s,doc,win}=fixture(),menu=node();doc.getElementById=id=>id==='menu'?menu:null;const trace=createMovementTrace(s,{enabled:true,document:doc,window:win});assert.equal(menu.children[0].id,'movement-report-copy');assert(menu.children[0].listeners.has('click'));trace.dispose();assert(menu.children[0].removed);assert.equal(menu.children[0].listeners.size,0);});
