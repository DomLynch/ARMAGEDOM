import { clearBossRanged } from "./boss-ranged.js";
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
import { preloadPhysicsDeath, watchCutPrefetch } from "./physics-death.js";
import { createGame, resetMobileControls } from "../combat.js";
import { attachInput } from "../input.js";
import { createHUD } from "../hud.js";
import { createEffects, createAudio } from "../effects.js";
import { createHollowEncounter } from "../hollow-encounter.js";
import { createAtmosphere } from "../atmosphere.js";
import { nextAnimalCycle } from "../animal-cycle.js";
import { createBrowserLoop } from "./loop.js";
import { QUALITY } from "./quality-tier.js";
import { createAreaLifecycle } from "./areas.js";
import { createRunViews } from "./run-views.js";
import { createJournal } from "./world-events.js";
import { createPresenceSession, presenceConfig } from "./presence-session.js";
import { CLOSE_REPLACED } from "./presence-client.js";
import { adoptServerCash, createSaveClient, isRunKey, observeStorage, runIsOver } from "./save-client.js";
import { createWorldGate } from "./world-gate.js";
import { ensureSlotModels } from "./slot-models.js";
import { GAME_DATA } from "./game-data.js";
import { respawnArea } from "./corpse-run.js";
import { sessionText } from "./session-text.js";
import { createGuestAuth } from "./guest-auth.js";
import { installQaBridge } from "./qa-bridge.js";
import { createClientLog, releaseOf } from "./client-log.js";
import { mountAccountControl } from "./account-control.js";
import { WORLD_AUTH } from "./world-config.js";
import { readonlyState, eventSnapshot } from "./state.js";
import { STAGE_AHEAD } from "./stage-ahead.js";
export function createBrowserSession(options = {}) {
  const privateContent = options.privateContent ? preparePrivateAreaContent(options.privateContent) : null;
  let runStorage,
    baseRunStorage = null; // the unwrapped storage: a server record is written here so it is not queued straight back
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
    starVariants: true,
    mobileControls: true,
    areaResidents: true,
    openingGroup: false,
    residentPlacements: privateContent?.residents,
  };
  // Scale bodies and equipped gear independently of camera framing and combat.
  const actorVisualScale = GAME_DATA.browserSession.actorVisualScale;
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
  // Colours are "#rrggbb" in data; three reads them as the same sRGB number the code used to hold (0xb9bec9 ...).
  const lights = GAME_DATA.browserSession.sceneLights,
    startLighting = GAME_DATA.areaRuntime.defaultLighting; // data/areaRuntime.json: the intensities before an area's own lighting applies
  const hemi = new THREE.HemisphereLight(lights.hemiSky, lights.hemiGround, startLighting.fillIntensity),
    sun = new THREE.DirectionalLight(lights.sunColor, startLighting.keyIntensity);
  sun.position.set(...lights.sunPosition);
  scene.add(hemi, sun);
  const rim = new THREE.PointLight(lights.rimColor, lights.rimIntensity, lights.rimDistance, lights.rimDecay);
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
    // The creature slot's deferred models for an area entry (slot-models.js); undefined when nothing has to load.
    ensureSlotModels(areaId) {
      return ensureSlotModels(survivorLibrary, world, areaId);
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
      if (!target) throw Error("Reset destination unavailable"); // text-ok: developer error; resetGame answers with its own message
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
    // Idle preparation of the nearest neighbour area (limits in stage-ahead-data.json); ?stageahead=0 turns it off.
    stageAheadLimits:
      STAGE_AHEAD.enabled && new URLSearchParams(location.search).get("stageahead") !== "0" ? STAGE_AHEAD : null,
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
    // Whether a ground position is inside the camera view plus `margin` (fraction of the view); trap crates respawn only off screen.
    pointOnScreen(position, margin = 0) {
      if (!world) return false;
      camera.updateMatrixWorld();
      const v = world.toRender(position).project(camera),
        limit = 1 + margin;
      return Math.abs(v.x) <= limit && Math.abs(v.y) <= limit && v.z < 1;
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
    updateHeatTally() {
      resources.updateHeatTally();
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
    listen, // the session's DOM-owner registry: dispose() releases whatever the loop registers through it
  };
  // The online world is ON by default but starts only after the server's status read says it is open (worldGate below); ?world=0 turns
  // it off for this page load. The storage is wrapped BEFORE the run views capture it: it only passes writes through, and queues the
  // local run save for the writer once the save client exists.
  const worldConfig = presenceConfig({ search: location.search, location });
  if (worldConfig && !privateContent) {
    baseRunStorage = runStorage;
    runStorage = observeStorage(runStorage, isRunKey, (raw) => {
      // Stash and airdrop cash noted since the last write goes to the server first, so the save below finds it credited.
      for (const claim of context.game?.cashClaims?.splice(0) ?? []) saveClient?.claimPickup(claim.source, claim.amount);
      saveClient?.queue(raw, context.game, { urgent: runIsOver(context.game) });
    });
  }
  resources = createRunViews(context);
  areas = createAreaLifecycle(context);
  loop = createBrowserLoop(context);
  // Nothing online exists until the status read says the world is open: no guest signup, no presence socket, no save traffic.
  const worldGate = worldConfig && !privateContent ? createWorldGate({ baseUrl: location.origin }) : null;
  // The OAuth return parameters never stay in the address bar, whether or not the world starts: keep the query for the code exchange,
  // then strip link, code, the error fields and any #access_token hash at load.
  let returnedSearch = null;
  {
    const params = new URLSearchParams(location.search);
    if (params.has("link") || params.has("code") || location.hash?.includes("access_token=")) {
      returnedSearch = location.search;
      for (const name of ["link", "code", "error", "error_code", "error_description"]) params.delete(name);
      history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    }
  }
  let loadAttempt = 0, // failed attempts so far: a retry uses fresh URLs (see start())
    lastLoadProgress = 0, // when a model last finished loading (the stall watchdog in start() reads it)
    beacon = null, // the client error beacon (engine/client-log.js), made at boot on the online path, before any network step
    worldStarted = false,
    runRestored = false, // set when the game reads the saved run: a server record that arrives later is not applied
    bootPull = Promise.resolve(),
    syncedNotice = false;
  // The error beacon exists from boot, before the status read or any other network step, so a boot failure or an offline start is
  // reported too (a closed world still silences it: recheckWorld pauses it). Each page load has its own random session id.
  if (worldGate) {
    beacon = createClientLog({
      baseUrl: location.origin,
      release: releaseOf(location.pathname),
      getArea: () => world?.areaId ?? "",
    });
    listeners.push(beacon.install(window), () => beacon.stop());
  }
  function startWorld() {
    if (worldStarted || disposed) return;
    worldStarted = true;
    // Guest-first: Play signs in as an anonymous Supabase user on its own; Google can be linked later from the menu.
    const auth = createGuestAuth({
      ...WORLD_AUTH,
      storage: runStorage,
      onError: (error) => beacon?.report("boot", `auth-${error?.status ?? "network"}`, error),
    });
    // Coming back from Google (PKCE): exchange the code only for a link this tab started. A token in the URL hash is never read.
    if (returnedSearch !== null) auth.takeRedirect(returnedSearch);
    const source = options.presenceToken ?? auth.getToken;
    const getToken = async () => {
      const token = await source();
      if (!token) beacon.report("boot", "no-token");
      return token;
    };
    // A3: every local run save is also queued for the writer (report-only; the server's clamped cash is adopted).
    saveClient = createSaveClient({
      baseUrl: `${location.origin}/arma/api`,
      getToken,
      storage: runStorage,
      onCash: (reply, info) => adoptServerCash(context.game, reply, info),
      onClosed: () => recheckWorld(),
      log: (line) => {
        console.info(line);
        if (/not saved|error:|refused/.test(line)) beacon.report("sync", "save", line);
      },
    });
    // The server save wins when it is online: a newer server record replaces the local run BEFORE the run is read (Enter waits for
    // this, at most bootSyncWaitMs). Unreachable or closed: play local; the queue sends it later.
    bootPull = saveClient
      .pull({ target: baseRunStorage ?? runStorage, canApply: () => !runRestored })
      .then((result) => {
        syncedNotice = result.status === "applied";
        if (result.status === "offline") beacon.report("sync", "pull-offline");
        if (result.reason === "late" || result.reason === "storage") beacon.report("sync", `pull-${result.reason}`);
      })
      .catch((error) => beacon.report("sync", "pull-failed", error));
    presence = createPresenceSession(context, {
      config: worldConfig,
      getToken,
      stats: new URLSearchParams(location.search).get("stats") === "1",
    });
    presence?.client.on("closed", () => recheckWorld());
    // A normal close, a replaced session and the server's own "closed" codes are not failures worth a row; everything else is.
    presence?.client.on("close", ({ code }) => {
      if (![1000, 1001, CLOSE_REPLACED].includes(code) && !GAME_DATA.world.closedCloseCodes.includes(code)) // tuning-ok: WebSocket normal-close codes
        beacon.report("presence", `close-${code ?? "none"}`);
    });
    presence?.client.on("refuse", ({ reason }) => beacon.report("presence", `refuse-${reason ?? "none"}`));
    account = mountAccountControl({ auth });
  }
  // A status read (never faster than data/world.json recheckMinMs). A FRESH "open" starts the world, or lets a halted save loop and a
  // presence client that the server closed try again.
  async function recheckWorld() {
    if (!worldGate) return;
    const before = worldGate.reads,
      open = await worldGate.check();
    // A fresh status read decides whether the beacon may talk: closed means silence, open again means it may report again.
    if (worldGate.reads !== before) {
      if (open) beacon?.resume();
      else beacon?.pause();
    }
    if (!open || worldGate.reads === before || disposed) return;
    startWorld();
    saveClient?.resume();
    presence?.client.reopen();
  }
  let worldBoot = Promise.resolve();
  if (worldGate) {
    worldBoot = recheckWorld().then(() => bootPull);
    listen(document, "visibilitychange", () => {
      if (document.hidden) saveClient?.flushOnHide();
      else if (!worldGate.open || saveClient?.halted || presence?.client.closed) recheckWorld();
    });
    // Closing the tab: the newest unsent record leaves now (keepalive), so a death is never replaced by the older server save.
    listen(window, "pagehide", () => saveClient?.flushOnHide());
  }
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
        message: sessionText("browser.resetUnavailable"),
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
        return { ok: false, message: sessionText("browser.resetCancelled") };
      resetWorld = Object.assign(Object.create(target), { spawn: target.startingPoint() });
      const result = resources.resetRun();
      if (!result.ok)
        return {
          ok: false,
          message: sessionText("browser.resetSaveFailed"),
        };
      // Durable current-schema save shadows all retained legacy records. Reload
      // starts the ordinary Westminster session with no old actors or async owners.
      committed = true;
      traveling = true;
      renderer.setAnimationLoop(null);
      input.clear();
      location.reload();
      return { ok: true, message: sessionText("browser.resetSavedReloading") };
    } catch {
      return {
        ok: false,
        message: sessionText(committed ? "browser.resetSavedReload" : "browser.resetPrepareFailed"),
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
    // A death out in the field restarts in the safehouse area (data/corpseRun.json respawn); a death at home restarts as it always did.
    // The spot the player fell is read BEFORE any travel: the body bag (marked-core.js, on a death) is dropped there, not at the respawn.
    const home = respawnArea(world.areaId, "westminster"),
      owner = game;
    owner.corpseFell = { areaId: world.areaId, x: owner.player.pos.x, z: owner.player.pos.z };
    if (world.areaId !== home) {
      if (!(await areas.activate({ areaId: home, entryPoint: world.manifest.entries[home] }))) {
        delete owner.corpseFell;
        return;
      }
    }
    traveling = true;
    areas.stop();
    input.clear();
    try {
      // Retry can revive a declared resident whose deferred model was skipped in
      // the saved run. Prepare before the durable retry or any actor replacement.
      await actors.ensureAreaModels(owner, world.areaId, { fresh: true });
      if (disposed || contextLost || game !== owner) return false;
      if (!resources.retry()) {
        game.message = sessionText("browser.retrySaveUnavailable");
        game.messageUntil = game.time + GAME_DATA.browserSession.messageSeconds;
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
        owner.message = sessionText("browser.retryPrepareFailed");
        owner.messageUntil = owner.time + GAME_DATA.browserSession.messageSeconds;
        hud.update(owner);
      }
      console.error("ARMAGEDOM_RETRY_PREPARATION_FAILED", error);
      return false;
    } finally {
      delete owner.corpseFell;
      traveling = false;
      // The knife handler refuses while traveling, so the fallback melee for a weapon left in the body bag is asked only now.
      if (loaded && !disposed && !contextLost && game !== owner)
        resources.equipFallbackMelee().catch((error) => console.error("ARMAGEDOM_RETRY_FALLBACK_MELEE_FAILED", error));
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
    switchWeapon: (pick) => resources.switchWeapon(pick),
    isPistol: () =>
      !!(game && selectedBossRanged(game)) ||
      !!game?.rifle?.selected ||
      !!game?.pistol?.equipped ||
      !!game?.flame?.equipped,
    isFlame: () => !!game?.flame?.equipped,
    isWorldGun: () => !!game && touchGun(game) !== null,
    onTargetClear: () => {
      if (game) {
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
  listen(document.getElementById("close-menu"), "click", () => audio.unlock().catch(() => {}));
  diagnostics = createMovementTrace(context, {
    enabled: new URLSearchParams(location.search).get("movementTrace") === "1",
  });
  if (diagnostics)
    fetch(new URL("release.json", baseUrl))
      .then((r) => {
        if (!r.ok) throw Error("Build identity unavailable"); // text-ok: diagnostics build label, not game text
        return r.json();
      })
      .then((r) => diagnostics?.setIdentity(r))
      .catch(() => diagnostics?.setIdentity({ version: "Build identity unavailable" })); // text-ok: diagnostics build label
  const touchPreview = new URLSearchParams(location.search).get("touch") === "1";
  if (touchPreview) document.body.classList.add("touch");
  function resize() {
    if (renderer) {
      QUALITY.probe({
        cores: navigator.hardwareConcurrency,
        memoryGb: navigator.deviceMemory,
        textureSize: renderer.capabilities?.maxTextureSize,
      });
      renderer.setPixelRatio(QUALITY.cap(Math.min(devicePixelRatio, GAME_DATA.browserSession.maxPixelRatio), "pixelRatio"));
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
  QUALITY.onChange(resize); // the frame-time sample can lower the tier once, after the first seconds
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
      loadActors(baseUrl, () => (lastLoadProgress = performance.now()), actorManifest),
    ]).then((settled) => (preloadPhysicsDeath(), settled)));
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
    hud.failed(sessionText("browser.graphicsPaused"));
    enter.textContent = sessionText("browser.reloadGame");
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
    enter.textContent = sessionText("browser.loadingWestminster");
    const start = performance.now();
    // The Enter gesture unlocks audio now; the cue file (0.3 MB) is fetched once the game can take input, so it does not compete with
    // the models and world for the first seconds of a slow connection.
    const audioReady = audio.unlock({ deferLoad: true });
    try {
      renderer ??= new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      resize();
      hud.loading(sessionText("browser.loadingRigs"));
      // After a failed or stalled attempt every loader URL gets a new query: the browser queues a second request for the same URL behind a
      // stuck one, so a plain retry would wait for the very request that stalled. (A static file server ignores the query.)
      if (loadAttempt > 0)
        THREE.DefaultLoadingManager?.setURLModifier?.((url) =>
          /^(blob|data):/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}retry=${loadAttempt}`, // text-ok: URL query
        );
      const encounter = prepareEncounter();
      // With the world open the server record may replace the local run first; the sync runs alongside the model loading (started
      // above, so nothing here can delay it) and the run is read only after it, never waiting longer than bootSyncWaitMs from Enter.
      const bootSync = Promise.race([
        Promise.resolve(worldBoot).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, GAME_DATA.saveClient.bootSyncWaitMs)),
      ]);
      // A stalled connection must not leave the card on "Loading Westminster…" for ever: when no model has finished for loadStallMs,
      // the load fails with a message and Retry. The abandoned load is disposed when (if) it ever arrives.
      lastLoadProgress = performance.now();
      let stopStall = () => {};
      const stalled = new Promise((_, reject) => {
        const timer = setInterval(() => {
          if (performance.now() - lastLoadProgress > GAME_DATA.diagnostics.loadStallMs)
            reject(Object.assign(Error(sessionText("browser.loadStopped")), { reasonKey: "browser.loadStopped" }));
        }, 1000);
        stopStall = () => clearInterval(timer);
      });
      stalled.catch(() => {}); // settled by the race below; never an unhandled rejection
      let results;
      try {
        results = await Promise.race([encounter, stalled]);
      } catch (error) {
        startup = null;
        encounter.then((late) => {
          for (const result of late) if (result.status === "fulfilled") result.value.dispose();
        });
        throw error;
      } finally {
        stopStall();
      }
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
      await bootSync;
      if (contextLost || disposed) {
        for (const result of results) result.value.dispose();
        return;
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
      runRestored = true;
      resources.restoreSavedRun(game);
      actors = createActors(scene, world, library, {
        visualScale: actorVisualScale,
      });
      await actors.ensureAreaModels(game);
      const slotModels = ensureSlotModels(library, world, world.areaId); // a slot creature dead at restore still respawns
      if (slotModels) await slotModels;
      if (contextLost || disposed) return;
      pendingLibrary = null;
      watchCutPrefetch(() => game);
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
        throw Error("Enemy exports are still being validated. This private candidate is not a complete fight yet."); // text-ok: private-candidate build gate
      loaded = true;
      hud.ready();
      audio.preload?.().then((ok) => {
        if (!ok && audio.state.error && !disposed) console.warn("ARMAGEDOM_AUDIO_FAILED", audio.state.error);
      });
      if (syncedNotice && game) {
        syncedNotice = false;
        game.message = sessionText("browser.progressSynced");
        game.messageUntil = game.time + GAME_DATA.browserSession.syncedNoticeSeconds;
      }
      if ((focusLost || document.hidden) && !document.getElementById("menu").open) hud.toggleMenu();
      hud.loading("");
      document.getElementById("version").textContent = sessionText("browser.versionLabel");
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
      // The card shows only data text: the thrown message is developer text (validators, file names) and goes to the console above and
      // to the client-log beacon, never onto the player's screen.
      beacon?.report("boot", "load-failed", error);
      // A failure may name a keyed reason from sessionText.json (the stall watchdog does); anything else gets the general line.
      hud.failed(sessionText(error?.reasonKey === "browser.loadStopped" ? error.reasonKey : "browser.loadFailed"));
      loadAttempt++;
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

  const api = Object.freeze({
    start,
    input(value) {
      if (!disposed) loop.input(value);
    },
    step(seconds) {
      if (!disposed) loop.step(seconds);
    },
    prepareArea(id) {
      if (disposed || !loaded) return Promise.reject(Error("Session unavailable")); // text-ok: developer API error
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
      if (disposed) throw Error("Session disposed"); // text-ok: developer API error
      if (typeof listener !== "function") throw new TypeError("Event listener required"); // text-ok: developer API error
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
  // Local QA only (loopback host and ?qa=1): window.__qa, a read-only window on the game for drivers. Never on a real host.
  installQaBridge({
    location,
    target: window,
    view: {
      session: () => api,
      game: () => game,
      world: () => world,
      presence: () => presence,
      loaded: () => loaded,
      areaId: () => world?.areaId,
    },
  });
  return api;
}
