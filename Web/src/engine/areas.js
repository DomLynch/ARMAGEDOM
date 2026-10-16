import{needsUniqueDeathCommit}from'./unique-reward-runtime.js';
import {applyAreaLighting} from './area-lighting.js';
import {publicAreaRegistry} from '../area-registry.js';
import {warmFramebuffer} from './warm-framebuffer.js';
import {resetMobileControls,initializeAreaResidents} from '../combat.js';
import {prepareParkedResidents} from '../parked-area-preparation.js';
import {travelTo,captureTravelState,restoreTravelState} from '../travel.js';
export function createAreaLifecycle(s){
let travelLatch=false;
async function crossArea(request) {
  if(needsUniqueDeathCommit(s.game)&&s.persistRun?.(s.game)!==true)return false;
  const previousArea=s.world.areaId,keepMovement=s.world.isAreaReady(request.areaId);
  const ownerGame=s.game,ownerActors=s.actors,ownerWorld=s.world;
  const owns=()=>!s.contextLost&&s.loaded&&s.game===ownerGame&&s.actors===ownerActors&&s.world===ownerWorld;
  let accepted=false,recoveryFailed=false,travelState=null,previousPoint=null,actorParkStarted=false,actorActivationStarted=false;const releaseSource=ownerWorld.leaseArea?.(previousArea)??(()=>{});
  s.traveling = true;
  s.resetClock();
  s.input.clear({keepMovement});
  if (s.game.pistol) s.cancelPistol(s.game);
  s.game.message = `Traveling to ${request.areaId.toUpperCase()}…`;
  s.game.messageUntil = s.game.time + 4;
  try {
    s.hud.update(ownerGame);
    // Paint the entry cue before synchronous graphics work.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!owns())return false;
    await prepareDestination(request.areaId);
    if(!owns())return false;
    await prepareGraphics(request.areaId,areaPreparation);
    if(!owns())return false;
    travelState=captureTravelState(ownerGame);previousPoint=ownerWorld.geometry?.point(ownerGame.player.pos)??ownerWorld.registry?.get(previousArea)?.entry;
    const position=await travelTo(ownerGame, request,{isCurrent:owns});
    if(!position||!owns())return false;
    applyAreaLighting(s.scene,s.world);
    s.effects.reset();
    actorParkStarted=true;s.actors.parkArea(previousArea);actorActivationStarted=true;s.actors.activateArea(request.areaId);
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
    if(travelState){
      try{
        if(error.message==='London source recovery failed')throw error;
        if(actorActivationStarted)ownerActors.parkArea(request.areaId);
        if(ownerWorld.areaId!==previousArea)await ownerWorld.loadArea(previousArea,previousPoint);
        if(!owns())return false;
        restoreTravelState(ownerGame,travelState);applyAreaLighting(s.scene,ownerWorld);s.effects.reset();if(actorParkStarted)ownerActors.activateArea(previousArea);
        ownerWorld.update(ownerGame.player.pos,0,innerWidth,innerHeight,true);s.atmosphere?.update(0,{paused:true});ownerActors.update(ownerGame,0,0,{restoreCorpses:true});ownerGame.ratContact=ownerActors.ratContact();
      }catch(recovery){if(!owns())return false;recoveryFailed=true;s.failTravelRecovery?.();console.error('ARMAGEDOM_TRAVEL_RECOVERY_FAILED',recovery);}
    }
    s.game.message =
      recoveryFailed?'Travel recovery failed. Reload the page to continue.':'Could not load that area. Move away and try the exit again.';
    s.game.messageUntil = s.game.time + 5;
    return false;
  } finally {
    releaseSource();s.traveling = false;
    if(owns()){
      s.input.clear({keepMovement:keepMovement&&accepted});
      resetMobileControls(ownerGame);s.resetClock();s.hud.update(ownerGame);s.updateExpedition?.();
      if(!recoveryFailed)s.renderer.render(s.scene,s.camera);
    }
  }
}
let areaPreparation=null;
function stopAreaPreparation(){const state=areaPreparation;if(!state)return;state.cancelled=true;state.iterator?.return();state.iterator=null;for(const task of state.tasks.values()){task.suspended?.iterator.return();task.suspended?.release();task.suspended=null;}for(const task of state.tasks.values())task.reject(new Error('Area preparation cancelled'));areaPreparation=null;}
function preparationTurn(state){return new Promise((resolve,reject)=>{
  const deadlineAt=performance.now()+16;
  const check=()=>{if(state.cancelled||s.game!==state.game||s.contextLost){reject(new Error('Area preparation cancelled'));return false;}return true;};
  // Entry is already announced and paused; idle scheduling can throttle this work.
  if(s.traveling&&state.urgent){setTimeout(()=>{if(check())resolve(12);},0);return;}
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
    let release=task.suspended?.release??(()=>{}),suspended=false;const retainedViews=task.suspended?.retainedViews??(state.actors.areaViewStats().parked?.some(row=>row.area===task.areaId&&row.count>0)??false);
    try{
      let stage,iterator;
      if(task.suspended){({stage,iterator}=task.suspended);task.suspended=null;state.iterator=iterator;}else{
        release=s.world.leaseArea?.(task.areaId)??release;
        await preparationTurn(state);stage=await s.world.prepareArea(task.areaId);await preparationTurn(state);
        const record=prepareParkedResidents(state.game,stage,initializeAreaResidents);await s.actors.ensureAreaModels?.(record,task.areaId);
        if(state.cancelled||s.game!==state.game||s.actors!==state.actors||s.contextLost)throw Error('Area model preparation cancelled');
        iterator=s.actors.prepareAreaSteps(task.areaId,record,stage,state.game.finishers);state.iterator=iterator;
      }
      let done=false;
      while(!done){const budget=await preparationTurn(state),batchStart=performance.now();do{const started=performance.now(),step=iterator.next(),ms=performance.now()-started;state.stats.steps++;state.stats.cpuMilliseconds+=ms;state.stats.maxStepMs=Math.max(state.stats.maxStepMs,ms);if(!state.stats.worstStep||ms>state.stats.worstStep.ms)state.stats.worstStep={area:task.areaId,label:step.value??'done',ms};done=step.done;}while(!done&&performance.now()-batchStart<budget);
        // Switch only between CPU batches; retain partial views and their stage lease.
        if(!done&&state.urgent&&state.urgent!==task.areaId&&state.tasks.get(state.urgent)?.status==='queued'){task.suspended={stage,iterator,release,retainedViews};task.status='queued';suspended=true;break;}
      }
      if(suspended){state.iterator=null;continue;}
      state.iterator=null;
      const memory=s.actors.areaViewStats();if(memory.ownedFinisherGeometryBytes>memory.finisherGeometryBudgetBytes)throw Error('Prepared actor geometry budget exceeded');
      task.status='prepared';task.resolve();
    }catch(error){state.iterator?.return();state.iterator=null;if(areaPreparation===state&&s.game===state.game&&s.actors===state.actors&&!retainedViews)state.actors.discardArea(task.areaId);task.status='failed';task.reject(error);}finally{if(!suspended)release();}
  }}finally{state.running=false;}
}

async function prepareGraphics(areaId,state){
 if(s.world.isAreaReady(areaId))return;
 if(!state||state.cancelled||s.game!==state.game||!s.traveling)throw Error('Area preparation cancelled');
 const task=state.tasks.get(areaId),release=s.world.leaseArea?.(areaId)??(()=>{});
 try{
  const stage=await s.world.prepareArea(areaId);
  if(state.cancelled||s.game!==state.game||s.contextLost||!s.traveling)throw Error('Area preparation cancelled');
  s.actors.bindPreparedArea(areaId,stage.scene);
      await s.renderer.compileAsync(stage.scene,stage.camera,s.scene);await preparationTurn(state);
      const lights=s.scene.children.filter(o=>o.isLight).map(o=>o.clone());stage.scene.add(...lights);applyAreaLighting(stage.scene,stage);stage.scene.fog=s.scene.fog;stage.scene.environment=s.scene.environment;
      const started=performance.now();
      try{await preparationTurn(state);warmFramebuffer(s.renderer,stage.scene,stage.camera);}finally{for(const light of lights)light.removeFromParent();}
      const gl=s.renderer.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
      try{for(;;){await preparationTurn(state);const result=gl.clientWaitSync(fence,0,0);if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED)break;if(result===gl.WAIT_FAILED||gl.isContextLost())throw Error('Prepared graphics unavailable');}}finally{gl.deleteSync(fence);}
      state.stats.areas[areaId]={ready:true,gpuPreparationMs:performance.now()-started};s.world.markAreaReady(areaId);task.status='ready';task.resolve();
 }catch(error){
  // Graphics attempts borrow prepared actors; failures must preserve them.
  task.status='failed';throw error;
 }finally{release();}
}

function checkExit(){
      const request = s.world.travelAt(s.game.player.pos);
      if (!request) {travelLatch = false;if(areaPreparation){areaPreparation.urgent=null;for(const[id,task]of areaPreparation.tasks)if(task.status==='failed')areaPreparation.tasks.delete(id);}}
      if (request && !travelLatch && s.game.player.hp>0 && !s.game.finished && !s.paused && !s.contextLost) {
        travelLatch=true;crossArea(request);return true;
      }
return false;
}
return {start:startAreaPreparation,stop:stopAreaPreparation,prepare:prepareDestination,activate:crossArea,checkExit};
}
