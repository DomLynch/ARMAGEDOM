import { combatTargetHeight, rangedTargets, resolveRangedAim } from "../pistol-targeting.js";
import { bossEquipmentClock } from "./boss-equipment-data.js";
import { safehouseWeaponBlocked, safehouseBlocksSegment, safehouseTouches } from "./safehouse.js";
import { RAILGUN_ITEM_ID } from "./railgun-core.js";
const EPS = 1e-8,
  normal = (v) => {
    const n = Math.hypot(v?.x ?? 0, v?.z ?? 0);
    return n > EPS ? { x: v.x / n, z: v.z / n } : null;
  };
export function railgunSelected(g) {
  const p = g.world?.bossEquipmentData?.commanderPistol,
    s = g.bossEquipment?.commanderPistol;
  return (
    p?.weaponKey === "railgun" &&
    s?.status === "owned" &&
    s.selected &&
    s.rewardReceipt === p.source.receiptId &&
    g.player.weapon === "railgun"
  );
}
export function stopRailgun(g, reason = "cancel") {
  if (!g?.railgunCharge) return;
  g.railgunCharge = null;
  g.railgunStatus = { reason, until: g.time + g.world.bossEquipmentData.commanderPistol.charge.statusSeconds };
  g.events?.push({ type: "railgun-charge-stop", actor: g.player, weapon: "railgun", reason });
}
export function railgunIntent(g, intent, dispatch, applyHit, services = {}) {
  const p = g.player,
    data = g.world.bossEquipmentData.commanderPistol,
    clock = bossEquipmentClock(g, "commanderPistol"),
    edges = intent.actionEdges ?? { started: [], held: [], released: [] },
    actions = intent.actions ?? [],
    clear = { ...intent, actions: [], held: [], guard: false, guardPressed: false };
  let state = g.bossEquipment.commanderPistol;
  const legal =
    railgunSelected(g) &&
    p.hp > 0 &&
    !g.finished &&
    !g.runSaveInvalid &&
    !g.weaponsLowered &&
    !safehouseWeaponBlocked(g) &&
    !intent.cancel &&
    !intent.paused &&
    !intent.dodge &&
    !p.swing &&
    g.time >= (p.ready ?? 0) &&
    g.time >= (p.hurtUntil ?? 0) &&
    g.time >= (p.dodgeUntil ?? 0);
  if (!legal) {
    stopRailgun(g, "interrupted");
    clock.reloadingUntil = 0;
    return clear;
  }
  if (actions.includes("heavy")) {
    const result = dispatch?.(g, { type: "equip", itemId: RAILGUN_ITEM_ID, equipped: false }, true);
    if (result?.ok) stopRailgun(g, "equip");
    return clear;
  }
  if (clock.reloadingUntil > 0 && g.time + EPS >= clock.reloadingUntil) {
    const result = dispatch?.(g, { type: "reload", field: "commanderPistol" }, true);
    if (!result?.ok) clock.reloadingUntil = 0;
    state = g.bossEquipment.commanderPistol;
  }
  if (
    (actions.includes("stab") || state.magazine === 0) &&
    !g.railgunCharge &&
    !clock.reloadingUntil &&
    state.magazine < data.rules.capacity &&
    state.reserve > 0 &&
    g.time + EPS >= clock.nextFireAt
  ) {
    clock.reloadingUntil = g.time + data.rules.reload;
    g.events.push({ type: "reload-start", actor: p, weapon: "railgun", until: clock.reloadingUntil });
  }
  const selected =
    g.touchTarget?.areaId === g.world.areaId
      ? g.enemies.find(
          (e) =>
            e.id === g.touchTarget.id &&
            (e.placementKey ?? String(e.id)) === g.touchTarget.key &&
            e.hp > 0 &&
            e.hostile !== false &&
            (e.areaId == null || e.areaId === g.world.areaId),
        )
      : null;
  const bearing =
    normal(selected ? { x: selected.pos.x - p.pos.x, z: selected.pos.z - p.pos.z } : intent.aim) ?? normal(p.facing);
  if (bearing) {
    clear.aim = bearing;
    g.bossWeaponFacing = { ...bearing };
  }
  const ready =
    !!g.bossEquipmentAssetReady?.commanderPistol &&
    state.magazine > 0 &&
    !clock.reloadingUntil &&
    g.time + EPS >= clock.nextFireAt;
  if (!g.railgunCharge) {
    const start = edges.started.find((e) => ["fire", "slash"].includes(e.kind) && Number.isSafeInteger(e.lifetime));
    if (start && ready) {
      g.railgunCharge = {
        lifetime: start.lifetime,
        kind: start.kind,
        startedAt: g.time,
        readyAt: g.time + data.charge.seconds,
        areaId: g.world.areaId,
      };
      g.events.push({ type: "railgun-charge-start", actor: p, weapon: "railgun", seconds: data.charge.seconds });
    }
  }
  const charge = g.railgunCharge;
  if (!charge) return clear;
  if (!ready || charge.areaId !== g.world.areaId || g.time - charge.startedAt > data.charge.maxSeconds) {
    stopRailgun(g, "expired");
    return clear;
  }
  const released = edges.released.some((e) => e.lifetime === charge.lifetime && e.kind === charge.kind),
    held = edges.held.some((e) => e.lifetime === charge.lifetime && e.kind === charge.kind);
  if (!released) {
    if (!held) stopRailgun(g, "cancel");
    return clear;
  }
  if (g.time + EPS < charge.readyAt || !bearing) {
    stopRailgun(g, "early-release");
    return clear;
  }
  const source = services.railgunSource?.(g);
  if (!source || ![source.x, source.y, source.z].every(Number.isFinite)) {
    stopRailgun(g, "source-unavailable");
    return clear;
  }
  // No selected target: aim at the body the player faces, resolved exactly as the pistol and rifle do.
  const visibleIds = intent.combatVisibleIds ?? intent.pistolVisibleIds,
    aimedAt =
      selected ?? (rangedTargets(g, visibleIds).length ? resolveRangedAim(g, bearing, { visibleIds })?.target : null),
    target = aimedAt
      ? (services.railgunAimPoint?.(g, aimedAt.id) ?? {
          x: aimedAt.pos.x,
          y: combatTargetHeight(aimedAt, g.time),
          z: -aimedAt.pos.z,
        })
      : { x: source.x + bearing.x, y: source.y, z: source.z - bearing.z },
    dx = target.x - source.x,
    dy = target.y - source.y,
    dz = target.z - source.z,
    length = Math.hypot(dx, dy, dz);
  if (!(length > EPS)) {
    stopRailgun(g, "invalid-aim");
    return clear;
  }
  const full = {
      x: source.x + (dx / length) * data.rules.range,
      y: source.y + (dy / length) * data.rules.range,
      z: source.z + (dz / length) * data.rules.range,
    },
    rayDirection = normal({ x: dx, z: -dz }) ?? bearing;
  const origin = { x: source.x, z: -source.z },
    point = (t) => ({ x: origin.x + (full.x - source.x) * t, z: origin.z - (full.z - source.z) * t }),
    line = (t) => g.world.lineClear(origin, point(t)) && !safehouseBlocksSegment(g, origin, point(t));
  let fraction = 1;
  if (!g.world.lineClear(p.pos, origin)) fraction = 0;
  else if (!line(1)) {
    let low = 0,
      high = 1;
    for (let i = 0; i < 12; i++) { // tuning-ok: twelve halvings pin the first blocked point to a four-thousandth of the range
      const mid = (low + high) / 2; // tuning-ok: bisection takes the midpoint
      if (line(mid)) low = mid;
      else high = mid;
    }
    fraction = low;
  }
  const end = {
    x: source.x + (full.x - source.x) * fraction,
    y: source.y + (full.y - source.y) * fraction,
    z: source.z + (full.z - source.z) * fraction,
  };
  const paid = dispatch?.(g, { type: "fire", field: "commanderPistol" }, true);
  stopRailgun(g, paid?.ok ? "released" : "save-failed");
  if (!paid?.ok) return clear;
  // One bounded posed-body query at paid release. Preview/charge never scans body triangles.
  const hits = services.railgunTrace?.(g, source, end) ?? [];
  const struckable = (e) =>
    !!e &&
    e.hp > 0 &&
    e.hostile !== false &&
    (e.areaId == null || e.areaId === g.world.areaId) &&
    !safehouseTouches(g, e.pos, e.radius);
  const bodyPoint = (e) =>
    services.railgunAimPoint?.(g, e.id) ?? { x: e.pos.x, y: combatTargetHeight(e, g.time), z: -e.pos.z };
  // Lightning: the first living body on the ray takes the bolt, then it jumps to the nearest other living enemy within hopRange of
  // the last one that has a clear line, up to `jumps` times, each hop at hopDamageFactor of the last damage, stunning everyone it hits.
  const first = hits
    .map((h) => h.enemy)
    .filter(struckable)
    .sort((a, b) => Math.hypot(a.pos.x - origin.x, a.pos.z - origin.z) - Math.hypot(b.pos.x - origin.x, b.pos.z - origin.z))[0];
  const links = [];
  if (first) {
    let from = first,
      damage = data.rules.damage;
    const struck = new Set([first]);
    links.push({ from: { ...source }, to: bodyPoint(first), target: first, damage, direction: rayDirection });
    for (let hop = 0; hop < data.arc.jumps; hop++) {
      const next = g.enemies
        .filter(
          (e) =>
            !struck.has(e) &&
            struckable(e) &&
            Math.hypot(e.pos.x - from.pos.x, e.pos.z - from.pos.z) <= data.arc.hopRange &&
            g.world.lineClear(from.pos, e.pos) &&
            !safehouseBlocksSegment(g, from.pos, e.pos),
        )
        .sort(
          (a, b) =>
            Math.hypot(a.pos.x - from.pos.x, a.pos.z - from.pos.z) - Math.hypot(b.pos.x - from.pos.x, b.pos.z - from.pos.z),
        )[0];
      if (!next) break;
      damage = Math.round(damage * data.arc.hopDamageFactor);
      links.push({
        from: bodyPoint(from),
        to: bodyPoint(next),
        target: next,
        damage,
        direction: normal({ x: next.pos.x - from.pos.x, z: next.pos.z - from.pos.z }) ?? rayDirection,
      });
      struck.add(next);
      from = next;
    }
  }
  g.events.push({
    type: "railgun-shot",
    actor: p,
    weapon: "railgun",
    itemId: RAILGUN_ITEM_ID,
    origin: { ...source },
    end: links.length ? { ...links[0].to } : { ...end },
    direction: { x: dx / length, y: dy / length, z: -dz / length },
    targetIds: links.map((l) => l.target.id),
    damage: data.rules.damage,
  });
  // The bolt shown: muzzle to each target in turn, or to where the ray ended when nothing was in reach.
  const bolt = links.length ? links : [{ from: { ...source }, to: { ...end }, target: null, damage: 0 }];
  g.events.push({
    type: "arc-chain",
    actor: p,
    itemId: RAILGUN_ITEM_ID,
    links: bolt.map((l) => ({
      from: { ...l.from },
      to: { ...l.to },
      targetId: l.target?.id ?? null,
      damage: l.damage,
    })),
  });
  for (const link of links) {
    const e = link.target;
    applyHit?.({ targetId: e.id, direction: link.direction }, "railgun", RAILGUN_ITEM_ID, link.damage, "bullet");
    if (e.hp > 0) stunEnemy(g, e, data.arc);
  }
  return clear;
}
// A stun: the target loses its pending swing and cannot act until it ends. A boss keeps its committed swing and is held only briefly.
function stunEnemy(g, e, arc) {
  const seconds = e.bossProfile ? arc.bossStunSeconds : arc.stunSeconds;
  if (!(seconds > 0)) return;
  const until = g.time + seconds;
  e.staggerUntil = Math.max(e.staggerUntil ?? 0, until);
  e.stunUntil = Math.max(e.stunUntil ?? 0, until);
  if (!e.bossProfile) {
    e.swing = null;
    e.ready = Math.max(e.ready ?? 0, until);
  }
  g.events.push({ type: "arc-stun", actor: e, seconds });
}
