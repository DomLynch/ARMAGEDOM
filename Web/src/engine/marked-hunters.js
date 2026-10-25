import { safehouseTouches, safehouseSite, safehouseBlocksSegment } from "./safehouse.js";
import { bodyLineClear, createBridgeSteering } from "../bridge-steering.js";
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function clearMarkedHunters(g, { areaId = g.world.areaId, death = false } = {}) {
  if (!g.world.markedData) return;
  const hadHunter = g.enemies.some((e) => e.markedHunter && e.hp > 0);
  g.enemies = g.enemies.filter((e) => !e.markedHunter);
  if (g.corpses) g.corpses = g.corpses.filter((e) => !e.markedHunter);
  const old = g.markedHunt,
    c = g.world.markedData;
  g.markedHunt = {
    areaId,
    arrivedAt: g.time,
    // Death restarts the first-arrival wait. Leaving an area with a hunter alive counts as the hunter leaving: the next one comes
    // after the re-arrival delay (the first-arrival wait for the new area still applies on top of it).
    nextSpawnAt: death
      ? g.time + c.arrivalDelay
      : hadHunter
        ? Math.max(old?.nextSpawnAt ?? 0, g.time + c.respawnDelay)
        : (old?.nextSpawnAt ?? g.time),
    hadHunter: false,
    warning: null,
    nextAttemptAt: g.time,
  };
}
export function markedEntry(g, { position = null } = {}) {
  const w = g.world,
    config = w.markedData,
    registry = w.registry,
    geometry = w.geometry;
  if (!config || !geometry || !registry) return null;
  const points = [
      registry.get(w.areaId).entry,
      ...registry.ids.flatMap((id) =>
        registry
          .links(id)
          .filter((link) => link.to === w.areaId)
          .map((link) => link.entry),
      ),
    ],
    seen = new Set(),
    navigation = (g.bridgeSteering ??= createBridgeSteering());
  const gates = registry
    .links(w.areaId)
    .filter((l) => l.requiresDefeat || l.requiresVisited)
    .map((l) =>
      geometry.ground({
        x:
          l.condition.xMin !== undefined && l.condition.xMax !== undefined
            ? (l.condition.xMin + l.condition.xMax) / 2
            : (l.condition.xMin ?? l.condition.xMax ?? 0.5),
        y:
          l.condition.yMin !== undefined && l.condition.yMax !== undefined
            ? (l.condition.yMin + l.condition.yMax) / 2
            : (l.condition.yMin ?? l.condition.yMax ?? 0.5),
      }),
    );
  const candidates = [];
  for (const point of points) {
    const key = point.x + ":" + point.y;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = geometry.ground(point);
    if (position && gap(p, position) > 1e-8) continue;
    if (
      gap(p, g.player.pos) < config.minSpawnDistance ||
      !geometry.clear(p, 0.4) ||
      safehouseTouches(g, p, 0.43) ||
      w.travelAt?.(p) ||
      gates.some((q) => gap(p, q) < 2) ||
      g.enemies.some((e) => e.hp > 0 && gap(p, e.pos) < (e.radius ?? 0.4) + 0.65)
    )
      continue;
    const probe = { pos: p, home: p, radius: 0.4 },
      target = navigation.steer({ world: w, actor: probe, goal: g.player.pos, time: g.time, leash: Infinity });
    if (!bodyLineClear(geometry, p, target, 0.4) || safehouseBlocksSegment(g, p, target)) continue;
    candidates.push(p);
  }
  return candidates.sort((a, b) => gap(b, g.player.pos) - gap(a, g.player.pos))[0] ?? null;
}
// One finite tier, one simulation clock and existing actor/nav/movement owners.
export function stepMarkedHunters(g, spawn) {
  const c = g.world.markedData;
  if (!c) return;
  if (c.hunters === false) {
    if (g.enemies.some((e) => e.markedHunter)) clearMarkedHunters(g);
    return;
  }
  if (g.player.hp <= 0) {
    clearMarkedHunters(g, { death: true });
    return;
  }
  if (!g.markedHunt || g.markedHunt.areaId !== g.world.areaId) clearMarkedHunters(g);
  const s = g.markedHunt;
  // A hunter that has died is gone: the next one comes after the re-arrival delay.
  const present = g.enemies.some((e) => e.markedHunter && e.hp > 0);
  if (s.hadHunter && !present) s.nextSpawnAt = Math.max(s.nextSpawnAt, g.time + c.respawnDelay);
  s.hadHunter = present;
  if (
    g.finished ||
    g.runSaveInvalid ||
    !g.marked ||
    g.marked.bounty < c.hunterBounty ||
    safehouseSite(g.world)?.wholeArea ||
    safehouseTouches(g, g.player.pos, g.player.radius)
  ) {
    s.warning = null;
    return;
  }
  const alive = g.enemies.filter((e) => e.hp > 0 && e.hostile !== false),
    hunters = alive.filter((e) => e.markedHunter);
  if (hunters.length >= c.maxHunters || alive.length >= c.hostileBudget) {
    s.warning = null;
    return;
  }
  if (g.time < s.arrivedAt + c.arrivalDelay || g.time < s.nextSpawnAt || g.time < s.nextAttemptAt) return;
  if (!s.warning) {
    const p = markedEntry(g);
    s.nextAttemptAt = g.time + 1;
    if (!p) return;
    s.warning = { position: p, startedAt: g.time, arrivesAt: g.time + c.warningSeconds };
    g.message = "HUNTER INBOUND · find cover or reach a safehouse.";
    g.messageUntil = s.warning.arrivesAt;
    g.events.push({ type: "marked-hunter-warning", position: { ...p }, seconds: c.warningSeconds });
    return;
  }
  if (g.time + 1e-8 < s.warning.arrivesAt) return;
  const p = s.warning.position;
  s.warning = null;
  s.nextAttemptAt = g.time + 1;
  if (!markedEntry(g, { position: p })) return;
  g.corpses = (g.corpses ?? []).filter((e) => !e.markedHunter);
  const actor = spawn(p, c);
  g.enemies.push(actor);
  s.nextSpawnAt = g.time + c.spawnCooldown;
  g.events.push({ type: "marked-hunter-arrived", actor, position: { ...p } });
  g.message = "A hunter is after you";
  g.messageUntil = g.time + 4;
}
