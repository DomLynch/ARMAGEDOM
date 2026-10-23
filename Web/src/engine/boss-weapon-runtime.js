import { railgunIntent } from "./railgun.js";
import { resolveRangedAim, rangedTargets } from "../pistol-targeting.js";
import { rocketIntent } from "./rocket-runtime.js";
import { startStickyGrenade, stepStickyGrenade } from "./sticky-grenade-runtime.js";
import { tracePistol } from "../pistol.js";
import { traceShotgun } from "./shotgun-pattern.js";
import { createGrenadeModel } from "./grenade-state.js";
import { bossEquipmentClock } from "./boss-equipment-data.js";
const EPS = 1e-8,
  length = (v) => Math.hypot(v?.x ?? 0, v?.z ?? 0),
  point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const normal = (v, fallback = { x: 0, z: 1 }) =>
  length(v) > EPS ? { x: v.x / length(v), z: v.z / length(v) } : { ...fallback };
const emit = (g, type, data) => g.events.push({ type, ...data });
export function selectedBossRanged(g) {
  return (
    ["shotgun", "grenade", "rocketLauncher", "commanderPistol"].find((field) => g.bossEquipment?.[field]?.selected) ??
    null
  );
}
function grenadeModel(g) {
  return (
    g.grenadeProposalModel ??
    (g.grenadeProposalModel = createGrenadeModel({
      profile: g.world.bossEquipmentData.grenade.payload,
      areaIds: g.world.registry.ids,
    }))
  );
}
function throwTarget(g, intent, reference) {
  const result = resolveRangedAim(g, reference, {
    visibleIds: intent.combatVisibleIds ?? intent.pistolVisibleIds,
    aimPoint: intent.aimPoint,
    aimTargetId: intent.aimTargetId,
  });
  g.grenadeAimTargetId = result?.targetId ?? null;
  if (!result) return null;
  const p = g.player.pos,
    position = result.position,
    distance = Math.hypot(position.x - p.x, position.z - p.z);
  return distance > 0 && g.world.geometry?.clear(position, 0.05) && g.world.lineClear(p, position)
    ? { position, direction: normal({ x: position.x - p.x, z: position.z - p.z }, reference) }
    : null;
}
export function bossEquipmentIntent(g, intent, dispatch, applyHit, services = {}) {
  const field = selectedBossRanged(g);
  if (!field) return intent;
  if (field === "commanderPistol") return railgunIntent(g, intent, dispatch, applyHit, services);
  if (field === "rocketLauncher") return rocketIntent(g, intent, dispatch, services);
  const p = g.player,
    data = g.world.bossEquipmentData[field],
    clock = bossEquipmentClock(g, field),
    actions = intent.actions ?? [],
    canAct =
      p.hp > 0 &&
      !g.finished &&
      !g.runSaveInvalid &&
      !intent.cancel &&
      !intent.dodge &&
      !p.swing &&
      g.time >= (p.ready ?? 0) &&
      g.time >= p.hurtUntil &&
      g.time >= p.dodgeUntil;
  const explicit = point(intent.aim) && length(intent.aim) > EPS,
    moving = length(intent.move) > 0.01,
    reference = explicit ? normal(intent.aim) : moving ? normal(intent.move) : (g.bossWeaponFacing ?? { ...p.facing });
  g.bossWeaponFacing = { ...reference };
  g.pistolTargetId = null;
  g.pistolTargetFacing = null;
  if (!canAct) clock.reloadingUntil = 0;
  if (canAct && actions.includes("heavy")) {
    dispatch?.(g, { type: "equip", itemId: data.itemId, equipped: false }, true);
    return { ...intent, actions: [], held: [], guard: false, guardPressed: false };
  }
  if (field === "grenade" && canAct && intent.guardPressed) {
    g.grenadeMode = g.grenadeMode === "sticky" ? "standard" : "sticky";
    emit(g, "grenade-mode", { mode: g.grenadeMode });
  }
  let state = g.bossEquipment[field];
  if (field === "grenade" && canAct && actions.includes("stab")) {
    const choices = [3, 5, 8],
      index = choices.indexOf(g.grenadeThrowRange ?? 5);
    g.grenadeThrowRange = choices[(index + 1) % choices.length];
  }
  if (field === "shotgun") {
    if (canAct && clock.reloadingUntil > 0 && g.time + EPS >= clock.reloadingUntil) {
      const result = dispatch?.(g, { type: "reload", field }, true);
      if (!result?.ok) clock.reloadingUntil = 0;
      state = g.bossEquipment[field];
    }
    if (
      canAct &&
      g.bossEquipmentAssetReady?.[field] &&
      (actions.includes("stab") || state.magazine === 0) &&
      !clock.reloadingUntil &&
      state.magazine < data.rules.capacity &&
      state.reserve > 0 &&
      g.time + EPS >= clock.nextFireAt
    ) {
      clock.reloadingUntil = g.time + data.rules.reload;
      emit(g, "reload-start", { until: clock.reloadingUntil, weapon: "shotgun" });
    }
  }
  const pressed = actions.includes("fire") || actions.includes("slash");
  if (
    pressed &&
    canAct &&
    g.bossEquipmentAssetReady?.[field] &&
    !clock.reloadingUntil &&
    g.time + EPS >= clock.nextFireAt
  ) {
    if (field === "shotgun") {
      const resolved = resolveRangedAim(g, reference, {
          visibleIds: intent.combatVisibleIds ?? intent.pistolVisibleIds,
        }),
        bearing = resolved?.trace.direction ?? reference,
        targets = rangedTargets(g, intent.combatVisibleIds ?? intent.pistolVisibleIds).map((e) => ({
          id: e.id,
          pos: { x: e.pos.x, z: e.pos.z },
          hp: e.hp,
          radius: e.radius,
        })),
        trace = traceShotgun(p.pos, bearing, targets, (a, b) => g.world.lineClear(a, b), data.payload, tracePistol);
      if (trace) {
        const paid = dispatch?.(g, { type: "fire", field }, true);
        if (paid?.ok) {
          emit(g, "shot", {
            origin: { ...p.pos },
            direction: { ...bearing },
            end: { x: p.pos.x + bearing.x * data.rules.range, z: p.pos.z + bearing.z * data.rules.range },
            distance: data.rules.range,
            damage: data.rules.damage,
            pellets: trace.pellets,
            kind: "bullet",
            weapon: "shotgun",
            actor: p,
          });
          for (const hit of trace.hits) {
            const rays = trace.pellets.filter((ray) => ray.targetId === hit.targetId),
              direction = normal(
                rays.reduce((sum, ray) => ({ x: sum.x + ray.direction.x, z: sum.z + ray.direction.z }), { x: 0, z: 0 }),
                bearing,
              );
            applyHit({ targetId: hit.targetId, direction }, "shotgun", data.itemId, hit.damage, "bullet");
          }
        }
      }
    } else {
      const target = throwTarget(g, intent, reference);
      g.grenadeAim = target?.position ?? null;
      if (target) {
        const id = "grenade:" + g.tick + ":" + (g.grenadeSequence ?? 0),
          proposal = grenadeModel(g).proposeThrow(
            { charges: state.magazine, time: g.time },
            p.pos,
            target.position,
            g.world.areaId,
            id,
          );
        if (proposal) {
          const row = {
              intent: proposal.active,
              origin: { ...p.pos },
              direction: { ...target.direction },
              paidTick: g.tick,
              paidTime: g.time,
            },
            ready = g.grenadeMode !== "sticky" || startStickyGrenade(g, row, services);
          const paid = ready && dispatch?.(g, { type: "fire", field }, true);
          if (paid?.ok) {
            g.grenadeSequence = (g.grenadeSequence ?? 0) + 1;
            (g.activeGrenades ??= []).push(row);
            emit(g, "grenade-throw", {
              actor: p,
              weapon: "grenade",
              id,
              origin: { ...p.pos },
              position: { ...target.position },
              detonateAt: proposal.active.detonateAt,
            });
          }
        }
      }
    }
  }
  if (field === "grenade") g.grenadeAim = throwTarget(g, intent, reference)?.position ?? null;
  p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  return {
    ...intent,
    aim: explicit || moving ? reference : null,
    guard: false,
    guardPressed: false,
    actions: [],
    held: [],
  };
}
export function stepBossGrenades(g, applyHit, services = {}) {
  const pending = g.activeGrenades ?? [];
  if (!pending.length) return;
  g.activeGrenades = [];
  if (g.finished || g.player.hp <= 0) return;
  const data = g.world.bossEquipmentData?.grenade;
  if (!data) return;
  for (const row of pending) {
    if (row.intent.areaId !== g.world.areaId) continue;
    if (row.mode === "sticky" && !stepStickyGrenade(g, row, services)) continue;
    const victims = g.enemies.map((e) => ({
      victimId: e.placementKey ?? String(e.id),
      areaId: g.world.areaId,
      position: { x: e.pos.x, z: e.pos.z },
      hp: e.hp,
      eligible: g.world.lineClear(row.intent.position, e.pos),
    }));
    const proposed = grenadeModel(g).proposeDetonation(row.intent, g.time, g.world.areaId, victims);
    if (!proposed) continue;
    if (proposed.active) {
      g.activeGrenades.push({ ...row, intent: proposed.active });
      continue;
    }
    // Consume the transient intent before callbacks; no stale active grenade can damage again.
    const blast = proposed.blast;
    if (!blast) continue;
    const clock = bossEquipmentClock(g, "grenade");
    clock.lastBlast = { id: blast.id, tick: g.tick, paidTick: row.paidTick, paidTime: row.paidTime };
    emit(g, "grenade-blast", {
      weapon: "grenade",
      actor: g.player,
      id: blast.id,
      position: { ...blast.position },
      radius: data.payload.radius,
    });
    for (const hit of blast.hits) {
      const e = g.enemies.find((e) => (e.placementKey ?? String(e.id)) === hit.victimId && e.hp > 0);
      if (!e) continue;
      const direction = normal({ x: e.pos.x - blast.position.x, z: e.pos.z - blast.position.z }, row.direction);
      applyHit({ targetId: e.id, direction }, "grenade", data.itemId, hit.damage, "blast");
    }
  }
}
export function paidBossEquipmentDeath(g, itemId) {
  const field = Object.keys(g.world.bossEquipmentData ?? {}).find(
      (field) => g.world.bossEquipmentData[field].itemId === itemId,
    ),
    clock = field && g.bossEquipmentAction?.[field];
  if (!clock || clock.lastDamageTick !== g.tick) return false;
  if (field === "commanderPistol")
    return (
      g.player.weapon === "railgun" &&
      g.bossEquipment.commanderPistol.selected &&
      clock.paidTick === g.tick &&
      clock.paidRounds === 1
    );
  if (field === "shotgun")
    return (
      g.player.weapon === "shotgun" &&
      g.bossEquipment?.shotgun?.selected &&
      clock.paidTick === g.tick &&
      clock.paidRounds === 1
    );
  return (
    ["grenade", "rocketLauncher"].includes(field) &&
    clock.lastBlast?.tick === g.tick &&
    Number.isInteger(clock.lastBlast.paidTick) &&
    clock.lastBlast.paidTick >= 0 &&
    clock.lastBlast.paidTick < g.tick &&
    Number.isFinite(clock.lastBlast.paidTime) &&
    clock.lastBlast.paidTime < g.time
  );
}

