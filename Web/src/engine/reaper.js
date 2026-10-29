import { closedData } from "./progression-state.js";
import { safehouseWeaponBlocked, safehouseTouches, safehouseBlocksSegment } from "./safehouse.js";
import { GAME_DATA } from "./game-data.js";
const MOTION = GAME_DATA.reaperMotion; // data/reaperMotion.json: the step bound and the orbit speed
export const REAPER_ITEM_ID = "watchmans-pistol-v1";
export const REAPER_RECEIPT = "west-east-stolen-supply-v1:watchmans-pistol-v1";
const REAPER_ACTOR_ID = -1;
// The rule values live only in area-content.json `reaper.rules`; this is just the closed set of names the validator accepts.
const RULE_KEYS = ["damage", "range", "cadence", "windup", "boltSpeed", "boltRange", "orbitRadius", "followSpeed"];
export function ownsReaper(g) {
  return (
    g.expedition?.status === "claimed" &&
    g.expedition.rewardReceipt === (g.world?.reaperData?.receiptId ?? REAPER_RECEIPT)
  );
}
export function reaperSelected(g) {
  return (
    !!g.world?.reaperData &&
    ownsReaper(g) &&
    g.expedition.selectedPistolVariant === REAPER_ITEM_ID &&
    !(g.locker?.weapons ?? []).includes(REAPER_ITEM_ID) &&
    !g.reaper?.recalled
  );
}
export function stopReaper(g, reason = "cancel") {
  if (!g) return;
  const s = g.reaper;
  if (s) {
    if (s.warning || s.targetId != null)
      g.events?.push({ type: "reaper-stop", actor: s.actor, reason, weapon: REAPER_ITEM_ID, ownerId: 0 });
    s.warning = null;
    s.targetId = null;
    if (reason === "travel") s.areaId = null;
  }
  g.bolts = (g.bolts ?? []).filter((b) => b.source !== "reaper");
}
export function reaperLegalTarget(g, e, origin) {
  const r = g.world.reaperData.rules;
  return (
    !!e &&
    e.id !== 0 &&
    e.id !== REAPER_ACTOR_ID &&
    e.hp > 0 &&
    e.hostile !== false &&
    e.visible !== false &&
    (e.areaId == null || e.areaId === g.world.areaId) &&
    Math.hypot(e.pos.x - origin.x, e.pos.z - origin.z) <= r.range &&
    !safehouseTouches(g, e.pos, e.radius) &&
    g.world.lineClear(origin, e.pos) &&
    !safehouseBlocksSegment(g, origin, e.pos)
  );
}
export function reaperTarget(g, origin) {
  const selected = g.touchTarget,
    e =
      selected?.areaId === g.world.areaId
        ? g.enemies.find((e) => e.id === selected.id && (e.placementKey ?? String(e.id)) === selected.key)
        : null;
  if (reaperLegalTarget(g, e, origin)) return e;
  return (
    g.enemies
      .filter((e) => reaperLegalTarget(g, e, origin))
      .sort(
        (a, b) =>
          Math.hypot(a.pos.x - origin.x, a.pos.z - origin.z) - Math.hypot(b.pos.x - origin.x, b.pos.z - origin.z) ||
          a.id - b.id,
      )[0] ?? null
  );
}
export function stepReaper(g, dt, { source, trace, aimHeight, emitBolt, hit } = {}) {
  const r = g.world.reaperData?.rules;
  if (!r) return;
  if (!Number.isFinite(dt) || dt <= 0 || dt > MOTION.maxStepSeconds) throw TypeError("Finite Reaper step required");
  const p = g.player;
  if (
    !reaperSelected(g) ||
    g.finished ||
    g.runSaveInvalid ||
    p.hp <= 0 ||
    safehouseWeaponBlocked(g) ||
    g.weaponsLowered ||
    g.reaperContextPaused
  ) {
    stopReaper(g, "unavailable");
    return;
  }
  const s = (g.reaper ??= {
    actor: { id: REAPER_ACTOR_ID, kind: 0, pos: { ...p.pos }, facing: { x: 0, z: 1 } },
    areaId: g.world.areaId,
    nextAttackAt: g.time,
    warning: null,
    targetId: null,
  });
  if (s.areaId !== g.world.areaId) {
    stopReaper(g, "area");
    s.areaId = g.world.areaId;
    s.actor.pos = { ...p.pos };
  }
  const goal = {
      x: p.pos.x + Math.cos(g.time * MOTION.orbitRate) * r.orbitRadius,
      z: p.pos.z + Math.sin(g.time * MOTION.orbitRate) * r.orbitRadius,
    },
    dx = goal.x - s.actor.pos.x,
    dz = goal.z - s.actor.pos.z,
    n = Math.hypot(dx, dz),
    step = Math.min(n, r.followSpeed * dt);
  if (n) {
    s.actor.pos.x += (dx / n) * step;
    s.actor.pos.z += (dz / n) * step;
  }
  // Existing finite projectile list/presentation; friendly ownership never enters hostile NPC/death identity.
  for (const b of g.bolts ?? []) {
    if (b.source !== "reaper" || b.dead) continue;
    if (g.time >= b.expires || b.areaId !== g.world.areaId) {
      b.dead = true;
      continue;
    }
    const next = { x: b.pos.x + b.dir.x * b.speed * dt, z: b.pos.z + b.dir.z * b.speed * dt },
      height = b.height + b.dir.y * b.speed * dt;
    if (!g.world.lineClear(b.pos, next) || safehouseBlocksSegment(g, b.pos, next)) {
      b.dead = true;
      continue;
    }
    const contact = trace?.(g, { x: b.pos.x, y: b.height, z: -b.pos.z }, { x: next.x, y: height, z: -next.z });
    if (contact) {
      b.dead = true;
      const e = contact.enemy;
      if (
        e?.hp > 0 &&
        e.hostile !== false &&
        (e.areaId == null || e.areaId === g.world.areaId) &&
        !safehouseTouches(g, e.pos, e.radius)
      ) {
        s.lastDamageTick = g.tick;
        s.lastDamageTargetId = e.id;
        s.lastDamageAmount = r.damage;
        hit?.({ targetId: e.id, direction: { x: b.dir.x, z: b.dir.z } }, r.damage);
        g.events.push({
          type: "reaper-hit",
          actor: s.actor,
          targetId: e.id,
          amount: r.damage,
          weapon: REAPER_ITEM_ID,
          ownerId: 0,
        });
      }
    } else {
      b.pos = next;
      b.height = height;
    }
  }
  const target = reaperTarget(g, s.actor.pos);
  s.targetId = target?.id ?? null;
  if (!target) {
    s.warning = null;
    return;
  }
  const tx = target.pos.x - s.actor.pos.x,
    tz = target.pos.z - s.actor.pos.z,
    len = Math.hypot(tx, tz) || 1;
  s.actor.facing = { x: tx / len, z: tz / len };
  if (s.warning) {
    if (s.warning.targetId !== target.id) {
      s.warning = null;
      return;
    }
    if (g.time + 1e-8 < s.warning.releaseAt) return;
    const start = source?.(g);
    s.warning = null;
    if (
      !start ||
      (g.bolts ?? []).filter((b) => b.source === "reaper" && !b.dead).length >=
        Math.ceil(r.boltRange / r.boltSpeed / r.cadence) + 1
    )
      return;
    const end = g.world.toRender(target.pos, start.y);
    end.y = aimHeight?.(g, start, end, target.id) ?? start.y;
    const ax = end.x - start.x,
      ay = end.y - start.y,
      az = end.z - start.z,
      length = Math.hypot(ax, ay, az);
    if (!(length > 0)) return;
    const bolt = {
      source: "reaper",
      ownerId: 0,
      areaId: g.world.areaId,
      pos: { x: start.x, z: -start.z },
      height: start.y,
      dir: { x: ax / length, y: ay / length, z: -az / length },
      speed: r.boltSpeed,
      born: g.time,
      expires: g.time + r.boltRange / r.boltSpeed,
      amount: r.damage,
    };
    emitBolt?.(bolt);
    g.events.push({ type: "reaper-shot", actor: s.actor, targetId: target.id, weapon: REAPER_ITEM_ID, ownerId: 0 });
    return;
  }
  if (g.time + 1e-8 < s.nextAttackAt) return;
  s.nextAttackAt = g.time + r.cadence;
  s.warning = { targetId: target.id, start: g.time, releaseAt: g.time + r.windup };
  g.events.push({ type: "reaper-warning", actor: s.actor, targetId: target.id, weapon: REAPER_ITEM_ID, ownerId: 0 });
}
export function validateReaperData(input, expedition) {
  if (input === undefined) return null;
  const keys = ["version", "itemId", "name", "receiptId", "visual", "rules"];
  if (
    !closedData(input, keys) ||
    input.version !== 1 ||
    input.itemId !== REAPER_ITEM_ID ||
    input.receiptId !== REAPER_RECEIPT ||
    input.name !== GAME_DATA.combatText.rewardNames.reaper ||
    input.visual !== "low-hover-watcher" ||
    expedition?.contract.rewardVariantId !== input.itemId ||
    expedition.contract.receiptId !== input.receiptId ||
    !closedData(input.rules, RULE_KEYS) ||
    !RULE_KEYS.every((k) => Number.isFinite(input.rules[k]) && input.rules[k] > 0) ||
    input.rules.cadence < input.rules.windup ||
    input.rules.cadence < 0.5 ||
    input.rules.windup < 0.05 ||
    input.rules.boltSpeed < 4 ||
    input.rules.range < 1 ||
    input.rules.orbitRadius < 0.5 ||
    input.rules.followSpeed < 1 ||
    input.rules.range > 12 ||
    input.rules.damage > 40 ||
    input.rules.boltSpeed > 20 ||
    input.rules.boltRange > 12 ||
    input.rules.orbitRadius > 2 ||
    input.rules.followSpeed > 12
  )
    throw TypeError("Invalid Reaper catalogue");
  return Object.freeze({ ...input, rules: Object.freeze({ ...input.rules }) });
}
