import { point } from "./shared-checks.js";
export function createAreaHazard({ ownerId, areaId, position, time, config }, existing = []) {
  if (
    !Number.isInteger(ownerId) ||
    typeof areaId !== "string" ||
    !point(position) ||
    !Number.isFinite(time) ||
    time < 0 ||
    !config ||
    ![config.warning, config.radius, config.duration, config.interval, config.damage].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw TypeError("Invalid area hazard");
  if (existing.some((h) => h.ownerId === ownerId && h.areaId === areaId && h.expiresAt > time)) return null;
  return {
    ownerId,
    areaId,
    position: { ...position },
    radius: config.radius,
    damage: config.damage,
    interval: config.interval,
    startsAt: time + config.warning,
    expiresAt: time + config.warning + config.duration,
    nextTickAt: time + config.warning,
  };
}
// One simulation-time tick at most per source, never a catch-up damage burst.
export function stepAreaHazards(hazards, { time, areaId, owners, player, lineClear }) {
  if (!Number.isFinite(time) || !Array.isArray(hazards) || typeof lineClear !== "function")
    throw TypeError("Invalid hazard step");
  const alive = new Set(owners.filter((e) => e.hp > 0).map((e) => e.id)),
    next = [],
    hits = [],
    seen = new Set();
  if (!(player?.hp > 0)) return { hazards: next, hits };
  for (const h of hazards) {
    if (h.areaId !== areaId || !alive.has(h.ownerId) || time >= h.expiresAt || seen.has(h.ownerId)) continue;
    seen.add(h.ownerId);
    const row = { ...h, position: { ...h.position } };
    next.push(row);
    if (time < h.startsAt || time + 1e-9 < h.nextTickAt) continue;
    row.nextTickAt = time + h.interval;
    if (
      point(player.pos) &&
      Math.hypot(player.pos.x - h.position.x, player.pos.z - h.position.z) <= h.radius &&
      lineClear(h.position, player.pos)
    )
      hits.push({ ownerId: h.ownerId, damage: h.damage, position: { ...h.position } });
  }
  return { hazards: next, hits };
}
// Steps the run's hazards against its player and delivers each tick's damage through `receive` (combat's knifeReceive).
export function applyAreaHazards(g, receive) {
  const next = stepAreaHazards(g.areaHazards, {
    time: g.time,
    areaId: g.world.areaId,
    owners: g.enemies,
    player: g.player,
    lineClear: (a, b) => g.world.lineClear(a, b),
  });
  g.areaHazards = next.hazards;
  for (const hit of next.hits) {
    receive(g, {
      amount: hit.damage,
      origin: hit.position,
      attacker: g.enemies.find((e) => e.id === hit.ownerId),
      block: false,
      parry: false,
      moveId: "area-poison",
      def: { stagger: 0, chip: 0 },
    });
    if (g.finished) {
      g.areaHazards = [];
      break;
    }
  }
}
