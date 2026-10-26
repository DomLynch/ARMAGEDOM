import { createStickyAttachmentModel } from "./sticky-grenade-state.js";
import { GRENADE_FUSE_SECONDS, GRENADE_VIEW } from "./grenade-view-data.js";
const model = (g) =>
  g.stickyGrenadeModel ?? (g.stickyGrenadeModel = createStickyAttachmentModel({ areaIds: g.world.registry.ids }));
const target = (g, e) =>
  e
    ? {
        victimId: e.placementKey ?? String(e.id),
        areaId: g.world.areaId,
        position: { x: e.pos.x, z: e.pos.z },
        yaw: Math.atan2(e.facing.x, e.facing.z),
        hp: e.hp,
      }
    : null;
export function grenadeFlightPoint(row, time) {
  const t = Math.max(0, Math.min(1, (time - (row.intent.detonateAt - GRENADE_FUSE_SECONDS)) / GRENADE_VIEW.flightSeconds)),
    start = row.flightStart;
  return {
    x: start.x + (row.landing.x - start.x) * t,
    y: start.y + (GRENADE_VIEW.groundHeight - start.y) * t + Math.sin(Math.PI * t) * GRENADE_VIEW.arcHeight,
    z: start.z + (-row.landing.z - start.z) * t,
  };
}
export function startStickyGrenade(g, row, services) {
  const start = services.grenadeSource?.(g);
  if (!start || ![start.x, start.y, start.z].every(Number.isFinite)) return false;
  if (!g.world.lineClear(g.player.pos, { x: start.x, z: -start.z })) return false;
  row.mode = "sticky";
  row.flightStart = { ...start };
  row.landing = { ...row.intent.position };
  row.surfacePosition = { ...start };
  return true;
}
export function stepStickyGrenade(g, row, services) {
  const m = model(g);
  if (row.sticky) {
    const enemy =
        row.sticky.attachment &&
        g.enemies.find((e) => (e.placementKey ?? String(e.id)) === row.sticky.attachment.victimId),
      next = m.follow(row.sticky, target(g, enemy), g.world.areaId);
    if (!next?.active) return false;
    if (next.attachment) {
      const point = services.grenadeFollow?.(g, row.anchor, enemy);
      if (!point) return false;
      row.surfacePosition = point;
      next.active.position = { x: point.x, z: -point.z };
    } else row.anchor = null;
    row.sticky = next;
    row.intent = next.active;
    return true;
  }
  const point = grenadeFlightPoint(row, g.time),
    hit = services.grenadeTrace?.(g, row.surfacePosition, point);
  if (hit) {
    const position = { x: hit.position.x, z: -hit.position.z };
    if (!g.world.lineClear(row.origin, position)) return false;
    const sticky = m.attach(
      row.intent,
      { confirmed: true, victimId: hit.enemy.placementKey ?? String(hit.enemy.id), areaId: g.world.areaId, position },
      target(g, hit.enemy),
    );
    if (!sticky?.active) return false;
    row.sticky = sticky;
    row.intent = sticky.active;
    row.anchor = hit.anchor;
    row.surfacePosition = hit.position;
    g.events.push({
      type: "grenade-attach",
      id: row.intent.id,
      victimId: sticky.attachment.victimId,
      position,
      detonateAt: row.intent.detonateAt,
    });
  } else {
    row.surfacePosition = point;
    if (g.time >= row.intent.detonateAt - GRENADE_FUSE_SECONDS + GRENADE_VIEW.flightSeconds) {
      row.sticky = m.attach(
        row.intent,
        { confirmed: true, victimId: null, areaId: g.world.areaId, position: row.landing },
        null,
      );
      if (!row.sticky?.active) return false;
      row.intent = row.sticky.active;
    }
  }
  return true;
}
