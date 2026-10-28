import { safehouseTouches, safehouseSite, safehouseBlocksSegment } from "./safehouse.js";
import { bodyLineClear, createBridgeSteering } from "../bridge-steering.js";
import { GAME_DATA } from "./game-data.js";
import { stepChainBreak } from "./chain-break.js";
const SPAWN = GAME_DATA.markedHunterSpawn; // data/markedHunterSpawn.json: spawn clearances and the arrival message time
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Relic hunters (cursed-relic.js) are marked hunters on their own timer and cap: the ordinary hunt never counts them, and only leaving
// the area, death or a safehouse removes them (keepRelic lets the "hunters off" switch leave them alone).
export function clearMarkedHunters(g, { areaId = g.world.areaId, death = false, keepRelic = false } = {}) {
  if (!g.world.markedData) return;
  const hadHunter = g.enemies.some((e) => e.markedHunter && !e.relicHunter && e.hp > 0);
  g.enemies = g.enemies.filter((e) => !e.markedHunter || (keepRelic && e.relicHunter));
  if (g.corpses) g.corpses = g.corpses.filter((e) => !e.markedHunter || (keepRelic && e.relicHunter));
  const old = g.markedHunt,
    c = g.world.markedData;
  g.markedHunt = {
    areaId,
    // The clock is per run, not per area: travel keeps `arrivedAt`, so the first-arrival wait (arrivalDelay) counts from the start
    // of the run (or from the last death) however many areas the player crosses.
    arrivedAt: death || !old ? g.time : old.arrivedAt,
    // Death restarts the first-arrival wait. Leaving an area with a hunter alive counts as the hunter leaving: the next one comes
    // after the re-arrival delay.
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
            ? (l.condition.xMin + l.condition.xMax) / 2 // tuning-ok: midpoint of the gate band
            : (l.condition.xMin ?? l.condition.xMax ?? SPAWN.gateDefaultCoordinate),
        y:
          l.condition.yMin !== undefined && l.condition.yMax !== undefined
            ? (l.condition.yMin + l.condition.yMax) / 2 // tuning-ok: midpoint of the gate band
            : (l.condition.yMin ?? l.condition.yMax ?? SPAWN.gateDefaultCoordinate),
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
      !geometry.clear(p, SPAWN.bodyRadius) ||
      safehouseTouches(g, p, SPAWN.safehouseRadius) ||
      w.travelAt?.(p) ||
      gates.some((q) => gap(p, q) < SPAWN.gateGap) ||
      g.enemies.some((e) => e.hp > 0 && gap(p, e.pos) < (e.radius ?? SPAWN.bodyRadius) + SPAWN.enemyGap)
    )
      continue;
    const probe = { pos: p, home: p, radius: SPAWN.bodyRadius },
      target = navigation.steer({ world: w, actor: probe, goal: g.player.pos, time: g.time, leash: Infinity });
    if (!bodyLineClear(geometry, p, target, SPAWN.bodyRadius) || safehouseBlocksSegment(g, p, target)) continue;
    candidates.push(p);
  }
  return candidates.sort((a, b) => gap(b, g.player.pos) - gap(a, g.player.pos))[0] ?? null;
}
// One finite tier, one simulation clock and existing actor/nav/movement owners.
export function stepMarkedHunters(g, spawn) {
  const c = g.world.markedData;
  if (!c) return;
  stepChainBreak(g, spawn); // the chained Pitborn is a marked hunter on a trigger of its own (chain-break.js)
  if (c.hunters === false) {
    if (g.enemies.some((e) => e.markedHunter && !e.relicHunter)) clearMarkedHunters(g, { keepRelic: true });
    return;
  }
  if (g.player.hp <= 0) {
    clearMarkedHunters(g, { death: true });
    return;
  }
  if (!g.markedHunt || g.markedHunt.areaId !== g.world.areaId) clearMarkedHunters(g);
  const s = g.markedHunt;
  // A hunter that has died is gone: the next one comes after the re-arrival delay.
  const present = g.enemies.some((e) => e.markedHunter && !e.relicHunter && e.hp > 0);
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
  // The residents of an area never block a hunter: only another living hunter does (maxHunters).
  const hunters = g.enemies.filter((e) => e.hp > 0 && e.hostile !== false && e.markedHunter && !e.relicHunter);
  if (hunters.length >= c.maxHunters) {
    s.warning = null;
    return;
  }
  if (g.time < s.arrivedAt + c.arrivalDelay || g.time < s.nextSpawnAt || g.time < s.nextAttemptAt) return;
  if (!s.warning) {
    const p = markedEntry(g);
    s.nextAttemptAt = g.time + 1;
    if (!p) return;
    s.warning = { position: p, startedAt: g.time, arrivesAt: g.time + c.warningSeconds };
    g.message = GAME_DATA.combatText.markedHunter.warning;
    g.messageUntil = s.warning.arrivesAt;
    g.events.push({ type: "marked-hunter-warning", position: { ...p }, seconds: c.warningSeconds });
    return;
  }
  if (g.time + 1e-8 < s.warning.arrivesAt) return;
  const p = s.warning.position;
  s.warning = null;
  s.nextAttemptAt = g.time + 1;
  if (!markedEntry(g, { position: p })) return;
  g.corpses = (g.corpses ?? []).filter((e) => !e.markedHunter || e.relicHunter);
  const actor = spawn(p, c);
  g.enemies.push(actor);
  s.nextSpawnAt = g.time + c.spawnCooldown;
  g.events.push({ type: "marked-hunter-arrived", actor, position: { ...p } });
  g.message = GAME_DATA.combatText.markedHunter.arrived;
  g.messageUntil = g.time + SPAWN.messageSeconds;
}
