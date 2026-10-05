import * as THREE from "three";
import { createWorld } from "./world.js";
import { loadActors, createActors } from "./actors.js";
import { createGame, stepGame, resetMobileControls } from "./combat.js";
import { attachInput } from "./input.js";
import { createHUD } from "./hud.js";
import { createEffects, createAudio } from "./effects.js";
import { createHollowEncounter } from "./hollow-encounter.js";
import { travelTo } from "./travel.js";
import {createAtmosphere} from "./atmosphere.js";
import {stepPistol} from "./pistol.js";
import {PISTOL_SAVE_KEY,RUN_SAVE_KEY,encodeRun,restoreRun,applySavedRun,collectNearbySupplies,collectNearbyVest,VEST_BAG_POSITION} from "./pistol-save.js";
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
const pilot = { pilot: "donor-knife", pistol: true, supplies: true, vest: true, finishers: "pistol-only", mobileControls: true, areaResidents: true, openingGroup: false };
// Scale bodies and equipped gear independently of camera framing and combat.
const actorVisualScale = 1.3225;
// Dom selected preview006: retain enlarged actors without extra scene zoom.
const viewZoomMultiplier = 1;
const actorManifest = "assets/manifest-hollow.json";
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
  input.clear();
  clearSupplies();
  clearVestBag();
  actors.reset();
  effects.reset();
  atmosphere?.reset();
  audio.reset();
  game = createGame(world, pilot);
  persistRun(game);
  world.update(game.player.pos, 0, innerWidth, innerHeight, true);
  actors.update(game, 0);
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
      point = world.screenToGround(
        ((raw.mouse.x - bounds.left) / bounds.width) * 2 - 1,
        1 - ((raw.mouse.y - bounds.top) / bounds.height) * 2,
      );
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
      if (!request) travelLatch = false;
      if (request && !travelLatch) {
        travelLatch = true;
        crossArea(request);
        break;
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
  traveling = true;
  accumulator = 0;
  input.clear();
  if (game.pistol) cancelPistol(game);
  game.message = `Traveling to ${request.areaId.toUpperCase()}…`;
  game.messageUntil = game.time + 4;
  try {
    await travelTo(game, request);
    if (contextLost) return false;
    effects.reset();
    actors.reset();
    game.events = [];
    world.update(game.player.pos, 0, innerWidth, innerHeight, true);
    atmosphere?.update(0, {paused: true});
    actors.update(game, 0, 0, {restoreCorpses:true});
    console.info(
      "ARMAGEDOM_TRAVEL",
      JSON.stringify({ area: world.areaId, position: game.player.pos }),
    );
    return true;
  } catch (error) {
    console.error("ARMAGEDOM_TRAVEL_FAILED", error);
    game.message =
      "Could not load that area. Move away and try the exit again.";
    game.messageUntil = game.time + 5;
    return false;
  } finally {
    traveling = false;
    input.clear();
    resetMobileControls(game);
    accumulator = 0;
    last = 0;
    hud.update(game);
    if (!contextLost) renderer.render(scene, camera);
  }
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
    game = createGame(world, pilot);
    restoreSavedRun(game);
    actors = createActors(scene, world, library, {
      visualScale: actorVisualScale,
    });
    pendingLibrary = null;
    effects = createEffects(scene, world, library.pistolAsset, () => actors.views.get(0)?.pistolMount?.getObjectByName("Muzzle"));
    atmosphere = createAtmosphere({THREE, scene, world});
    actors.update(game, 0);
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
