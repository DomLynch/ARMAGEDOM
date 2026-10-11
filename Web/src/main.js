import {pistolPointerPoint} from './pistol-targeting.js';
import * as THREE from "three";
import { createWorld } from "./world.js";
import { loadActors, createActors } from "./actors.js";
import { createGame, stepGame, resetMobileControls, initializeAreaResidents } from "./combat.js";
import {prepareParkedResidents} from './parked-area-preparation.js';
import { attachInput } from "./input.js";
import { createHUD } from "./hud.js";
import { createEffects, createAudio } from "./effects.js";
import { createHollowEncounter } from "./hollow-encounter.js";
import { travelTo } from "./travel.js";
import {createAtmosphere} from "./atmosphere.js";
import {stepPistol} from "./pistol.js";
import {nextAnimalCycle} from './animal-cycle.js';
import {PISTOL_SAVE_KEY,RUN_SAVE_KEY,encodeRun,restoreRun,applySavedRun,commitFreshRun,collectNearbySupplies,collectNearbyVest,VEST_BAG_POSITION} from "./pistol-save.js";
import {createSupplyView} from "./supplies-view.js";
import {createVestBagView} from "./vest-view.js";
import {vestAvailable} from "./vest.js";
let vestBag=null;
function clearVestBag(){vestBag?.dispose();vestBag=null;}
function updateVestBag(){
 const available=!contextLost&&!traveling&&!game.finished&&world.areaId==='westminster'&&vestAvailable(game.vest,game.supplies);
 if(!available){clearVestBag();return;}
 if(!vestBag){vestBag=createVestBagView();scene.add(vestBag.root);vestBag.root.position.copy(world.toRender(VEST_BAG_POSITION));game.message='Supply bag by the pistol stash · Worn vest available.';game.messageUntil=game.time+4;}
 vestBag.update(game.time);
}
let runSaveCache=null;
function persistRun(g){
 if(g.runSaveInvalid)return false;
 const raw=encodeRun(g);if(raw===runSaveCache)return true;
 try{localStorage.setItem(RUN_SAVE_KEY,raw);runSaveCache=raw;return true;}catch{g.message='Run saving unavailable. Supplies kept.';g.messageUntil=g.time+5;return false;}
}
function restoreSavedRun(g){
 try{const raw=localStorage.getItem(RUN_SAVE_KEY),saved=restoreRun(g,raw,raw==null?localStorage.getItem(PISTOL_SAVE_KEY):null);
  if(saved)applySavedRun(g,saved);else{g.runSaveInvalid=true;g.supplies=null;g.player.hp=0;g.finished=true;g.message='Saved run invalid. Retry to start fresh.';g.messageUntil=5;}
 }catch{g.runSaveInvalid=true;g.message='Run saving unavailable. Supplies kept.';g.messageUntil=5;}
 persistRun(g);
}
const supplyViews=new Map();
function updateSupplies(){
 const drops=game?.supplies?.pending.filter(d=>d.areaId===world.areaId)??[],ids=new Set(drops.map(d=>d.id));
 for(const [id,v] of supplyViews)if(!ids.has(id)){v.view.dispose();supplyViews.delete(id);}
 for(const drop of drops){let v=supplyViews.get(drop.id);if(v&&v.remaining!==drop.remaining){v.view.dispose();supplyViews.delete(drop.id);v=null;}
  if(!v){v={remaining:drop.remaining,view:createSupplyView({kind:drop.kind==='rounds'?'ammo':'dressing',count:drop.remaining})};supplyViews.set(drop.id,v);scene.add(v.view.root);}
  v.view.root.position.copy(world.toRender(drop.position));v.view.update(game.time);
 }
}
function clearSupplies(){for(const v of supplyViews.values())v.view.dispose();supplyViews.clear();}
function cancelPistol(g){resetMobileControls(g);actors?.resetFeedback();g.pistolTargetId=null;g.pistolTargetFacing=null;g.pistol=stepPistol(g.pistol,{time:g.time,cancel:true,canAct:false}).state;effects?.clearPistolFeedback();effects?.update(g,{paused:true});}
const canvas = document.getElementById("world"),
  enter = document.getElementById("enter"),
  baseUrl = new URL("./", document.baseURI);
