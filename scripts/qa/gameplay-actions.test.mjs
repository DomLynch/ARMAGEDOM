import test from 'node:test';import assert from 'node:assert/strict';
import{waitSimulation,aimAt,equipPistol,moveToPoint}from'./gameplay-actions.mjs';
function fixture(options={}){
 const calls=[],state={time:0,tick:0,hp:150,weapon:'knife',collected:false,equipped:false,menu:false,covered:false,autoAck:true,freeze:false,...options};
 const player={pos:{x:0,z:0},hp:150,radius:.3,ready:0,hurtUntil:0,dodgeUntil:0},pistol={pickupAreaId:'westminster',pickupPos:{x:0,z:0},magazine:8,reserve:24};
 const cue={visible:true,userData:{targetId:null,ready:false}},game={player,pistol,enemies:[{id:7,hp:100,pos:{x:1,z:0}}],finished:false};
 const world={areaId:'westminster',geometry:{clear:()=>!state.blocked,ground:p=>({x:p.x*2,z:p.y*2})},cameraRight:{x:1,z:0},cameraForward:{x:0,z:-1},camera:{},toRender:()=>({project:()=>({x:0,y:0,z:0})}),scene:{getObjectByName:()=>cue}};
 const pad={hidden:false,parentElement:null,hasAttribute:()=>false,getBoundingClientRect:()=>({x:0,y:0,width:100,height:100})},style={display:'block',visibility:'visible',opacity:'1'};
 const document={visibilityState:'visible',body:{classList:{contains:()=>true}},getElementById:()=>({open:state.menu}),querySelectorAll:()=>[pad],elementFromPoint:()=>({closest:()=>state.covered?null:pad})};
 async function evaluate(fn,arg){if(!state.freeze){state.time+=.15;state.tick++;}Object.assign(game,{time:state.time,tick:state.tick});Object.assign(player,{hp:state.hp,weapon:state.weapon});Object.assign(pistol,{collected:state.collected,equipped:state.equipped});const values={__qa:{game,world,session:{state:()=>({paused:!!state.paused})}},document,getComputedStyle:()=>style,innerWidth:393,innerHeight:852},old=new Map();for(const[k,v]of Object.entries(values)){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true});}try{return await fn(arg);}finally{for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
 const page={evaluate,keyboard:{press:async key=>{calls.push(key);if(state.autoAck){state.weapon='pistol';state.collected=state.equipped=true;}},up:async key=>calls.push('up:'+key)},mouse:{move:async(x,y)=>{calls.push({x,y});if(state.autoAck)cue.userData={targetId:7,ready:true};}},context:()=>({newCDPSession:async()=>({send:async(method,arg)=>{calls.push(arg);if(arg.type==='touchMove'){if(state.dispatchFailure)throw Error('touch transport failed');if(state.autoAck)player.pos.x+=.5;}},detach:async()=>calls.push('detach')})})};
 return{page,state,calls,player,pistol,world};
}
test('simulation wait retains value API and rejects bounded false/stalled predicate without dynamic code',async()=>{
 const f=fixture();const h=await waitSimulation(f.page,()=>({ok:true}));assert.deepEqual(await h.jsonValue(),{ok:true});await h.dispose();
 await assert.rejects(waitSimulation(f.page,()=>false,null,{seconds:.1,wallMs:1000}),/simulation deadline/);
 const stalled=fixture({freeze:true});await assert.rejects(waitSimulation(stalled.page,()=>false,null,{seconds:1,wallMs:15}),/wall limit/);
});
test('pistol pickup/equip uses ordinary G once and observes actual selected family; mismatch is not PASS',async()=>{
 const f=fixture(),r=await equipPistol(f.page);assert.equal(r.after.weapon,'pistol');assert.equal(r.dispatched,true);assert.deepEqual(f.calls,['g','up:g']);
 const already=fixture({weapon:'pistol',collected:true,equipped:true});assert.equal((await equipPistol(already.page)).dispatched,false);assert.deepEqual(already.calls,[]);
 const blocked=fixture({menu:true});await assert.rejects(equipPistol(blocked.page));assert.deepEqual(blocked.calls,[]);
 const far=fixture();far.pistol.pickupPos.x=9;await assert.rejects(equipPistol(far.page),/out of reach/);assert.deepEqual(far.calls,[]);
});
test('pistol missing selection acknowledgement fails and releases G',async()=>{
 const f=fixture({autoAck:false});await assert.rejects(equipPistol(f.page),/simulation deadline/);assert.deepEqual(f.calls,['g','up:g']);
});
test('aim binds actual pistol/target, uses FEET projection and actual ready cue',async()=>{
 const wrong=fixture();await assert.rejects(aimAt(wrong.page,7),/selected pistol/);assert.equal(wrong.calls.length,0);
 const missing=fixture({weapon:'pistol',equipped:true,collected:true});await assert.rejects(aimAt(missing.page,8),/live target/);assert.equal(missing.calls.length,0);
 const f=fixture({weapon:'pistol',equipped:true,collected:true});const r=await aimAt(f.page,7);assert.equal(r.acknowledgement.targetId,7);assert.deepEqual(f.calls,[{x:196.5,y:426}]);
});
test('touch movement reuses46px mapping, observes goal and releases held contact/session',async()=>{
 const f=fixture(),r=await moveToPoint(f.page,{x:.5,y:0});assert.equal(r.status,'REACHED_BY_ORDINARY_INPUT');assert.ok(r.samples.length>1);const move=f.calls.find(c=>c.type==='touchMove');assert.ok(Math.abs(move.touchPoints[0].x-50)<=46);assert.equal(f.calls.at(-2).type,'touchEnd');assert.equal(f.calls.at(-1),'detach');
});
test('covered/wrong-mode movement rejects before dispatch, failed dispatch releases without retry',async()=>{
 for(const f of[fixture({covered:true}),fixture({menu:true})]){await assert.rejects(moveToPoint(f.page,{x:.5,y:0}));assert.equal(f.calls.filter(c=>c.type==='touchStart').length,0);}
 const bad=fixture();await assert.rejects(moveToPoint(bad.page,{x:.5,y:0},{mode:'keyboard'}));assert.deepEqual(bad.calls,[]);
 const f=fixture({dispatchFailure:true});await assert.rejects(moveToPoint(f.page,{x:.5,y:0}),/transport failed/);assert.equal(f.calls.filter(c=>c.type==='touchMove').length,1);assert.equal(f.calls.at(-2).type,'touchEnd');assert.equal(f.calls.at(-1),'detach');
});

test('paused/frozen simulation prevents dispatch and missing aim cue remains failed',async()=>{
 const paused=fixture({paused:true});await assert.rejects(moveToPoint(paused.page,{x:.5,y:0}));assert.deepEqual(paused.calls,[]);
 const frozen=fixture({freeze:true});await assert.rejects(moveToPoint(frozen.page,{x:.5,y:0},{seconds:1,wallMs:15}),/wall limit/);assert.deepEqual(frozen.calls,[]);
 const aim=fixture({weapon:'pistol',equipped:true,collected:true,autoAck:false});await assert.rejects(aimAt(aim.page,7),/simulation deadline/);assert.equal(aim.calls.length,1);
});
