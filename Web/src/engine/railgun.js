import { rangedTargets, resolveRangedAim, withChained } from "../pistol-targeting.js";
import { tracePistol } from "../pistol.js";
import { chainedSight } from "./chain-break.js";
import { bossEquipmentClock } from "./boss-equipment-data.js";
import { safehouseWeaponBlocked, safehouseTouches } from "./safehouse.js";
import { RAILGUN_ITEM_ID } from "./railgun-core.js";
// The Light Machine Gun. It keeps the Thundercoil's item id, receipt, weapon key and save keys (saves and server receipts are unchanged);
// only its behaviour is new: hold FIRE and it keeps shooting at rules.cadence, each bullet leaves inside a small spread cone around the
// auto-aimed line (resolveRangedAim, the same lock the pistol and rifle use), and every number is the weapon's row in weapons.json.
const EPS = 1e-8,
  HALF_TURN_DEGREES = 180, // tuning-ok: degrees in half a turn, to turn the spread row into radians
  CENTRE = 0.5, // tuning-ok: the middle of the unit interval, so the spread offset is symmetric about the aim
  FIRE_KINDS = ["fire", "slash"],
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
// Bullet n leaves at a fixed fraction of the spread cone: a golden-ratio stride gives an even, repeatable scatter with no random source.
export function spreadDirection(direction, automatic, shot) {
  const fraction = (shot * automatic.spreadStride) % 1,
    angle = ((fraction - CENTRE) * automatic.spreadDegrees * Math.PI) / HALF_TURN_DEGREES,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  return { x: direction.x * cos - direction.z * sin, z: direction.x * sin + direction.z * cos };
}
// A flinch: the target's staggerUntil is pushed out briefly. It is shorter than the firing interval (validated), so a held stream
// staggers each hit without locking the target out of acting.
function flinch(g, e, automatic) {
  const seconds = e.bossProfile ? automatic.bossStaggerSeconds : automatic.staggerSeconds;
  if (seconds > 0) e.staggerUntil = Math.max(e.staggerUntil ?? 0, g.time + seconds);
}
export function railgunIntent(g, intent, dispatch, applyHit) {
  const p = g.player,
    data = g.world.bossEquipmentData.commanderPistol,
    clock = bossEquipmentClock(g, "commanderPistol"),
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
    clock.reloadingUntil = 0;
    return clear;
  }
  if (actions.includes("heavy")) {
    dispatch?.(g, { type: "equip", itemId: RAILGUN_ITEM_ID, equipped: false }, true);
    return clear;
  }
  if (clock.reloadingUntil > 0 && g.time + EPS >= clock.reloadingUntil) {
    const result = dispatch?.(g, { type: "reload", field: "commanderPistol" }, true);
    if (!result?.ok) clock.reloadingUntil = 0;
    state = g.bossEquipment.commanderPistol;
  }
  if (
    (actions.includes("stab") || state.magazine === 0) &&
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
      ? withChained(g, g.enemies).find(
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
  const firing =
    FIRE_KINDS.some((kind) => actions.includes(kind) || intent.held?.includes(kind)) ||
    !!intent.actionEdges?.held?.some((e) => FIRE_KINDS.includes(e.kind));
  const ready =
    !!g.bossEquipmentAssetReady?.commanderPistol &&
    state.magazine > 0 &&
    !clock.reloadingUntil &&
    g.time + EPS >= clock.nextFireAt;
  if (!firing || !ready || !bearing) return clear;
  // Auto-aim: the reticle lock the pistol and rifle use (touch target, nearest valid enemy, the shackled Pitborn's stand-in).
  const visibleIds = intent.combatVisibleIds ?? intent.pistolVisibleIds,
    aimed = resolveRangedAim(g, bearing, { visibleIds })?.trace.direction ?? bearing;
  clock.shots = (clock.shots ?? 0) + 1;
  const direction = spreadDirection(aimed, data.automatic, clock.shots),
    targets = rangedTargets(g, visibleIds).map((e) => ({
      id: e.id,
      pos: { x: e.pos.x, z: e.pos.z },
      hp: e.hp,
      radius: e.radius,
    })),
    trace = tracePistol(p.pos, direction, targets, chainedSight(g), data.rules);
  if (!trace) return clear;
  const paid = dispatch?.(g, { type: "fire", field: "commanderPistol" }, true);
  if (!paid?.ok) return clear;
  g.events.push({
    type: "shot",
    actor: p,
    weapon: "railgun",
    kind: "bullet",
    origin: { ...trace.origin },
    end: { ...trace.end },
    direction: { ...trace.direction },
    targetId: trace.targetId,
    distance: Math.hypot(trace.end.x - trace.origin.x, trace.end.z - trace.origin.z),
    damage: data.rules.damage,
    tracerColour: data.automatic.tracerColour,
    tracerSeconds: data.automatic.tracerSeconds,
  });
  // The shackled Pitborn's stand-in is not in g.enemies: the shot event above is what snaps its chains, so there is nothing to damage.
  const hit = g.enemies.find(
    (e) =>
      e.id === trace.targetId &&
      e.hp > 0 &&
      e.hostile !== false &&
      (e.areaId == null || e.areaId === g.world.areaId) &&
      !safehouseTouches(g, e.pos, e.radius),
  );
  if (hit) {
    applyHit?.({ targetId: hit.id, direction: trace.direction }, "railgun", RAILGUN_ITEM_ID, data.rules.damage, "bullet");
    if (hit.hp > 0) flinch(g, hit, data.automatic);
  }
  return clear;
}