const pilot = { pilot: "donor-knife", pistol: true, supplies: true, vest: true, finishers: true,rat: true, dog: true, roach: true, drone: true, animalVariants: true, mobileControls: true, areaResidents: true, openingGroup: false };
// Scale bodies and equipped gear independently of camera framing and combat.
const actorVisualScale = 1.3225;
// Dom selected preview006: retain enlarged actors without extra scene zoom.
const viewZoomMultiplier = 1;
const actorManifest = "assets/manifest-hollow.json";
let mobileAssistEnabled=true;
const audio = createAudio({ donor: true, baseUrl });
let renderer,
  world,
  actors,
  effects,
  atmosphere,
  game,
  input,
  pendingLibrary,
  loaded = false,
  loading = false,
  paused = false,
  contextLost = false,
  traveling = false,
  travelLatch = false,
  startup = null,
  focusLost = false,
  last = 0,
  accumulator = 0;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera();
const hemi = new THREE.HemisphereLight(0xb9bec9, 0x4b3828, 1.6),
  sun = new THREE.DirectionalLight(0xffd7a0, 2.3);
sun.position.set(-7, 12, 6);
scene.add(hemi, sun);
const rim = new THREE.PointLight(0xd4c7a5, 3.2, 5, 2);
scene.add(rim);
function pause(value) {
  paused = value;
  accumulator = 0;
  last = 0;
  input?.clear();
  if (game) {
    if (game.player.swing) game.player.swing.turnTo = null;
    game.player.buffer = null;
    game.player.guarding = false;
    game.player.parryUntil = 0;
  }
  if (game?.pistol) cancelPistol(game);
  if (value) audio.pause();
  if (renderer && loaded) renderer.setAnimationLoop(value ? null : frame);
}
const hud = createHUD({
  onAssist:enabled=>{mobileAssistEnabled=enabled;if(game){game.mobileAssistEnabled=enabled;resetMobileControls(game);}},
  onFeedback:mode=>{effects?.configureFeedback(mode);actors?.configureFeedback(mode);audio.setMode?.(mode);},
  onRetry: restart,
  onPause: pause,
  onPistol: () => {
    if (!loaded || paused || traveling || contextLost || game.finished) return;
    input.state.down("pickup", "pickup", {x:0,y:0});
    input.state.up("pickup");
    audio.unlock().catch(() => {});
  },
  onSound: (value) => {
    audio.setEnabled(value);
    if (value) audio.unlock().catch(() => {});
  },
});
async function restart() {
  if (!loaded || traveling || contextLost) return;
  if (world.areaId !== "westminster") {
    if (
      !(await crossArea({
        areaId: "westminster",
        entryPoint: world.manifest.entries.westminster,
      }))
    )
      return;
  }
  const fresh=commitFreshRun(game,createGame(world,{...pilot,animalCycle:nextAnimalCycle(game.animalCycle)}),persistRun);
  if(fresh===game){game.message='Run saving unavailable. Retry kept the current run.';game.messageUntil=game.time+5;return;}
  stopAreaPreparation();world.invalidateReadiness();
  input.clear();
  clearSupplies();
  clearVestBag();
  actors.reset();
  effects.reset();
  atmosphere?.reset();
  audio.reset();
  game = fresh;game.mobileAssistEnabled=mobileAssistEnabled;
  world.update(game.player.pos, 0, innerWidth, innerHeight, true);
  actors.update(game, 0);game.ratContact=actors.ratContact();
  renderer.render(scene,camera);
  requestAnimationFrame(()=>startAreaPreparation());
  hud.update(game);
  accumulator = 0;
  audio.unlock().catch(() => {});
}
input = attachInput({
  canvas,
  onInteraction: () => audio.unlock().catch(() => {}),
  onMenu: () => {
    hud.toggleMenu();
    if (!paused) audio.unlock().catch(() => {});
  },
  onRetry: restart,
  isPistol: () => !!game?.pistol?.equipped,
  isPaused: () =>
    !loaded || paused || traveling || contextLost || game?.finished,
});
document
  .getElementById("resume")
  .addEventListener("click", () => audio.unlock().catch(() => {}));
document
  .getElementById("close-menu")
  .addEventListener("click", () => audio.unlock().catch(() => {}));
