import { selectedBossRanged } from "./boss-weapon-runtime.js";
import { pickTouchTarget, touchTargetVisible } from "./touch-target.js";
import * as THREE from "three";
import { presentationAudioEvents } from "../donor-audio.js";
import { stepGame, resetMobileControls } from "../combat.js";
import { selectedRangedProfile, rangedPointerPoint, flamePointerPoint } from "../pistol-targeting.js";
import { createFirstTimeHints } from "../first-time-hints.js";
export function createBrowserLoop(s) {
  const hints = createFirstTimeHints();
  let last = 0,
    accumulator = 0,
    submitted = null;
  function toDomain(v) {
    return {
      x: v.x * s.world.cameraRight.x - v.y * s.world.cameraForward.x,
      z: v.x * s.world.cameraRight.z - v.y * s.world.cameraForward.z,
    };
  }
  function combatVisibleIds() {
    return s.game.enemies
      .filter((e) => {
        const v = s.world.toRender(e.pos, 1).project(s.world.camera);
        return (
          (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1) ||
          (s.game.touchTarget?.id === e.id && s.actors?.views && touchTargetVisible(s.game, s.actors.views, s.camera))
        );
      })
      .map((e) => e.id);
  }
  function intent() {
    const raw = submitted ?? s.input.take(),
      value = {
        ...raw,
        manualPistolAim: !!raw.fireAim,
        manualFlameAim: !!raw.fireAim && !!s.game.flame?.equipped,
        combatVisibleIds: combatVisibleIds(),
        move: toDomain(raw.move),
        aim:
          selectedBossRanged(s.game) || s.game.pistol?.equipped || s.game.rifle?.selected || s.game.flame?.equipped
            ? raw.fireAim
              ? toDomain(raw.fireAim)
              : null
            : raw.aim
              ? toDomain(raw.aim)
              : null,
      };
    if ((raw.mobile || s.game.player.weapon === "railgun") && raw.worldTap) {
      const selected = pickTouchTarget(s.game, s.actors.views, s.camera, s.canvas, raw.worldTap);
      if (selected) {
        value.touchTargetSelection = selected;
        if (!value.combatVisibleIds.includes(selected.id)) value.combatVisibleIds.push(selected.id);
      }
    }
    if (raw.mouse) {
      const bounds = s.canvas.getBoundingClientRect(),
        x = ((raw.mouse.x - bounds.left) / bounds.width) * 2 - 1,
        y = 1 - ((raw.mouse.y - bounds.top) / bounds.height) * 2,
        point = s.game.flame?.equipped
          ? flamePointerPoint(s.world, s.actors.views, s.game.enemies, x, y, {
              assist: s.game.mobileAssistEnabled !== false,
              time: s.game.time,
              visibleIds: value.combatVisibleIds,
            })
          : selectedRangedProfile(s.game)
            ? rangedPointerPoint(s.game, s.actors.views, x, y, { visibleIds: value.combatVisibleIds })
            : s.world.screenToGround(x, y);
      if (point) {
        value.aimPoint = { x: point.x, z: point.z };
        value.aimTargetId = point.targetId ?? null;
        value.manualPistolAim = true;
        value.manualFlameAim = !!s.game.flame?.equipped;
        value.aim = {
          x: point.x - s.game.player.pos.x,
          z: point.z - s.game.player.pos.z,
        };
      }
    }
    if (submitted) submitted = { ...submitted, worldTap: null, actions: [], guardPressed: false, dodge: false };
    return value;
  }
  function frame(ms, providedElapsed) {
    const elapsed = providedElapsed ?? (last ? Math.max(0, (ms - last) / 1000) : 0),
      dt = Math.min(0.1, elapsed);
    last = ms;
    if (!s.world || !s.game || s.contextLost) return;
    const audioEvents = [];
    // Travel holds this frame and simulation. Re-rendering the unchanged rigs
    // consumes the idle budget needed to finish the destination's preparation.
    if (s.traveling) {
      s.hud.update(s.game);
      s.updateExpedition?.();
      return;
    }
    s.effects?.advance(elapsed, { paused: s.paused || s.traveling });
    if (s.loaded && !s.paused && !s.traveling && !s.game.finished) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        const weaponBefore = s.game.player.weapon,
          flameBefore = !!s.game.flame?.equipped;
        const value = intent();
        s.diagnostics?.beforeStep(value);
        stepGame(s.game, value, 1 / 60, {
          dispatchPistol: s.dispatchPistol,
          dispatchRifle: s.dispatchRifle,
          dispatchBossEquipment: s.dispatchBossEquipment,
          dispatchMarshalPistol: s.dispatchMarshalPistol,
          dispatchFlame: s.dispatchFlame,
          railgunSource: s.railgunSource,
          railgunAimPoint: s.railgunAimPoint,
          railgunTrace: s.railgunTrace,
          reaperSource: s.reaperSource,
          sawContact: s.sawContact,
          bossRangedSource: s.bossRangedSource,
          bossRangedTrace: s.bossRangedTrace,
          rocketSource: s.rocketSource,
          rocketAimHeight: s.rocketAimHeight,
          grenadeSource: s.grenadeSource,
          grenadeTrace: s.grenadeTrace,
          grenadeFollow: s.grenadeFollow,
          flameSource: s.flameSource,
          bossFlameSource: s.bossFlameSource,
          flameAimEligible: s.flameAimEligible,
        });
        s.diagnostics?.afterStep();
        if (weaponBefore !== s.game.player.weapon || flameBefore !== !!s.game.flame?.equipped) {
          s.input.clear();
          submitted = null;
          resetMobileControls(s.game);
        }
        s.collectNearbySupplies(s.game, value);
        s.collectNearbyVest(s.game);
        s.persistRun(s.game);
        // Read-only: derives world events from the step's legacy events. Nothing reads the journal yet.
        s.worldJournal?.ingest(s.game, s.game.events);
        s.effects.events(s.game);
        s.actors?.events(s.game);
        audioEvents.push(...s.game.events);
        s.emit(s.game.events);
        hints.observe(s.game);
        accumulator -= 1 / 60;
        if (s.areas.checkExit()) break;
        if (s.game.finished) {
          resetMobileControls(s.game);
          s.game.pistolTargetId = null;
          s.game.pistolTargetFacing = null;
          s.input.clear();
          break;
        }
      }
    }
    s.world.update(s.game.player.pos, s.paused ? 0 : dt, innerWidth, innerHeight);
    s.atmosphere?.update(dt, { paused: s.paused || s.traveling });
    s.updateSupplies();
    s.updateVestBag();
    s.presence?.update();
    s.actors?.update(s.game, s.paused || s.traveling ? 0 : dt, s.effects?.pistolRecoil(s.game) ?? 0, {
      presentationDt: s.paused || s.traveling ? 0 : elapsed,
      combatVisibleIds: combatVisibleIds(),
    });
    s.effects?.update(s.game, {
      paused: s.paused || s.traveling,
      visibleIds: combatVisibleIds(),
      viewportHeight: s.canvas.clientHeight,
      viewportWidth: s.canvas.clientWidth,
    });
    const severs = s.effects?.takeSeverEvents?.() ?? [];
    if (audioEvents.length || severs.length) s.audio.play(presentationAudioEvents(audioEvents, severs));
    s.rim.position.copy(s.world.toRender(s.game.player.pos, 2.4)).add(new THREE.Vector3(0, 0, 0.8));
    const routeActive = !!s.world?.exitHint?.(s.game.player.pos),
      hint = s.paused || s.traveling ? "" : hints.current(s.game, routeActive);
    s.hud.update(s.game, hint, hints.overMessage);
    s.updateExpedition?.();
    if (s.effects) s.effects.render(s.renderer, s.camera, s.game, s.canvas.clientHeight, s.canvas.clientWidth);
    else s.renderer.render(s.scene, s.camera);
  }
  return {
    frame,
    intent,
    combatVisibleIds,
    reset() {
      last = 0;
      accumulator = 0;
      submitted = null;
    },
    input(value) {
      if (!value || typeof value !== "object") throw new TypeError("Input object required");
      submitted = structuredClone({ move: { x: 0, y: 0 }, actions: [], held: [], ...value });
    },
    step(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("Finite nonnegative step required");
      frame(last + seconds * 1000, seconds);
    },
  };
}
