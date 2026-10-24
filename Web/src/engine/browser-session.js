import { clearBossRanged } from "./boss-ranged.js";
import { stopRailgun } from "./railgun.js";
import { stopReaper } from "./reaper.js";
import { stopAllBoneSaws, stopBoneSaw } from "./bone-saw.js";
import { stopBossFlames } from "./boss-flame.js";
import { touchGun } from "./touch-target.js";
import { selectedBossRanged } from "./boss-weapon-runtime.js";
import { createMovementTrace } from "./movement-trace.js";
import { applyAreaLighting } from "./area-lighting.js";
import * as THREE from "three";
import { preparePrivateAreaContent, namespacedRunStorage } from "./private-area-content.js";
import { createWorld } from "../world.js";
import { loadActors, createActors } from "../actors.js";
import { createGame, resetMobileControls } from "../combat.js";
import { attachInput } from "../input.js";
import { createHUD } from "../hud.js";
import { createEffects, createAudio } from "../effects.js";
import { createHollowEncounter } from "../hollow-encounter.js";
import { createAtmosphere } from "../atmosphere.js";
import { nextAnimalCycle } from "../animal-cycle.js";
import { createBrowserLoop } from "./loop.js";
import { createAreaLifecycle } from "./areas.js";
import { createRunViews } from "./run-views.js";
import { createJournal } from "./world-events.js";
import { createPresenceSession, presenceConfig } from "./presence-session.js";
import { adoptServerCash, createSaveClient, isRunKey, observeStorage } from "./save-client.js";
import { createGuestAuth } from "./guest-auth.js";
import { mountAccountControl } from "./account-control.js";
import { WORLD_AUTH } from "./world-config.js";
import { readonlyState, eventSnapshot } from "./state.js";
export function createBrowserSession(options = {}) {
  const privateContent = options.privateContent ? preparePrivateAreaContent(options.privateContent) : null;
  let runStorage;
  try {
    runStorage = globalThis.localStorage;
  } catch {
    runStorage = null;
  }
  if (privateContent) runStorage = namespacedRunStorage(runStorage, privateContent.namespace);
  const subscriptions = new Set(),
    listeners = [];
  function listen(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    listeners.push(() => target.removeEventListener(type, handler, opts));
  }
  function emit(events) {
    if (!subscriptions.size) return;
    for (const event of events) {
      const value = eventSnapshot(event);
      for (const listener of [...subscriptions]) listener(value);
    }
  }
  const canvas = options.canvas ?? document.getElementById("world"),
    enter = document.getElementById("enter"),
    baseUrl = options.baseUrl ?? new URL("./", document.baseURI);
  const pilot = {
    pilot: "donor-knife",
    healthRegen: true,
    pistol: true,
    supplies: true,
    vest: true,
    finishers: true,
    rat: true,
    dog: true,
    roach: true,
    drone: true,
    animalVariants: true,
    mobileControls: true,
    areaResidents: true,
    openingGroup: false,
    residentPlacements: privateContent?.residents,
  };
  // Scale bodies and equipped gear independently of camera framing and combat.
  const actorVisualScale = 1.3225;
  // Dom selected preview006: retain enlarged actors without extra scene zoom.
  const viewZoomMultiplier = 1;
  const actorManifest = "assets/manifest-hollow.json";
  let mobileAssistEnabled = true;
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
    travelRecoveryFailed = false,
    traveling = false,
    startup = null,
    focusLost = false,
    disposed = false,
    resetting = false,
    resetWorld = null;
  let loop,
    areas,
    resources,
    presence = null,
    saveClient = null,
    survivorLibrary = null,
    account = null,
    diagnostics = null;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  const hemi = new THREE.HemisphereLight(0xb9bec9, 0x4b3828, 1.6),
    sun = new THREE.DirectionalLight(0xffd7a0, 2.3);
  sun.position.set(-7, 12, 6);
  scene.add(hemi, sun);
  const rim = new THREE.PointLight(0xd4c7a5, 3.2, 5, 2);
  scene.add(rim);
  function pause(value) {
    if (travelRecoveryFailed || resetting) value = true;
    paused = value;
    loop?.reset();
    input?.clear();
    if (game) {
      if (game.player.swing) game.player.swing.turnTo = null;
      game.player.buffer = null;
      game.player.guarding = false;
      game.player.parryUntil = 0;
    }
    if (game?.pistol) resources.cancelPistol(game);
    if (value) {
      clearBossRanged(game);
      stopRailgun(game, "pause");
      actors?.clearRailgunCharge?.();
      stopReaper(game, "pause");
      stopAllBoneSaws(game, "pause");
      stopBossFlames(game, "pause");
      effects?.clearFlameFeedback?.();
      audio.pause();
    }
    if (renderer && loaded) renderer.setAnimationLoop(value ? null : loop.frame);
  }
  const context = {
    // World-event journal of this session's run. Written by the loop and the dispatchers; nothing reads it yet.
    worldJournal: createJournal(),
    failTravelRecovery() {
      travelRecoveryFailed = true;
      pause(true);
    },
    get diagnostics() {
      return diagnostics;
    },
    // The live-world client; null (and never created) unless the presence flag is on.
    get presence() {
      return presence;
    },
    // The loaded model library: the other players' reduced mesh is requested from it. Null until the run has loaded.
    get survivorLibrary() {
      return survivorLibrary;
    },
    get storage() {
      return runStorage;
    },
    get renderer() {
      return renderer;
    },
    get world() {
      return world;
    },
    get actors() {
      return actors;
    },
    get effects() {
      return effects;
    },
    get atmosphere() {
      return atmosphere;
    },
    get game() {
      return game;
    },
    setGame(value) {
      game = value;
    },
    createFreshRun({ reset = false } = {}) {
      const target = reset ? resetWorld : world;
      if (!target) throw Error("Reset destination unavailable");
      return createGame(target, {
        ...pilot,
        residentPlacements: target.residentPlacements ?? pilot.residentPlacements,
        ...(reset ? {} : { animalCycle: nextAnimalCycle(game.animalCycle) }),
      });
    },
    get input() {
      return input;
    },
    get loaded() {
      return loaded;
    },
    get paused() {
      return paused;
    },
    get contextLost() {
      return contextLost || disposed;
    },
    // On by default (Dom, 24 Oct); ?prefetch=0 turns it off for diagnosis.
    prefetchAreas: new URLSearchParams(location.search).get("prefetch") !== "0",
    get scene() {
      return scene;
    },
    get camera() {
      return camera;
    },
    get rim() {
      return rim;
    },
    get canvas() {
      return canvas;
    },
    get audio() {
      return audio;
    },
    get hud() {
      return hud;
    },
    get resetting() {
      return resetting;
    },
    get traveling() {
      return traveling;
    },
    set traveling(v) {
      traveling = v;
      if (v) {
        clearBossRanged(game);
        stopRailgun(game, "travel");
        actors?.clearRailgunCharge?.();
        audio.silenceRailgun?.();
        stopReaper(game, "travel");
        stopAllBoneSaws(game, "travel");
        audio.silenceSaw?.();
      }
    },
    get areas() {
      return areas;
    },
    resetClock() {
      loop?.reset();
    },
    persistRun(g) {
      return resources.persistRun(g);
    },
    dispatchPistol(g, command, canAct) {
      return resources.dispatchPistol(g, command, canAct);
    },
    dispatchRifle(g, command, allowed) {
      return resources.dispatchRifle(g, command, allowed);
    },
    dispatchMarshalPistol(g, request) {
      return resources.dispatchMarshalPistol(g, request);
    },
    dispatchBossEquipment(g, command, allowed) {
      return resources.dispatchBossEquipment(g, command, allowed);
    },
    dispatchFlame(g, command, request, allowed) {
      return resources.dispatchFlame(g, command, request, allowed);
    },
    railgunSource(g) {
      return actors?.railgunSource(g);
    },
    railgunAimPoint(g, id) {
      return actors?.railgunAimPoint(g, id);
    },
    railgunTrace(g, start, end) {
      return actors?.railgunTrace(g, start, end) ?? [];
    },
    reaperSource(g) {
      return actors?.reaperSource(g);
    },
    sawContact(g, actor, target) {
      return actors?.sawContact(g, actor, target) ?? false;
    },
    bossRangedSource(g, e) {
      return actors?.bossRangedSource(g, e);
    },
    bossRangedTrace(g, start, end) {
      return actors?.bossRangedTrace(g, start, end);
    },
    rocketSource(g) {
      return actors?.rocketSource(g);
    },
    grenadeSource(g) {
      return actors?.grenadeSource(g);
    },
    rocketAimHeight(g, start, end, targetId) {
      return actors?.rocketAimHeight(g, start, end, targetId);
    },
    grenadeTrace(g, start, end) {
      return actors?.grenadeTrace(g, start, end);
    },
    grenadeFollow(g, anchor, enemy) {
      return actors?.grenadeFollow(g, anchor, enemy);
    },
    flameSource() {
      return actors?.flameSource();
    },
    bossFlameSource(actor) {
      return actors?.flameSource(actor.id);
    },
    flameAimEligible(g, target) {
      return actors?.flameAimEligible(g, target) ?? false;
    },
    collectNearbySupplies(g, intent) {
      resources.collectNearbySupplies(g, intent);
    },
    collectNearbyVest(g) {
      resources.collectNearbyVest(g);
    },
    updateSupplies() {
      resources.updateSupplies();
    },
    updateVestBag() {
      resources.updateVestBag();
    },
    updateExpedition() {
      resources.updateExpedition();
    },
    cancelPistol(g) {
      resources.cancelPistol(g);
    },
    emit,
  };
  const worldConfig = presenceConfig({ search: location.search, storage: runStorage, location }),
    // Guest-first: Play signs in as an anonymous Supabase user on its own; Google can be linked later from the menu.
    auth = worldConfig ? createGuestAuth({ ...WORLD_AUTH, storage: runStorage }) : null;
  // A3: with the world flag on, every local run save is also queued for the writer (report-only; the server's clamped cash is adopted).
  // The storage is wrapped BEFORE the run views capture it.
  if (worldConfig && !privateContent) {
    saveClient = createSaveClient({
      baseUrl: `${location.origin}/arma/api`,
      getToken: options.presenceToken ?? auth?.getToken,
      storage: runStorage,
      onCash: (reply) => adoptServerCash(context.game, reply),
      log: (line) => console.info(line),
    });
    if (saveClient) runStorage = observeStorage(runStorage, isRunKey, (raw) => saveClient.queue(raw));
  }
  resources = createRunViews(context);
  areas = createAreaLifecycle(context);
  loop = createBrowserLoop(context);
  // Coming back from Google (PKCE): exchange the code only for a link this tab started. A token in the URL hash is never read. The
  // link, code and any hash are always stripped from the address bar afterwards.
  if (auth && (new URLSearchParams(location.search).has("link") || location.hash.includes("access_token="))) {
    const params = new URLSearchParams(location.search),
      returned = location.search;
    for (const name of ["link", "code", "error", "error_code", "error_description"]) params.delete(name);
    const clean = `${location.pathname}${params.size ? `?${params}` : ""}`;
    auth.takeRedirect(returned).finally(() => history.replaceState(null, "", clean));
  }
  presence = createPresenceSession(context, {
    config: worldConfig,
    getToken: options.presenceToken ?? auth?.getToken,
    stats: new URLSearchParams(location.search).get("stats") === "1",
  });
  account = mountAccountControl({ auth });
  const hud = createHUD({
    onAssist: (enabled) => {
      mobileAssistEnabled = enabled;
      if (game) {
        game.mobileAssistEnabled = enabled;
        resetMobileControls(game);
      }
    },
    onFeedback: (mode) => {
      effects?.configureFeedback(mode);
      actors?.configureFeedback(mode);
      audio.setMode?.(mode);
    },
    onRetry: restart,
    onReset: resetGame,
    onPause: pause,
    onPistol: () => {
      if (!loaded || paused || traveling || contextLost || game.finished) return;
      if (resources.interactNearby()) {
        audio.unlock().catch(() => {});
        return;
      }
      input.state.down("pickup", "pickup", { x: 0, y: 0 });
      input.state.up("pickup");
      audio.unlock().catch(() => {});
    },
    onSound: (value) => {
      audio.setEnabled(value);
      if (value) audio.unlock().catch(() => {});
    },
  });
  async function resetGame() {
    if (!loaded || traveling || resetting || contextLost || disposed || travelRecoveryFailed)
      return {
        ok: false,
        message: "Reset is unavailable during travel or recovery. Try again when the game is ready.",
      };
    const owner = game;
    let committed = false;
    resetting = true;
    traveling = true;
    pause(true);
    input.clear();
    areas.stop();
    try {
      const target = await world.prepareArea(world.registry.initialArea);
      if (disposed || contextLost || game !== owner)
        return { ok: false, message: "Reset cancelled because the session changed. The previous run was kept." };
      resetWorld = Object.assign(Object.create(target), { spawn: target.startingPoint() });
      const result = resources.resetRun();
      if (!result.ok)
        return {
          ok: false,
          message:
            "Reset could not save the fresh run. Your current run and saves were kept. Check available storage and try again.",
        };
      // Durable current-schema save shadows all retained legacy records. Reload
      // starts the ordinary Westminster session with no old actors or async owners.
      committed = true;
      traveling = true;
      renderer.setAnimationLoop(null);
      input.clear();
      location.reload();
      return { ok: true, message: "Fresh game saved. Reloading Westminster…" };
    } catch {
      return {
        ok: false,
        message: committed
          ? "Fresh game saved. Reload this page to start in Westminster."
          : "Reset could not prepare Westminster. Your current run and saves were kept. Try again.",
      };
    } finally {
      resetWorld = null;
      if (!committed) {
        traveling = false;
        resetting = false;
        if (game === owner && !disposed && !contextLost) {
          areas.start();
          hud.update(owner);
        }
      }
    }
  }
  async function restart() {
    if (!loaded || traveling || resetting || contextLost || travelRecoveryFailed) return;
    if (world.areaId !== "westminster") {
      if (
        !(await areas.activate({
          areaId: "westminster",
          entryPoint: world.manifest.entries.westminster,
        }))
      )
        return;
    }
    const owner = game;
    traveling = true;
    areas.stop();
    input.clear();
    try {
      // Retry can revive a declared resident whose deferred model was skipped in
      // the saved run. Prepare before the durable retry or any actor replacement.
      await actors.ensureAreaModels(owner, world.areaId, { fresh: true });
      if (disposed || contextLost || game !== owner) return false;
      if (!resources.retry()) {
        game.message = "Run saving unavailable. Retry kept the current run.";
        game.messageUntil = game.time + 5;
        return;
      }
      world.invalidateReadiness();
      input.clear();
      resources.clearSupplies();
      resources.clearVestBag();
      actors.reset();
      effects.reset();
      atmosphere?.reset();
      audio.reset();
      game.mobileAssistEnabled = mobileAssistEnabled;
      world.update(game.player.pos, 0, innerWidth, innerHeight, true);
      actors.update(game, 0);
      game.ratContact = actors.ratContact();
      renderer.render(scene, camera);
      hud.update(game);
      loop?.reset();
      audio.unlock().catch(() => {});
      return true;
    } catch (error) {
      if (!disposed && !contextLost && game === owner) {
        owner.message = "Could not prepare Retry. Your current run was kept. Try again.";
        owner.messageUntil = owner.time + 5;
        hud.update(owner);
      }
      console.error("ARMAGEDOM_RETRY_PREPARATION_FAILED", error);
      return false;
    } finally {
      traveling = false;
      if (loaded && !disposed && !contextLost) {
        requestAnimationFrame(() => areas.start());
        if (!paused) renderer.setAnimationLoop(loop.frame);
      }
    }
  }
  input = attachInput({
    canvas,
    onInteraction: () => audio.unlock().catch(() => {}),
    onMenu: () => {
      hud.toggleMenu();
      if (!paused) audio.unlock().catch(() => {});
    },
    onRetry: restart,
    onReset: resetGame,
    onPickup: () => resources.interactNearby(),
    cycleWeapon: () => resources.cycleWeapon(),
    isPistol: () =>
      !!(game && selectedBossRanged(game)) ||
      !!game?.rifle?.selected ||
      !!game?.pistol?.equipped ||
      !!game?.flame?.equipped,
    isFlame: () => !!game?.flame?.equipped,
    isSelectOnly: () => game?.player.weapon === "railgun",
    isWorldGun: () => !!game && touchGun(game) !== null,
    onTargetClear: () => {
      if (game) {
        stopRailgun(game, "input-clear");
        actors?.clearRailgunCharge?.();
        audio.silenceRailgun?.();
        stopBoneSaw(game, game.player, "input-clear");
        audio.play([{ type: "saw-stop", actor: game.player }]);
        game.touchTarget = null;
        game.touchTargetReady = false;
      }
    },
    isPaused: () => !loaded || paused || traveling || contextLost || game?.finished,
  });
  listen(window, "blur", () => {
    if (game) {
      game.reaperContextPaused = true;
      stopReaper(game, "blur");
    }
  });
  listen(window, "focus", () => {
    if (game) game.reaperContextPaused = document.hidden;
  });
  listen(document, "visibilitychange", () => {
    if (game) {
      game.reaperContextPaused = document.hidden;
      if (document.hidden) stopReaper(game, "hidden");
    }
  });
  listen(document.getElementById("resume"), "click", () => audio.unlock().catch(() => {}));
  listen(document.getElementById("close-menu"), "click", () => audio.unlock().catch(() => {}));
  diagnostics = createMovementTrace(context, {
    enabled: new URLSearchParams(location.search).get("movementTrace") === "1",
  });
  if (diagnostics)
    fetch(new URL("release.json", baseUrl))
      .then((r) => {
        if (!r.ok) throw Error("Build identity unavailable");
        return r.json();
      })
      .then((r) => diagnostics?.setIdentity(r))
      .catch(() => diagnostics?.setIdentity({ version: "Build identity unavailable" }));
  const touchPreview = new URLSearchParams(location.search).get("touch") === "1";
  if (touchPreview) document.body.classList.add("touch");
  function resize() {
    if (renderer) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(innerWidth, innerHeight, false);
      world?.update(game?.player.pos ?? world.spawn, 0, innerWidth, innerHeight, true);
      atmosphere?.update(0, { paused: true });
    }
    input?.clear();
    if (game?.player.swing) game.player.swing.turnTo = null;
    if (game?.pistol) resources.cancelPistol(game);
    loop?.reset();
    hud.resize();
    if (renderer && world && !contextLost) renderer.render(scene, camera);
  }
  listen(window, "resize", resize);
  listen(window, "blur", () => {
    focusLost = true;
    if (loaded && !paused) hud.toggleMenu();
  });
  listen(window, "focus", () => {
    focusLost = false;
  });
  listen(document, "visibilitychange", () => {
    if (document.hidden && loaded && !document.getElementById("menu").open) hud.toggleMenu();
  });
  function prepareEncounter() {
    // Fetch and decode on page arrival, rather than making Enter start every request.
    return (startup ??= Promise.allSettled([
      createWorld({ THREE, scene, camera, baseUrl, viewZoomMultiplier, content: privateContent }),
      loadActors(baseUrl, () => {}, actorManifest),
    ]));
  }
  listen(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    areas.stop();
    world?.dispose();
    actors?.dispose();
    actors = null;
    effects?.dispose();
    effects = null;
    atmosphere?.dispose();
    resources.clearSupplies();
    resources.clearVestBag();
    pause(true);
    loaded = false;
    document.getElementById("entry").hidden = false;
    document.getElementById("hud").hidden = true;
    hud.failed("Graphics paused. Reload this page to restore your fight.");
    enter.textContent = "Reload game";
  });
  listen(canvas, "webglcontextrestored", () => location.reload());
  async function start() {
    if (disposed) return;
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
      if (contextLost || disposed) {
        for (const result of results) if (result.status === "fulfilled") result.value.dispose();
        return;
      }
      if (results.some((r) => r.status === "rejected")) {
        if (results[0].status === "fulfilled") results[0].value.dispose();
        if (results[1].status === "fulfilled") results[1].value.dispose();
        throw results.find((r) => r.status === "rejected").reason;
      }
      const [nextWorld, library] = results.map((r) => r.value);
      const character = library.manifest.models["hollow-scavenger"];
      pilot.encounter = createHollowEncounter({
        rig: "hollow-scavenger",
        weapon: "knife",
        contactRig: character.contactRig,
        bodyScale: character.bodyScale,
      });
      world = nextWorld;
      applyAreaLighting(scene, world);
      pendingLibrary = library;
      game = createGame(world, { ...pilot, residentPlacements: world.residentPlacements ?? pilot.residentPlacements });
      game.mobileAssistEnabled = mobileAssistEnabled;
      resources.restoreSavedRun(game);
      actors = createActors(scene, world, library, {
        visualScale: actorVisualScale,
      });
      await actors.ensureAreaModels(game);
      if (contextLost || disposed) return;
      pendingLibrary = null;
      survivorLibrary = library; // the other players' reduced mesh loads from it on demand
      effects = createEffects(
        scene,
        world,
        library.pistolAsset,
        () =>
          game.bossEquipment?.shotgun?.selected
            ? actors.views.get(0)?.shotgunPose?.muzzle
            : game.rifle?.selected
              ? actors.views.get(0)?.riflePose?.muzzle
              : actors.views.get(0)?.pistolMount?.getObjectByName("Muzzle"),
        {
          hitMarker: document.getElementById("hit-marker"),
          getView: (actor) => actors.views.get(actor.id),
          getFlameSource: () => actors.flameSource(),
        },
      );
      atmosphere = createAtmosphere({ THREE, scene, world });
      actors.update(game, 0);
      game.ratContact = actors.ratContact();
      renderer.setAnimationLoop(loop.frame);
      if (!library.complete)
        throw Error("Enemy exports are still being validated. This private candidate is not a complete fight yet.");
      loaded = true;
      hud.ready();
      if ((focusLost || document.hidden) && !document.getElementById("menu").open) hud.toggleMenu();
      hud.loading("");
      document.getElementById("version").textContent = "Three.js · Starting pistol V1 · Approved006 framing";
      resize();
      renderer.render(scene, camera);
      requestAnimationFrame(() => areas.start());
      const enterToFirstRenderMs = Math.round(performance.now() - start);
      if (!(await audioReady) && audio.state.error) console.warn("ARMAGEDOM_AUDIO_FAILED", audio.state.error);
      if (disposed) return;
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
      if (contextLost || disposed) return;
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
  }
  listen(enter, "click", start);
  if (options.prewarm !== false) prepareEncounter();

  return Object.freeze({
    start,
    input(value) {
      if (!disposed) loop.input(value);
    },
    step(seconds) {
      if (!disposed) loop.step(seconds);
    },
    prepareArea(id) {
      if (disposed || !loaded) return Promise.reject(Error("Session unavailable"));
      return areas.prepare(id);
    },
    activateArea(request) {
      if (disposed || !loaded) return Promise.resolve(false);
      return areas.activate(request);
    },
    state() {
      return readonlyState(game, { areaId: world?.areaId, loaded, paused, traveling, disposed });
    },
    events(listener) {
      if (disposed) throw Error("Session disposed");
      if (typeof listener !== "function") throw new TypeError("Event listener required");
      subscriptions.add(listener);
      return () => subscriptions.delete(listener);
    },
    pause,
    retry: restart,
    dispose() {
      if (disposed) return;
      disposed = true;
      diagnostics?.dispose();
      loaded = false;
      areas.stop();
      renderer?.setAnimationLoop(null);
      loop.reset();
      input?.dispose();
      hud.dispose();
      for (const remove of listeners) remove();
      subscriptions.clear();
      resources.dispose();
      presence?.dispose();
      saveClient?.stop();
      account?.dispose();
      actors?.dispose();
      pendingLibrary?.dispose();
      effects?.dispose();
      atmosphere?.dispose();
      world?.dispose();
      renderer?.dispose();
      audio.dispose?.();
      const pending = startup;
      startup = null;
      if (!loading)
        pending?.then((results) => {
          for (const result of results) if (result.status === "fulfilled") result.value.dispose();
        });
    },
  });
}
