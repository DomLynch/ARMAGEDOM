import {publicAreaRegistry} from '../area-registry.js';
import {warmFramebuffer} from './warm-framebuffer.js';
import {resetMobileControls,initializeAreaResidents} from '../combat.js';
import {prepareParkedResidents} from '../parked-area-preparation.js';
import {travelTo} from '../travel.js';
export function createAreaLifecycle(s){
let travelLatch=false;
async function crossArea(request) {
  const previousArea=s.world.areaId,keepMovement=s.world.isAreaReady(request.areaId);
  const ownerGame=s.game,ownerActors=s.actors,ownerWorld=s.world;
  const owns=()=>!s.contextLost&&s.loaded&&s.game===ownerGame&&s.actors===ownerActors&&s.world===ownerWorld;
  let accepted=false;
  s.traveling = true;
  s.resetClock();
  s.input.clear({keepMovement});
  if (s.game.pistol) s.cancelPistol(s.game);
  s.game.message = `Traveling to ${request.areaId.toUpperCase()}…`;
  s.game.messageUntil = s.game.time + 4;
  try {
    await prepareDestination(request.areaId);
    if(!owns())return false;
    const position=await travelTo(ownerGame, request,{isCurrent:owns});
    if(!position||!owns())return false;
    s.effects.reset();
    s.actors.parkArea(previousArea);s.actors.activateArea(request.areaId);
    s.game.events = [];
    s.world.update(s.game.player.pos, 0, innerWidth, innerHeight, true);
    s.atmosphere?.update(0, {paused: true});
    s.actors.update(s.game, 0, 0, {restoreCorpses:true});s.game.ratContact=s.actors.ratContact();
    console.info(
      "ARMAGEDOM_TRAVEL",
      JSON.stringify({ area: s.world.areaId, position: s.game.player.pos }),
    );
    accepted=true;if(areaPreparation)queueNeighbours(areaPreparation);return true;
  } catch (error) {
    if(!owns())return false;
    console.error("ARMAGEDOM_TRAVEL_FAILED", error);
    s.game.message =
      "Could not load that area. Move away and try the exit again.";
    s.game.messageUntil = s.game.time + 5;
    return false;
  } finally {
    s.traveling = false;
    if(owns()){
      s.input.clear({keepMovement:keepMovement&&accepted});
      resetMobileControls(ownerGame);s.resetClock();s.hud.update(ownerGame);
      s.renderer.render(s.scene,s.camera);
    }
  }
}
let areaPreparation=null;
function stopAreaPreparation(){const state=areaPreparation;if(!state)return;state.cancelled=true;state.iterator?.return();for(const task of state.tasks.values())task.reject(new Error('Area preparation cancelled'));areaPreparation=null;}
function preparationTurn(state){return new Promise((resolve,reject)=>{
  const deadlineAt=performance.now()+16;
  const check=()=>{if(state.cancelled||s.game!==state.game||s.contextLost){reject(new Error('Area preparation cancelled'));return false;}return true;};
  const idle=deadline=>{if(!check())return;if(deadline.didTimeout||performance.now()>=deadlineAt||deadline.timeRemaining()>=4||state.urgent)resolve(state.urgent?12:Math.min(4,Math.max(1,deadline.timeRemaining()-1)));else requestIdleCallback(idle,{timeout:Math.max(1,deadlineAt-performance.now())});};
  // A busy renderer must not starve preparation indefinitely. Timeout grants
  // one small unit of work; it is a scheduling bound, never an area-ready timer.
  if(globalThis.requestIdleCallback)requestIdleCallback(idle,{timeout:16});else requestAnimationFrame(()=>setTimeout(()=>{if(check())resolve(state.urgent?12:4);},0));
});}
function exitDistance(areaId){
  const link=(s.world.registry?.links(s.world.areaId)??s.world.manifest.links.filter(link=>link.from===s.world.areaId)).find(link=>link.to===areaId);if(!link)return Infinity;
  const point=s.world.geometry.point(s.game.player.pos),goal={x:point.x,y:point.y};
  for(const[key,value]of Object.entries(link.condition))goal[key[0]]=value;
  const target=s.world.geometry.ground(goal);return Math.hypot(target.x-s.game.player.pos.x,target.z-s.game.player.pos.z);
}
function startAreaPreparation(){
  if(s.contextLost||!s.loaded)return;if(areaPreparation?.game===s.game)return;
  const state=areaPreparation={game:s.game,actors:s.actors,cancelled:false,tasks:new Map(),running:false,iterator:null,stats:{steps:0,cpuMilliseconds:0,maxStepMs:0,areas:{}}};
  s.world.preparationProgress=state.stats;
  s.world.prepareArea(s.world.areaId).catch(()=>{});s.world.markAreaReady(s.world.areaId);
  queueNeighbours(state);
}
function queueNeighbours(state){
 for(const id of [...new Set((s.world.registry??publicAreaRegistry).links(s.world.areaId).map(link=>link.to))].sort((a,b)=>exitDistance(a)-exitDistance(b)))queueDestination(id,state).catch(error=>{if(!state.cancelled)console.warn('ARMAGEDOM_AREA_PREPARATION',id,error.message);});
}
function queueDestination(areaId,state=areaPreparation){
  if(s.world.isAreaReady(areaId))return Promise.resolve();
  if(!state||state.cancelled||state.game!==s.game)throw Error('Area preparation unavailable');
  const existing=state.tasks.get(areaId);if(existing&&existing.status!=='failed'&&existing.status!=='ready')return existing.promise;
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  state.tasks.set(areaId,{areaId,promise,resolve,reject,status:'queued'});pumpDestinations(state);return promise;
}
async function prepareDestination(areaId){if(!areaPreparation)startAreaPreparation();const state=areaPreparation;state.urgent=areaId;try{await queueDestination(areaId,state);}finally{state.urgent=null;}}
async function pumpDestinations(state){
  if(state.running)return;state.running=true;
  try{for(;;){
    const queued=[...state.tasks.values()].filter(t=>t.status==='queued').sort((a,b)=>(a.areaId===state.urgent?-1:b.areaId===state.urgent?1:exitDistance(a.areaId)-exitDistance(b.areaId)));
    if(!queued.length||state.cancelled)return;const task=queued[0];task.status='running';state.current=task.areaId;
    let release=()=>{};const retainedViews=state.actors.areaViewStats().parked?.some(row=>row.area===task.areaId&&row.count>0)??false;
    try{
      release=s.world.leaseArea?.(task.areaId)??release;
      await preparationTurn(state);const stage=await s.world.prepareArea(task.areaId);await preparationTurn(state);
      const record=prepareParkedResidents(state.game,stage,initializeAreaResidents),iterator=state.iterator=s.actors.prepareAreaSteps(task.areaId,record,stage,state.game.finishers);
      let done=false;
      while(!done){const budget=await preparationTurn(state),batchStart=performance.now();do{const started=performance.now(),step=iterator.next(),ms=performance.now()-started;state.stats.steps++;state.stats.cpuMilliseconds+=ms;state.stats.maxStepMs=Math.max(state.stats.maxStepMs,ms);if(!state.stats.worstStep||ms>state.stats.worstStep.ms)state.stats.worstStep={area:task.areaId,label:step.value??'done',ms};done=step.done;}while(!done&&performance.now()-batchStart<budget);}
      state.iterator=null;
      const memory=s.actors.areaViewStats();if(memory.ownedFinisherGeometryBytes>memory.finisherGeometryBudgetBytes)throw Error('Prepared actor geometry budget exceeded');
      await s.renderer.compileAsync(stage.scene,stage.camera,s.scene);await preparationTurn(state);
      const lights=s.scene.children.filter(o=>o.isLight).map(o=>o.clone());stage.scene.add(...lights);stage.scene.fog=s.scene.fog;stage.scene.environment=s.scene.environment;
      const started=performance.now();
      try{await preparationTurn(state);warmFramebuffer(s.renderer,stage.scene,stage.camera);}finally{for(const light of lights)light.removeFromParent();}
      const gl=s.renderer.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
      try{for(;;){await preparationTurn(state);const result=gl.clientWaitSync(fence,0,0);if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED)break;if(result===gl.WAIT_FAILED||gl.isContextLost())throw Error('Prepared graphics unavailable');}}finally{gl.deleteSync(fence);}
      state.stats.areas[task.areaId]={ready:true,gpuPreparationMs:performance.now()-started};s.world.markAreaReady(task.areaId);task.status='ready';task.resolve();
    }catch(error){state.iterator?.return();state.iterator=null;if(areaPreparation===state&&s.game===state.game&&s.actors===state.actors&&!retainedViews)state.actors.discardArea(task.areaId);task.status='failed';task.reject(error);}finally{release();}
  }}finally{state.running=false;}
}

function checkExit(){
      const request = s.world.travelAt(s.game.player.pos);
      if (!request) {travelLatch = false;if(areaPreparation){areaPreparation.urgent=null;for(const[id,task]of areaPreparation.tasks)if(task.status==='failed')areaPreparation.tasks.delete(id);}}
      if (request && !travelLatch && s.game.player.hp>0 && !s.game.finished && !s.paused && !s.contextLost) {
        if(s.world.isAreaReady(request.areaId)){travelLatch = true;crossArea(request);return true;}
        else if(areaPreparation){const state=areaPreparation;state.urgent=request.areaId;if(!state.tasks.has(request.areaId)||state.tasks.get(request.areaId).status==='ready')queueDestination(request.areaId,state).catch(error=>{if(areaPreparation===state&&!state.cancelled){s.game.message='Could not load that area. Move away and try the exit again.';s.game.messageUntil=s.game.time+5;}});if(state.tasks.get(request.areaId)?.status!=='failed'){s.game.message=`${request.areaId.toUpperCase()} is loading. You can still move or turn back.`;s.game.messageUntil=s.game.time+1;}}
      }
return false;
}
return {start:startAreaPreparation,stop:stopAreaPreparation,prepare:prepareDestination,activate:crossArea,checkExit};
}
