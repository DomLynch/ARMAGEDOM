import assert from 'node:assert/strict';
// Narrow173 adapters. Read-only observations; ordinary input only. No legacy imports.
async function bounded(work,ms,label){let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' wall limit exceeded')),Math.max(1,ms));})]);}finally{clearTimeout(timer);}}
function limits(seconds,wallMs){assert(Number.isFinite(seconds)&&seconds>0&&Number.isFinite(wallMs)&&wallMs>0,'finite simulation/wall limits required');}
async function snapshot(page){return page.evaluate(()=>{const q=globalThis.__qa,g=q?.game,p=g?.player,s=g?.pistol;return{time:g?.time,tick:g?.tick,hp:p?.hp,finished:g?.finished,menu:!!document.getElementById('menu')?.open,paused:q?.session?.state().paused??false,visible:document.visibilityState==='visible',area:q?.world?.areaId,pos:p?.pos?{...p.pos}:null,weapon:p?.weapon,pistol:s?{...s}:null,clear:!!p&&q.world.geometry.clear(p.pos,p.radius),swing:!!p?.swing,hurtUntil:p?.hurtUntil,ready:p?.ready,dodgeUntil:p?.dodgeUntil};});}
function ready(s){assert(s.visible&&!s.menu&&!s.paused&&s.hp>0&&!s.finished&&s.clear,'live visible unpaused player on walkable ground required');assert(Number.isFinite(s.time)&&Number.isInteger(s.tick),'actual simulation clock required');}
// Return the existing handle-shaped API without generating/evaluating code strings.
export async function waitSimulation(page,predicate,arg=null,{seconds=6,wallMs=90000,label='gameplay'}={}){
 limits(seconds,wallMs);assert.equal(typeof predicate,'function','inline predicate required');const deadline=Date.now()+wallMs;const remaining=()=>Math.max(1,deadline-Date.now());
 let before,last;try{before=await bounded(()=>snapshot(page),remaining(),label+' observation');for(;;){
  last=await bounded(()=>snapshot(page),remaining(),label+' observation');assert(Number.isFinite(before.time)&&Number.isFinite(last.time)&&Number.isInteger(last.tick),'actual simulation clock required');
  if(Date.now()>=deadline)throw Error(label+' wall limit exceeded');
  const value=await bounded(()=>page.evaluate(predicate,arg),remaining(),label+' predicate');if(Date.now()>=deadline)throw Error(label+' wall limit exceeded');if(value)return{jsonValue:async()=>value,dispose:async()=>{}};
  assert(last.time>=before.time,'simulation reset without acknowledgement');if(last.time-before.time>=seconds)throw Error(label+' simulation deadline exceeded');
  await bounded(()=>new Promise(resolve=>setTimeout(resolve,100)),remaining(),label+' poll');
 }}catch(cause){throw Object.assign(new Error('QA_GAMEPLAY_WAIT: '+cause.message,{cause}),{phase:'acknowledgement',classification:'unknown',label,before,after:last});}
}
async function observed(page,predicate,arg,options){const handle=await waitSimulation(page,predicate,arg,options);try{return await handle.jsonValue();}finally{await handle.dispose();}}
export async function equipPistol(page){
 const before=await bounded(()=>snapshot(page),3000,'pistol observation');ready(before);assert(before.pistol,'actual pistol state required');
 if(!before.pistol.collected)assert(before.area===before.pistol.pickupAreaId&&Math.hypot(before.pos.x-before.pistol.pickupPos.x,before.pos.z-before.pistol.pickupPos.z)<=1.3,'registered pistol pickup out of reach');
 await observed(page,time=>__qa.game.time>time,before.time,{seconds:1,wallMs:3000,label:'pistol live clock'});
 // G is the maintained ordinary pickup/equip binding; already selected is observation only.
 let dispatched=false,error;try{const current=await bounded(()=>snapshot(page),3000,'pistol pre-dispatch');ready(current);
  if(current.weapon!=='pistol'||!current.pistol?.equipped){assert(current.time>=current.ready&&!current.swing&&current.time>=current.hurtUntil&&current.time>=current.dodgeUntil,'pistol action not legal');dispatched=true;await bounded(()=>page.keyboard.press('g'),3000,'pistol G dispatch');}
  const after=await observed(page,()=>{const g=__qa.game;return g.player.weapon==='pistol'&&g.pistol?.collected&&g.pistol.equipped?{time:g.time,weapon:g.player.weapon,pistol:{...g.pistol}}:false;},null,{seconds:3,wallMs:6000,label:'pistol selection'});return{before,after,dispatched};
 }catch(cause){error=Object.assign(new Error('QA_PISTOL_EQUIP: '+cause.message,{cause}),{before,dispatched,classification:'unknown'});try{error.after=await bounded(()=>snapshot(page),1000,'failed equip diagnostic');}catch(cause){error.observationError=String(cause);}throw error;}finally{if(dispatched)try{await bounded(()=>page.keyboard.up('g'),1000,'G release');}catch(cause){if(error)error.releaseError=String(cause);else throw cause;}}
}
export async function aimAt(page,id){
 const before=await bounded(()=>snapshot(page),3000,'aim observation');ready(before);assert(before.weapon==='pistol'&&before.pistol?.equipped,'Pistol aim adapter requires selected pistol');
 const point=await bounded(()=>page.evaluate(id=>{const q=__qa,targets=q.game.enemies.filter(e=>e.id===id&&e.hp>0&&e.visible!==false&&(e.areaId==null||e.areaId===q.world.areaId));if(targets.length!==1)throw Error('one actual live target required');const p=q.world.toRender(targets[0].pos).project(q.world.camera);const point={x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>=innerWidth||point.y>=innerHeight||p.z< -1||p.z>1)throw Error('target feet projection outside viewport');return point;},id),3000,'target observation');
 await observed(page,time=>__qa.game.time>time,before.time,{seconds:1,wallMs:3000,label:'aim live clock'});
 await bounded(()=>page.mouse.move(point.x,point.y),3000,'ordinary aim dispatch');
 const acknowledgement=await observed(page,id=>{const q=__qa,g=q.game,m=q.world.scene.getObjectByName('Pistol aim marker');return g.player.hp>0&&!g.finished&&!document.getElementById('menu')?.open&&g.player.weapon==='pistol'&&g.pistol.equipped&&m?.visible&&m.userData.targetId===id&&m.userData.ready?{targetId:id,time:g.time,ready:true}:false;},id,{seconds:3,wallMs:6000,label:'actual pistol aim cue'});return{...point,before,acknowledgement};
}
function thumbOffset(direction,distance){
 assert(Number.isFinite(distance)&&distance>=0&&[direction.x,direction.y].every(Number.isFinite),'finite movement observation');if(distance<=.24)return{x:0,y:0};const length=Math.hypot(direction.x,direction.y);assert(length>0,'nonzero movement direction');
 const strength=Math.min(1,Math.max(.10,distance/1.2)),radius=46*(.13+.87*strength);return{x:direction.x/length*radius,y:direction.y/length*radius};
}
export async function moveToPoint(page,point,{mode='touch',seconds=8,wallMs=25000}={}){
 assert.equal(mode,'touch','only maintained touch movement supported');assert(point&&['x','y'].every(k=>Number.isFinite(point[k])&&point[k]>=0&&point[k]<=1),'normalized artwork point required');limits(seconds,wallMs);assert(seconds<=8&&wallMs<=25000,'existing movement leg bounds');
 const deadline=Date.now()+wallMs,remaining=()=>Math.max(1,deadline-Date.now()),run=(fn,label)=>bounded(fn,remaining(),label);let before,after,cdp,started=false,error;const samples=[];
 try{before=await run(()=>snapshot(page),'movement observation');ready(before);
  await observed(page,time=>__qa.game.time>time,before.time,{seconds:Math.min(1,seconds),wallMs:remaining(),label:'movement live clock'});
  const pad=await run(()=>page.evaluate(()=>{const nodes=document.querySelectorAll('#move'),el=nodes[0];if(nodes.length!==1||!el||!document.body.classList.contains('touch')||document.visibilityState!=='visible'||document.getElementById('menu')?.open)throw Error('actual visible touch pad required');for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0||p.hasAttribute('inert'))throw Error('touch pad hidden/inert');}const r=el.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(!(r.width>0&&r.height>0)||!document.elementFromPoint(p.x,p.y)?.closest('#move'))throw Error('native contact does not reach pad');return p;}),'touch pad observation');
  cdp=await run(()=>page.context().newCDPSession(page),'touch session');
  for(let n=0;n<180;n++){
   after=await run(()=>snapshot(page),'movement readiness');ready(after);if(after.area!==before.area)return{status:'AREA_CHANGED_BY_ORDINARY_INPUT',before,after,point,samples,started};
   const observation=await run(()=>page.evaluate(point=>{const q=__qa,g=q.game,p=g.player,goal=q.world.geometry.ground(point),dx=goal.x-p.pos.x,dz=goal.z-p.pos.z,a=q.world.cameraRight,b=q.world.cameraForward,det=-a.x*b.z+b.x*a.z;if(!Number.isFinite(det)||Math.abs(det)<.9)throw Error('Movement calibration unavailable');let x=(-b.z*dx+b.x*dz)/det,y=(-a.z*dx+a.x*dz)/det,length=Math.hypot(x,y);if(length){x/=length;y/=length;}return{time:g.time,tick:g.tick,position:{...p.pos},distance:Math.hypot(dx,dz),input:{x,y},goal,clear:q.world.geometry.clear(p.pos,p.radius),targetClear:q.world.geometry.clear(goal,p.radius)};},point),'movement target');samples.push(observation);
   assert(Date.now()<deadline&&observation.time-before.time<seconds,'bounded movement leg deadline');assert(observation.clear&&observation.targetClear,'movement footprint/target not walkable');
   if(observation.distance<.24)return{status:'REACHED_BY_ORDINARY_INPUT',before,after,point,samples,started};
   if(!started){started=true;await run(()=>cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:71,...pad}]}),'touch start');}
   const offset=thumbOffset(observation.input,observation.distance);observation.thumb=offset;await run(()=>cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:71,x:pad.x+offset.x,y:pad.y+offset.y}]}),'touch move');
   await observed(page,prior=>__qa.world.areaId!==prior.area||__qa.game.time-prior.time>=.12,{area:before.area,time:observation.time},{seconds:1,wallMs:Math.min(6000,remaining()),label:'ordinary touch movement clock'});
  }throw Error('Movement sampling limit');
 }catch(cause){error=Object.assign(new Error('QA_MOVEMENT: '+cause.message,{cause}),{before,after,samples,phase:started?'movement':'precondition',dispatched:started,classification:'unknown'});throw error;}
 finally{if(cdp){const releaseErrors=[];if(started)try{await bounded(()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}),1000,'touch release');}catch(cause){releaseErrors.push(String(cause));}try{await bounded(()=>cdp.detach(),1000,'touch detach');}catch(cause){releaseErrors.push(String(cause));}if(releaseErrors.length){if(error)error.releaseErrors=releaseErrors;else throw Object.assign(Error('Movement release failed'),{releaseErrors});}}}
}