const touchPreview = new URLSearchParams(location.search).get("touch") === "1";
if (touchPreview) document.body.classList.add("touch");
function resize() {
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    world?.update(game?.player.pos ?? world.spawn, 0, innerWidth, innerHeight);
    atmosphere?.update(0, {paused: true});
  }
  input?.clear();
  if (game?.player.swing) game.player.swing.turnTo = null;
  if (game?.pistol) cancelPistol(game);
  accumulator = 0;
  hud.resize();
  if (renderer && world && !contextLost) renderer.render(scene, camera);
}
window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  focusLost = true;
  if (loaded && !paused) hud.toggleMenu();
});
window.addEventListener("focus", () => {
  focusLost = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && loaded && !document.getElementById("menu").open) hud.toggleMenu();
});
function toDomain(v) {
  return {
    x: v.x * world.cameraRight.x - v.y * world.cameraForward.x,
    z: v.x * world.cameraRight.z - v.y * world.cameraForward.z,
  };
}
function combatVisibleIds() {
  return game.enemies.filter(e => {const v=world.toRender(e.pos,1).project(world.camera);return Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&v.z>=-1&&v.z<=1;}).map(e=>e.id);
}
function intent() {
  const raw = input.take(),
    value = {
      ...raw,
      manualPistolAim: !!raw.fireAim,
      combatVisibleIds: combatVisibleIds(),
      move: toDomain(raw.move),
      aim: game.pistol?.equipped ? raw.fireAim ? toDomain(raw.fireAim) : null : raw.aim ? toDomain(raw.aim) : null,
    };
  if (raw.mouse) {
    const bounds = canvas.getBoundingClientRect(),
      x=((raw.mouse.x-bounds.left)/bounds.width)*2-1,
      y=1-((raw.mouse.y-bounds.top)/bounds.height)*2,
      point=game.pistol?.equipped?pistolPointerPoint(world,actors.views,game.enemies,x,y):world.screenToGround(x,y);
    if (point) {
      value.manualPistolAim = true;
      value.aim = {
        x: point.x - game.player.pos.x,
        z: point.z - game.player.pos.z,
      };
    }
  }
  return value;
}
function frame(ms) {
  const elapsed = last ? Math.max(0, (ms - last) / 1000) : 0, dt = Math.min(0.1, elapsed);
  last = ms;
  if (!world || !game || contextLost) return;
  // Travel holds this frame and simulation. Re-rendering the unchanged rigs
  // consumes the idle budget needed to finish the destination's preparation.
  if(traveling){hud.update(game);return;}
  effects?.advance(elapsed,{paused:paused||traveling});
  if (loaded && !paused && !traveling && !game.finished) {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      const weaponBefore = game.player.weapon;
      stepGame(game, intent(), 1 / 60);
      if (weaponBefore !== game.player.weapon) {input.clear();resetMobileControls(game);}
      collectNearbySupplies(game,persistRun);
      collectNearbyVest(game,persistRun);
      persistRun(game);
      effects.events(game);
      actors?.events(game);
      audio.play(game.events);
      accumulator -= 1 / 60;
      const request = world.travelAt(game.player.pos);
      if (!request) {travelLatch = false;if(areaPreparation){areaPreparation.urgent=null;for(const[id,task]of areaPreparation.tasks)if(task.status==='failed')areaPreparation.tasks.delete(id);}}
      if (request && !travelLatch && game.player.hp>0 && !game.finished && !paused && !contextLost) {
        if(world.isAreaReady(request.areaId)){travelLatch = true;crossArea(request);break;}
        else if(areaPreparation){const state=areaPreparation;state.urgent=request.areaId;if(!state.tasks.has(request.areaId))queueDestination(request.areaId,state).catch(error=>{if(areaPreparation===state&&!state.cancelled){game.message='Could not load that area. Move away and try the exit again.';game.messageUntil=game.time+5;}});if(state.tasks.get(request.areaId)?.status!=='failed'){game.message=`${request.areaId.toUpperCase()} is loading. You can still move or turn back.`;game.messageUntil=game.time+1;}}
      }
      if (game.finished) {
        resetMobileControls(game);
        game.pistolTargetId = null;
        game.pistolTargetFacing = null;
        input.clear();
        break;
      }
    }
  }
  world.update(game.player.pos, paused ? 0 : dt, innerWidth, innerHeight);
  atmosphere?.update(dt, {paused: paused || traveling});
  updateSupplies();
  updateVestBag();
  actors?.update(game, paused || traveling ? 0 : dt, effects?.pistolRecoil(game)??0,{presentationDt:paused||traveling?0:elapsed});
  effects?.update(game,{paused:paused||traveling,visibleIds:combatVisibleIds(),viewportHeight:canvas.clientHeight,viewportWidth:canvas.clientWidth});
  rim.position
    .copy(world.toRender(game.player.pos, 2.4))
    .add(new THREE.Vector3(0, 0, 0.8));
  hud.update(game);
  if(effects)effects.render(renderer,camera,game,canvas.clientHeight,canvas.clientWidth);else renderer.render(scene,camera);
}
async function crossArea(request) {
  const previousArea=world.areaId,keepMovement=world.isAreaReady(request.areaId);
  let accepted=false;
  traveling = true;
  accumulator = 0;
  input.clear({keepMovement});
  if (game.pistol) cancelPistol(game);
  game.message = `Traveling to ${request.areaId.toUpperCase()}…`;
  game.messageUntil = game.time + 4;
  try {
    await prepareDestination(request.areaId);
    await travelTo(game, request);
    if (contextLost) return false;
    effects.reset();
    actors.parkArea(previousArea);actors.activateArea(request.areaId);
    game.events = [];
    world.update(game.player.pos, 0, innerWidth, innerHeight, true);
    atmosphere?.update(0, {paused: true});
    actors.update(game, 0, 0, {restoreCorpses:true});game.ratContact=actors.ratContact();
    console.info(
      "ARMAGEDOM_TRAVEL",
      JSON.stringify({ area: world.areaId, position: game.player.pos }),
    );
    accepted=true;return true;
  } catch (error) {
    console.error("ARMAGEDOM_TRAVEL_FAILED", error);
    game.message =
      "Could not load that area. Move away and try the exit again.";
    game.messageUntil = game.time + 5;
    return false;
  } finally {
    traveling = false;
    input.clear({keepMovement:keepMovement&&accepted});
    resetMobileControls(game);
    accumulator = 0;
    last = 0;
    hud.update(game);
    if (!contextLost) renderer.render(scene, camera);
  }
}
let areaPreparation=null;
function stopAreaPreparation(){const state=areaPreparation;if(!state)return;state.cancelled=true;state.iterator?.return();for(const task of state.tasks.values())task.reject(new Error('Area preparation cancelled'));areaPreparation=null;}
function preparationTurn(state){return new Promise((resolve,reject)=>{
  const deadlineAt=performance.now()+16;
  const check=()=>{if(state.cancelled||game!==state.game||contextLost){reject(new Error('Area preparation cancelled'));return false;}return true;};
  const idle=deadline=>{if(!check())return;if(deadline.didTimeout||performance.now()>=deadlineAt||deadline.timeRemaining()>=4||state.urgent)resolve(state.urgent?12:Math.min(4,Math.max(1,deadline.timeRemaining()-1)));else requestIdleCallback(idle,{timeout:Math.max(1,deadlineAt-performance.now())});};
  // A busy renderer must not starve preparation indefinitely. Timeout grants
  // one small unit of work; it is a scheduling bound, never an area-ready timer.
  if(globalThis.requestIdleCallback)requestIdleCallback(idle,{timeout:16});else requestAnimationFrame(()=>setTimeout(()=>{if(check())resolve(state.urgent?12:4);},0));
});}
function exitDistance(areaId){
  const link=world.manifest.links.find(link=>link.from===world.areaId&&link.to===areaId);if(!link)return Infinity;
  const point=world.geometry.point(game.player.pos),goal={x:point.x,y:point.y};
  for(const[key,value]of Object.entries(link.condition))goal[key[0]]=value;
  const target=world.geometry.ground(goal);return Math.hypot(target.x-game.player.pos.x,target.z-game.player.pos.z);
}
function startAreaPreparation(){
  if(contextLost||!loaded)return;if(areaPreparation?.game===game)return;
  const state=areaPreparation={game,actors,cancelled:false,tasks:new Map(),running:false,iterator:null,stats:{steps:0,cpuMilliseconds:0,maxStepMs:0,areas:{}}};
  world.preparationProgress=state.stats;
  world.prepareArea(world.areaId).catch(()=>{});world.markAreaReady(world.areaId);
  for(const id of ['westminster','east','south'].filter(id=>id!==world.areaId).sort((a,b)=>exitDistance(a)-exitDistance(b)))queueDestination(id,state).catch(error=>{if(!state.cancelled)console.warn('ARMAGEDOM_AREA_PREPARATION',id,error.message);});
}
function queueDestination(areaId,state=areaPreparation){
  if(world.isAreaReady(areaId))return Promise.resolve();
  if(!state||state.cancelled||state.game!==game)throw Error('Area preparation unavailable');
  const existing=state.tasks.get(areaId);if(existing&&existing.status!=='failed')return existing.promise;
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  state.tasks.set(areaId,{areaId,promise,resolve,reject,status:'queued'});pumpDestinations(state);return promise;
}
async function prepareDestination(areaId){if(!areaPreparation)startAreaPreparation();const state=areaPreparation;state.urgent=areaId;try{await queueDestination(areaId,state);}finally{state.urgent=null;}}
async function pumpDestinations(state){
  if(state.running)return;state.running=true;
  try{for(;;){
    const queued=[...state.tasks.values()].filter(t=>t.status==='queued').sort((a,b)=>(a.areaId===state.urgent?-1:b.areaId===state.urgent?1:exitDistance(a.areaId)-exitDistance(b.areaId)));
    if(!queued.length||state.cancelled)return;const task=queued[0];task.status='running';state.current=task.areaId;
    try{
      await preparationTurn(state);const stage=await world.prepareArea(task.areaId);await preparationTurn(state);
      const record=prepareParkedResidents(state.game,stage,initializeAreaResidents),iterator=state.iterator=actors.prepareAreaSteps(task.areaId,record,stage,state.game.finishers);
      let done=false;
      while(!done){const budget=await preparationTurn(state),batchStart=performance.now();do{const started=performance.now(),step=iterator.next(),ms=performance.now()-started;state.stats.steps++;state.stats.cpuMilliseconds+=ms;state.stats.maxStepMs=Math.max(state.stats.maxStepMs,ms);if(!state.stats.worstStep||ms>state.stats.worstStep.ms)state.stats.worstStep={area:task.areaId,label:step.value??'done',ms};done=step.done;}while(!done&&performance.now()-batchStart<budget);}
      state.iterator=null;
      const memory=actors.areaViewStats();if(memory.ownedFinisherGeometryBytes>memory.finisherGeometryBudgetBytes)throw Error('Prepared actor geometry budget exceeded');
      await renderer.compileAsync(stage.scene,stage.camera,scene);await preparationTurn(state);
      const lights=scene.children.filter(o=>o.isLight).map(o=>o.clone());stage.scene.add(...lights);stage.scene.fog=scene.fog;stage.scene.environment=scene.environment;
      const target=new THREE.WebGLRenderTarget(1,1),previousTarget=renderer.getRenderTarget(),started=performance.now();
      try{renderer.setRenderTarget(target);renderer.render(stage.scene,stage.camera);}finally{renderer.setRenderTarget(previousTarget);target.dispose();for(const light of lights)light.removeFromParent();}
      const gl=renderer.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
      try{for(;;){await preparationTurn(state);const result=gl.clientWaitSync(fence,0,0);if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED)break;if(result===gl.WAIT_FAILED||gl.isContextLost())throw Error('Prepared graphics unavailable');}}finally{gl.deleteSync(fence);}
      state.stats.areas[task.areaId]={ready:true,gpuPreparationMs:performance.now()-started};world.markAreaReady(task.areaId);task.status='ready';task.resolve();
    }catch(error){state.iterator?.return();state.iterator=null;if(areaPreparation===state&&game===state.game&&actors===state.actors)state.actors.discardArea(task.areaId);task.status='failed';task.reject(error);}
  }}finally{state.running=false;}
}
function prepareEncounter() {
  // Fetch and decode on page arrival, rather than making Enter start every request.
  return (startup ??= Promise.allSettled([
    createWorld({ THREE, scene, camera, baseUrl, viewZoomMultiplier }),
    loadActors(baseUrl, () => {}, actorManifest),
  ]));
}
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  contextLost = true;
  stopAreaPreparation();world?.dispose();
  actors?.dispose();actors=null;effects?.dispose();effects=null;
  atmosphere?.dispose();
  clearSupplies();
  clearVestBag();
  pause(true);
  loaded = false;
  document.getElementById("entry").hidden = false;
  document.getElementById("hud").hidden = true;
  hud.failed("Graphics paused. Reload this page to restore your fight.");
  enter.textContent = "Reload game";
});
canvas.addEventListener("webglcontextrestored", () => location.reload());
enter.addEventListener("click", async () => {
  if (contextLost) {
    location.reload();
    return;
  }
  if (loading) return;
  loading = true;
  enter.disabled = true;
  enter.textContent = "Loading Westminster…";
  const start = performance.now();
  const audioReady = audio.unlock();
  try {
    renderer ??= new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    resize();
    hud.loading("Loading London and the original character rigs…");
    const results = await prepareEncounter();
    startup = null;
    if (contextLost) {
      for (const result of results)
        if (result.status === "fulfilled") result.value.dispose();
      return;
    }
    if (results.some((r) => r.status === "rejected")) {
      if (results[0].status === "fulfilled") results[0].value.dispose();
      if (results[1].status === "fulfilled") results[1].value.dispose();
      throw results.find((r) => r.status === "rejected").reason;
    }
    const [nextWorld, library] = results.map((r) => r.value);
    const character = library.manifest.models["hollow-scavenger"];
    pilot.encounter = createHollowEncounter({rig: "hollow-scavenger", weapon: "knife", contactRig: character.contactRig, bodyScale: character.bodyScale});
    world = nextWorld;
    pendingLibrary = library;
    game = createGame(world, pilot);game.mobileAssistEnabled=mobileAssistEnabled;
    restoreSavedRun(game);
    actors = createActors(scene, world, library, {
      visualScale: actorVisualScale,
    });
    pendingLibrary = null;
    effects = createEffects(scene, world, library.pistolAsset, () => actors.views.get(0)?.pistolMount?.getObjectByName("Muzzle"),{hitMarker:document.getElementById("hit-marker"),getView:actor=>actors.views.get(actor.id)});
    atmosphere = createAtmosphere({THREE, scene, world});
    actors.update(game, 0);game.ratContact=actors.ratContact();
    renderer.setAnimationLoop(frame);
    if (!library.complete)
      throw Error(
        "Enemy exports are still being validated. This private candidate is not a complete fight yet.",
      );
    loaded = true;
    hud.ready();
    if ((focusLost || document.hidden) && !document.getElementById("menu").open) hud.toggleMenu();
    hud.loading("");
    document.getElementById("version").textContent =
      "Three.js · Starting pistol V1 · Approved006 framing";
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(()=>startAreaPreparation());
    const enterToFirstRenderMs = Math.round(performance.now() - start);
    if (!(await audioReady) && audio.state.error)
      console.warn("ARMAGEDOM_AUDIO_FAILED", audio.state.error);
    console.info(
      "ARMAGEDOM_READY",
      JSON.stringify({
        enterToFirstRenderMs,
        actorScale: world.layout.characterScale,
        actorVisualScale,
        zoom: world.layout.zoom,
        viewZoomMultiplier: world.viewZoomMultiplier,
        models: [...library.models.keys()],
        pilot: game.pilot,
        stamina: game.player.stamina,
        maxStamina: game.player.maxStamina,
        staminaCosts: game.staminaCosts,
        audio: audio.state,
        devicePixelRatio: renderer.getPixelRatio(),
      }),
    );
  } catch (error) {
    console.error("ARMAGEDOM_LOAD_FAILED", error);
    hud.failed(error.message);
    if (!loaded) {
      actors?.dispose();
      pendingLibrary?.dispose();
      pendingLibrary = null;
      effects?.dispose();
      atmosphere?.dispose();
      atmosphere = null;
      world?.dispose();
      actors = effects = world = game = null;
      renderer?.setAnimationLoop(null);
      audio.reset();
    }
  } finally {
    loading = false;
  }
});
prepareEncounter();
