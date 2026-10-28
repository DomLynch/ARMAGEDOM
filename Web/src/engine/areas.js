import { GAME_DATA, fillText } from "./game-data.js";
import { stopBossFlames } from "./boss-flame.js";
import { needsUniqueDeathCommit } from "./unique-reward-runtime.js";
import { bossExitGate } from "./area-bosses.js";
import { applyAreaLighting } from "./area-lighting.js";
import { publicAreaRegistry } from "../area-registry.js";
import { warmFramebuffer, warmFramebufferSteps } from "./warm-framebuffer.js";
import { createStageAhead } from "./stage-ahead.js";
import { resetMobileControls, initializeAreaResidents } from "../combat.js";
import { prepareParkedResidents } from "../parked-area-preparation.js";
import { ensureSlotModels } from "./slot-models.js";
import { relieveGeometryBudget, limitParkedAreas, protectedAreas } from "./parked-view-budget.js";
import { createAreaPrefetch, PREFETCH_LIMITS } from "./area-prefetch.js";
import { travelTo, captureTravelState, restoreTravelState } from "../travel.js";
// Parked-area budget with the prefetch flag: two areas or 30 MB of their textures, whichever comes first.
export const PARKED_AREA_LIMIT = GAME_DATA.areaRuntime.parkedAreas; // data/areaRuntime.json: 2 areas, 30 MiB
const TRAVEL = GAME_DATA.areaRuntime.travel; // data/areaRuntime.json: message delay and failure message length, preparation slices
export const TRAVEL_MESSAGE_DELAY_MS = TRAVEL.messageDelayMs;
// A locked exit says why ("Kill the Ember Matron") for 4 s, unless the yellow route line already says exactly that: the line
// would only be replaced by the same words.
export function showExitLock(s, gate) {
  const routeLine = s.world?.exitHint?.(s.game.player.pos) ?? "";
  if (routeLine.toLowerCase().includes(gate.message.toLowerCase())) return;
  s.game.message = gate.message;
  s.game.messageUntil = s.game.time + TRAVEL.lockMessageSeconds;
}
// The "Traveling to <AREA>…" message appears only if the travel is still going after the delay, so an instant hop never flashes it.
// Returns cancel(): called when the travel ends (either way), it stops a pending message and makes a late timer do nothing.
export function showTravelMessageAfterDelay(s, game, areaId, delayMs = TRAVEL_MESSAGE_DELAY_MS, setTimer = setTimeout) {
  let cancelled = false;
  const timer = setTimer(() => {
    if (cancelled) return;
    game.message = fillText(GAME_DATA.visual.travelText.travelling, { area: areaId.toUpperCase() });
    game.messageUntil = game.time + TRAVEL.travelMessageSeconds;
    s.hud.update(game);
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
export function createAreaLifecycle(s) {
  let travelLatch = false;
  let fightQuietAt = 0;
  // Network-only neighbour prefetch (on by default; ?prefetch=0 turns it off): bytes into the HTTP cache, nothing decoded.
  const prefetchLimits = { ...PREFETCH_LIMITS, ...s.prefetchLimits };
  const prefetch = s.prefetchAreas
    ? createAreaPrefetch({
        limits: prefetchLimits,
        neighbours: () => neighbourIds(),
        urlsFor: (id) =>
          s.world.isAreaReady(id) ? [] : [...s.world.areaPrefetchUrls(id), ...(s.actors?.areaPrefetchUrls?.(id) ?? [])],
        canRun() {
          if (s.traveling || s.resetting || s.contextLost || !s.loaded || !s.game) return false;
          // A live fight (an alerted enemy, or a dead player) pauses downloads until a second after it ends.
          if (s.game.player.hp <= 0 || s.game.enemies.some((e) => e.hp > 0 && e.alerted))
            fightQuietAt = performance.now() + prefetchLimits.fightQuietMs;
          return performance.now() >= fightQuietAt;
        },
        onEvent: (kind, url, error) => console.warn("ARMAGEDOM_AREA_PREFETCH", kind, url, error?.message),
      })
    : null;
  // Read off the session, not a closure name, so functions sliced out of this file by tests need no stub.
  if (prefetch) s.areaPrefetch = prefetch;
  // Stage-ahead (on by default, ?stageahead=0 off): idle preparation of the nearest neighbour; it rides on the
  // prefetch flag's parked-area limits, so it is off whenever prefetch is.
  const stageAhead =
    s.stageAheadLimits && prefetch
      ? createStageAhead({
          limits: s.stageAheadLimits,
          fighting: () => !!s.game && (s.game.player.hp <= 0 || s.game.enemies.some((e) => e.hp > 0 && e.alerted)),
          traveling: () => s.traveling || s.resetting || s.contextLost || !s.loaded || !s.game,
        })
      : null;
  // Read off the session like areaPrefetch, so functions sliced out of this file by tests need no stub.
  if (stageAhead) {
    s.stageAhead = stageAhead;
    s.stageAheadHooks = { maybe: maybeStageAhead, abort: abortStageAhead };
  }
  async function crossArea(request) {
    if (s.resetting) return false;
    const gate = bossExitGate(s.game, request.areaId);
    if (gate && !gate.allowed) {
      showExitLock(s, gate);
      return false;
    }
    if (needsUniqueDeathCommit(s.game) && s.persistRun?.(s.game) !== true) return false;
    const previousArea = s.world.areaId,
      hubHandoff = previousArea === "central-hub" || request.areaId === "central-hub",
      keepMovement = !hubHandoff && s.world.isAreaReady(request.areaId);
    const ownerGame = s.game,
      ownerActors = s.actors,
      ownerWorld = s.world;
    const owns = () =>
      !s.contextLost && s.loaded && s.game === ownerGame && s.actors === ownerActors && s.world === ownerWorld;
    let accepted = false,
      recoveryFailed = false,
      travelState = null,
      previousPoint = null,
      actorParkStarted = false,
      actorActivationStarted = false;
    const releaseSource = ownerWorld.leaseArea?.(previousArea) ?? (() => {});
    stopBossFlames(ownerGame, "travel");
    s.traveling = true;
    s.stageAheadHooks?.abort(request.areaId);
    s.areaPrefetch?.cancel();
    s.resetClock();
    s.input.clear({ keepMovement });
    if (s.game.pistol) s.cancelPistol(s.game);
    const cancelTravelMessage = showTravelMessageAfterDelay(s, ownerGame, request.areaId);
    try {
      s.hud.update(ownerGame);
      // Paint the entry cue before synchronous graphics work.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!owns()) return false;
      await prepareDestination(request.areaId);
      if (!owns()) return false;
      await prepareGraphics(request.areaId, areaPreparation);
      if (!owns()) return false;
      travelState = captureTravelState(ownerGame);
      previousPoint = ownerWorld.geometry?.point(ownerGame.player.pos) ?? ownerWorld.registry?.get(previousArea)?.entry;
      const position = await travelTo(ownerGame, request, { isCurrent: owns });
      if (!position || !owns()) return false;
      s.world.routeGuidance?.arrive?.(previousArea, position);
      applyAreaLighting(s.scene, s.world);
      s.effects.reset();
      actorParkStarted = true;
      s.actors.parkArea(previousArea);
      actorActivationStarted = true;
      s.actors.activateArea(request.areaId);
      s.game.events = [];
      s.world.update(s.game.player.pos, 0, innerWidth, innerHeight, true);
      s.atmosphere?.update(0, { paused: true });
      s.actors.update(s.game, 0, 0, { restoreCorpses: true });
      s.game.ratContact = s.actors.ratContact();
      console.info("ARMAGEDOM_TRAVEL", JSON.stringify({ area: s.world.areaId, position: s.game.player.pos }));
      accepted = true;
      if (s.areaPrefetch)
        limitParkedAreas(s.actors, new Set([request.areaId, previousArea]), PARKED_AREA_LIMIT.maxAreas, (id) =>
          s.world.unmarkAreaReady?.(id),
        );
      if (areaPreparation) queueNeighbours(areaPreparation);
      return true;
    } catch (error) {
      cancelTravelMessage();
      if (!owns()) return false;
      console.error("ARMAGEDOM_TRAVEL_FAILED", error);
      if (travelState) {
        try {
          if (error.message === "London source recovery failed") throw error;
          if (actorActivationStarted) ownerActors.parkArea(request.areaId);
          if (ownerWorld.areaId !== previousArea) await ownerWorld.loadArea(previousArea, previousPoint);
          if (!owns()) return false;
          restoreTravelState(ownerGame, travelState);
          applyAreaLighting(s.scene, ownerWorld);
          s.effects.reset();
          if (actorParkStarted) ownerActors.activateArea(previousArea);
          ownerWorld.update(ownerGame.player.pos, 0, innerWidth, innerHeight, true);
          s.atmosphere?.update(0, { paused: true });
          ownerActors.update(ownerGame, 0, 0, { restoreCorpses: true });
          ownerGame.ratContact = ownerActors.ratContact();
        } catch (recovery) {
          if (!owns()) return false;
          recoveryFailed = true;
          s.failTravelRecovery?.();
          console.error("ARMAGEDOM_TRAVEL_RECOVERY_FAILED", recovery);
        }
      }
      s.game.message = recoveryFailed
        ? GAME_DATA.visual.travelText.recoveryFailed
        : GAME_DATA.visual.travelText.loadFailed;
      s.game.messageUntil = s.game.time + TRAVEL.failureMessageSeconds;
      return false;
    } finally {
      cancelTravelMessage();
      releaseSource();
      s.traveling = false;
      if (owns()) {
        s.input.clear({ keepMovement: keepMovement && accepted });
        resetMobileControls(ownerGame);
        s.resetClock();
        s.hud.update(ownerGame);
        s.updateExpedition?.();
        if (!recoveryFailed) s.renderer.render(s.scene, s.camera);
        // Failed or not, the neighbours of wherever the player now stands are the next to warm.
        if (!recoveryFailed) s.areaPrefetch?.enter();
        s.stageAhead?.enter();
      }
    }
  }
  let areaPreparation = null;
  function stopAreaPreparation() {
    s.areaPrefetch?.stop();
    const state = areaPreparation;
    if (!state) return;
    state.cancelled = true;
    state.iterator?.return();
    state.iterator = null;
    for (const task of state.tasks.values()) {
      task.suspended?.iterator.return();
      task.suspended?.release();
      task.suspended = null;
    }
    for (const task of state.tasks.values()) task.reject(new Error("Area preparation cancelled"));
    areaPreparation = null;
  }
  function preparationTurn(state) {
    return new Promise((resolve, reject) => {
      const prep = TRAVEL.preparation,
        deadlineAt = performance.now() + prep.deadlineMs;
      const check = () => {
        if (
          state.cancelled ||
          s.game !== state.game ||
          s.contextLost ||
          (state.abortArea && state.abortArea === state.current)
        ) {
          reject(new Error("Area preparation cancelled"));
          return false;
        }
        return true;
      };
      // Entry is already announced and paused; idle scheduling can throttle this work.
      if (s.traveling && state.urgent) {
        setTimeout(() => {
          if (check()) resolve(prep.urgentSliceMs);
        }, 0);
        return;
      }
      // Stage-ahead work waits for a quiet moment (no fight, no long frame); a travel never waits.
      if (!state.urgent && state.hold?.()) {
        setTimeout(() => {
          if (check()) preparationTurn(state).then(resolve, reject);
        }, state.holdMs ?? prep.holdMs);
        return;
      }
      const idle = (deadline) => {
        if (!check()) return;
        if (
          deadline.didTimeout ||
          performance.now() >= deadlineAt ||
          deadline.timeRemaining() >= prep.idleEnoughMs ||
          state.urgent
        )
          resolve(
            state.urgent
              ? prep.urgentSliceMs
              : Math.min(
                  (state.ahead && state.sliceMs) || prep.ambientSliceMs,
                  Math.max(1, deadline.timeRemaining() - 1),
                ),
          );
        else requestIdleCallback(idle, { timeout: Math.max(1, deadlineAt - performance.now()) });
      };
      // A busy renderer must not starve preparation indefinitely. Timeout grants
      // one small unit of work; it is a scheduling bound, never an area-ready timer.
      if (globalThis.requestIdleCallback) requestIdleCallback(idle, { timeout: prep.idleTimeoutMs });
      else
        requestAnimationFrame(() =>
          setTimeout(() => {
            if (check()) resolve(state.urgent ? prep.urgentSliceMs : prep.ambientSliceMs);
          }, 0),
        );
    });
  }
  function exitDistance(areaId) {
    const link = (
      s.world.registry?.links(s.world.areaId) ?? s.world.manifest.links.filter((link) => link.from === s.world.areaId)
    ).find((link) => link.to === areaId);
    if (!link) return Infinity;
    const point = s.world.geometry.point(s.game.player.pos),
      goal = { x: point.x, y: point.y };
    for (const [key, value] of Object.entries(link.condition)) goal[key[0]] = value;
    const target = s.world.geometry.ground(goal);
    return Math.hypot(target.x - s.game.player.pos.x, target.z - s.game.player.pos.z);
  }
  function startAreaPreparation() {
    if (s.contextLost || !s.loaded) return;
    if (areaPreparation?.game === s.game) return;
    const state = (areaPreparation = {
      game: s.game,
      actors: s.actors,
      cancelled: false,
      tasks: new Map(),
      running: false,
      iterator: null,
      stats: { steps: 0, cpuMilliseconds: 0, maxStepMs: 0, areas: {} },
    });
    if (stageAhead) {
      state.sliceMs = stageAhead.limits.sliceMs;
      state.holdMs = stageAhead.limits.recheckMs;
      state.hold = () => !s.traveling && !stageAhead.open();
      stageAhead.enter();
    }
    s.world.preparationProgress = state.stats;
    s.world.prepareArea(s.world.areaId).catch(() => {});
    s.world.markAreaReady(s.world.areaId);
    if (s.areaPrefetch) s.world.setParkedLimit(PARKED_AREA_LIMIT);
    queueNeighbours(state);
    s.areaPrefetch?.enter();
  }
  // Neighbours of the current area, nearest exit first.
  function neighbourIds() {
    return [...new Set((s.world.registry ?? publicAreaRegistry).links(s.world.areaId).map((link) => link.to))].sort(
      (a, b) => exitDistance(a) - exitDistance(b),
    );
  }
  function queueNeighbours(state) {
    for (const id of neighbourIds())
      queueDestination(id, state).catch((error) => {
        if (!state.cancelled) console.warn("ARMAGEDOM_AREA_PREPARATION", id, error.message);
      });
  }
  function queueDestination(areaId, state = areaPreparation) {
    if (s.world.isAreaReady(areaId)) return Promise.resolve();
    if (!state || state.cancelled || state.game !== s.game) throw Error("Area preparation unavailable");
    const existing = state.tasks.get(areaId);
    if (existing && existing.status !== "failed" && existing.status !== "ready") {
      pumpDestinations(state);
      return existing.promise;
    }
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    state.tasks.set(areaId, { areaId, promise, resolve, reject, status: "queued" });
    pumpDestinations(state);
    return promise;
  }
  async function prepareDestination(areaId) {
    if (s.world.isAreaReady(areaId)) return;
    if (!s.traveling) throw Error("Cold area preparation requires announced travel");
    if (!areaPreparation) startAreaPreparation();
    const state = areaPreparation;
    state.urgent = areaId;
    try {
      await queueDestination(areaId, state);
    } finally {
      state.urgent = null;
    }
  }
  async function pumpDestinations(state) {
    // Keep neighbours queued, but admit their indivisible actor/finisher work only
    // during the announced destination-entry pause, never alongside live play.
    // The announced travel pause, or (stage-ahead) one neighbour in idle slices.
    const target = () => (s.traveling ? state.urgent : state.ahead);
    if (state.running || !target()) return;
    state.running = true;
    try {
      for (;;) {
        const queued = [...state.tasks.values()].filter((t) => t.status === "queued" && t.areaId === target());
        if (!queued.length || state.cancelled) return;
        const task = queued[0];
        task.status = "running";
        state.current = task.areaId;
        let release = task.suspended?.release ?? (() => {}),
          suspended = false;
        const retainedViews =
          task.suspended?.retainedViews ??
          state.actors.areaViewStats().parked?.some((row) => row.area === task.areaId && row.count > 0) ??
          false;
        try {
          let stage, iterator;
          if (task.suspended) {
            ({ stage, iterator } = task.suspended);
            task.suspended = null;
            state.iterator = iterator;
          } else {
            release = s.world.leaseArea?.(task.areaId) ?? release;
            await preparationTurn(state);
            stage = await s.world.prepareArea(task.areaId);
            await preparationTurn(state);
            const record = prepareParkedResidents(state.game, stage, initializeAreaResidents);
            await s.actors.ensureAreaModels?.(record, task.areaId);
            await ensureSlotModels(s.survivorLibrary, s.world, task.areaId); // a slot creature killed earlier still respawns
            if (state.cancelled || s.game !== state.game || s.actors !== state.actors || s.contextLost)
              throw Error("Area model preparation cancelled");
            iterator = s.actors.prepareAreaSteps(task.areaId, record, stage, state.game.finishers);
            state.iterator = iterator;
          }
          let done = false;
          while (!done) {
            const budget = await preparationTurn(state),
              batchStart = performance.now();
            do {
              const started = performance.now(),
                step = iterator.next(),
                ms = performance.now() - started;
              state.stats.steps++;
              state.stats.cpuMilliseconds += ms;
              state.stats.maxStepMs = Math.max(state.stats.maxStepMs, ms);
              if (!state.stats.worstStep || ms > state.stats.worstStep.ms)
                state.stats.worstStep = { area: task.areaId, label: step.value ?? "done", ms };
              done = step.done;
            } while (!done && performance.now() - batchStart < budget);
            // Switch only between CPU batches; retain partial views and their stage lease.
            if (
              !done &&
              state.urgent &&
              state.urgent !== task.areaId &&
              state.tasks.get(state.urgent)?.status === "queued"
            ) {
              task.suspended = { stage, iterator, release, retainedViews };
              task.status = "queued";
              suspended = true;
              break;
            }
          }
          if (suspended) {
            state.iterator = null;
            continue;
          }
          state.iterator = null;
          relieveGeometryBudget(s.actors, protectedAreas(state, s.world.areaId, task.areaId), (id) =>
            s.world.unmarkAreaReady?.(id),
          );
          task.status = "prepared";
          task.resolve();
        } catch (error) {
          state.iterator?.return();
          state.iterator = null;
          if (areaPreparation === state && s.game === state.game && s.actors === state.actors && !retainedViews)
            state.actors.discardArea(task.areaId);
          task.status = "failed";
          task.reject(error);
        } finally {
          if (!suspended) release();
        }
      }
    } finally {
      state.running = false;
    }
  }

  // One graphics phase per area at a time: a travel that starts while the stage-ahead run is mid-warm joins it.
  async function prepareGraphics(areaId, state) {
    const running = state?.graphics?.get(areaId);
    if (running) return running;
    const run = graphicsPhase(areaId, state);
    if (!state) return run;
    const graphics = (state.graphics ??= new Map());
    graphics.set(areaId, run);
    const clear = () => graphics.get(areaId) === run && graphics.delete(areaId);
    run.then(clear, clear);
    return run;
  }
  async function graphicsPhase(areaId, state) {
    if (s.world.isAreaReady(areaId)) return;
    const aheadRun = () => state.ahead === areaId && state.abortArea !== areaId;
    if (!state || state.cancelled || s.game !== state.game || (!s.traveling && !aheadRun()))
      throw Error("Area preparation cancelled");
    const task = state.tasks.get(areaId),
      release = s.world.leaseArea?.(areaId) ?? (() => {});
    try {
      const stage = await s.world.prepareArea(areaId);
      if (state.cancelled || s.game !== state.game || s.contextLost || (!s.traveling && !aheadRun()))
        throw Error("Area preparation cancelled");
      s.actors.bindPreparedArea(areaId, stage.scene);
      await s.renderer.compileAsync(stage.scene, stage.camera, s.scene);
      await preparationTurn(state);
      const lights = s.scene.children.filter((o) => o.isLight).map((o) => o.clone());
      stage.scene.add(...lights);
      applyAreaLighting(stage.scene, stage);
      stage.scene.fog = s.scene.fog;
      stage.scene.environment = s.scene.environment;
      const started = performance.now();
      try {
        await preparationTurn(state);
        if (!s.traveling && aheadRun()) {
          // Idle: warm a few objects per turn. A travel that arrives meanwhile finishes the rest without waiting.
          const steps = warmFramebufferSteps(
            s.renderer,
            stage.scene,
            stage.camera,
            s.stageAhead?.limits.warmGroupObjects,
          );
          for (const _ of steps) {
            if (!s.traveling) await preparationTurn(state);
            if (state.cancelled || s.contextLost || (state.abortArea === areaId && !s.traveling))
              throw Error("Area preparation cancelled");
          }
        } else warmFramebuffer(s.renderer, stage.scene, stage.camera);
      } finally {
        for (const light of lights) light.removeFromParent();
      }
      const gl = s.renderer.getContext(),
        fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      try {
        for (;;) {
          await preparationTurn(state);
          const result = gl.clientWaitSync(fence, 0, 0);
          if (result === gl.ALREADY_SIGNALED || result === gl.CONDITION_SATISFIED) break;
          if (result === gl.WAIT_FAILED || gl.isContextLost()) throw Error("Prepared graphics unavailable");
        }
      } finally {
        gl.deleteSync(fence);
      }
      state.stats.areas[areaId] = { ready: true, gpuPreparationMs: performance.now() - started };
      s.world.markAreaReady(areaId);
      task.status = "ready";
      task.resolve();
    } catch (error) {
      // Graphics attempts borrow prepared actors; failures must preserve them.
      task.status = "failed";
      throw error;
    } finally {
      release();
    }
  }

  // Nearest neighbour, close enough to its exit, nothing fighting: prepare it ahead of the player.
  const aheadFailed = new Set();
  function maybeStageAhead() {
    const state = areaPreparation,
      stageAhead = s.stageAhead;
    if (!stageAhead || !state || state.ahead || s.traveling || state.cancelled || !stageAhead.due()) return;
    const id = neighbourIds()[0];
    if (!id || aheadFailed.has(`${s.world.areaId}>${id}`) || s.world.isAreaReady(id)) return;
    if (exitDistance(id) > stageAhead.limits.exitRangeMeters || !stageAhead.open()) return;
    runStageAhead(id, state);
  }
  async function runStageAhead(id, state) {
    const stageAhead = s.stageAhead;
    state.ahead = id;
    stageAhead.begin();
    let outcome = "aborted";
    try {
      // Inside the two-area limit: the area just left plus this one; anything older goes first.
      limitParkedAreas(s.actors, new Set([s.world.areaId, id]), PARKED_AREA_LIMIT.maxAreas - 1, (evicted) =>
        s.world.unmarkAreaReady?.(evicted),
      );
      await queueDestination(id, state);
      await prepareGraphics(id, state);
      outcome = "completed";
    } catch (error) {
      if (!state.cancelled && state.abortArea !== id) {
        aheadFailed.add(`${s.world.areaId}>${id}`);
        console.warn("ARMAGEDOM_STAGE_AHEAD", id, error?.message);
      }
    } finally {
      if (state.ahead === id) state.ahead = null;
      if (state.abortArea === id) state.abortArea = null;
      stageAhead.end(outcome);
    }
  }
  // A travel to another area drops the stage-ahead run (what it finished stays); one to the same area joins it.
  function abortStageAhead(toArea) {
    const state = areaPreparation;
    if (!state?.ahead || state.ahead === toArea) return;
    state.abortArea = state.ahead;
    state.ahead = null;
  }
  function checkExit() {
    s.stageAheadHooks?.maybe();
    const request = s.world.travelAt(s.game.player.pos);
    if (!request) {
      travelLatch = false;
      if (areaPreparation) {
        areaPreparation.urgent = null;
        for (const [id, task] of areaPreparation.tasks) if (task.status === "failed") areaPreparation.tasks.delete(id);
      }
    }
    if (request && !travelLatch && s.game.player.hp > 0 && !s.game.finished && !s.paused && !s.contextLost) {
      const gate = bossExitGate(s.game, request.areaId);
      if (gate && !gate.allowed) {
        showExitLock(s, gate);
        return false;
      }
      travelLatch = true;
      crossArea(request);
      return true;
    }
    return false;
  }
  return {
    start: startAreaPreparation,
    stop: stopAreaPreparation,
    prepare: prepareDestination,
    activate: crossArea,
    checkExit,
  };
}