export function bossWeaponCue(g, { paused = false, visibleIds } = {}) {
  const field = selectedBossRanged(g);
  if (!field || paused || g.finished || g.player.hp <= 0) return null;
  const clock = bossEquipmentClock(g, field),
    state = g.bossEquipment[field],
    result = ["shotgun", "commanderPistol"].includes(field)
      ? resolveRangedAim(g, g.bossWeaponFacing ?? g.player.facing, { visibleIds })
      : null;
  const position = field === "grenade" ? g.grenadeAim : field === "rocketLauncher" ? g.rocketAim : result?.position,
    targetId =
      field === "grenade" ? g.grenadeAimTargetId : field === "rocketLauncher" ? g.rocketAimTargetId : result?.targetId;
  return position
    ? {
        position,
        height: field === "grenade" ? 0.08 : field === "rocketLauncher" ? (g.rocketAimHeight ?? 0.05) : result.height,
        ground: field === "grenade",
        heightLocked: field === "rocketLauncher",
        targetId: targetId ?? null,
        ready:
          !g.runSaveInvalid &&
          !g.player.swing &&
          g.time >= (g.player.ready ?? 0) &&
          g.time >= (g.player.hurtUntil ?? 0) &&
          g.time >= (g.player.dodgeUntil ?? 0) &&
          !!g.bossEquipmentAssetReady?.[field] &&
          state.magazine > 0 &&
          !clock.reloadingUntil &&
          g.time >= clock.nextFireAt,
      }
    : null;
}
