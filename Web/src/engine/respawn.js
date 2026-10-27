import { rigText } from "../rig-capabilities.js";
// Hostile respawn. A killed ordinary hostile stays down for population.respawn.seconds of play and comes back only
// while the player is elsewhere (on entering its area), at its registered placement.
//
// The permanent ledgers are never touched: progression awards, supplies.issued and droneDeaths still say "dead", so a
// respawned hostile pays no second score, cash or loot and can never be a second loot instance. The kill times below are
// a separate advisory record; losing or ignoring it just leaves a kill permanent (the safe direction).
export const RESPAWN_SAVE_KEY = "armagedom:respawn:v1";
const RECORD_VERSION = "v1";
const recordFields = ["version", "clock", "kills"];
const keyPattern = /^[a-z0-9._:-]{1,96}$/;

export const respawnPolicy = (g) => g.world?.populationData?.respawn ?? null;
// Play seconds across sessions: `base` carries the time played before this session was loaded.
export const respawnClock = (g) => (g.respawn?.base ?? 0) + g.time;

function permanentKeys(g) {
  const keys = new Set((g.world?.bossData?.placements ?? []).map((row) => row.key));
  if (g.world?.uniqueRewardData?.placementKey) keys.add(g.world.uniqueRewardData.placementKey);
  return keys;
}
// Bosses (and the gates, rewards and equipment that hang off their death), the unique-reward holder, marked hunters
// and drones are permanent; so is everything in an excluded area (the Westminster tutorial).
export function respawnable(g, e) {
  const policy = respawnPolicy(g);
  return (
    !!policy &&
    !!g.areaResidents &&
    typeof e.placementKey === "string" &&
    !policy.excludedAreas.includes(g.world.areaId) &&
    !e.markedHunter &&
    !e.bossProfile &&
    rigText(e.rig, "brain") !== "drone" &&
    !permanentKeys(g).has(e.placementKey)
  );
}
export function recordResidentKill(g, e) {
  if (!respawnable(g, e)) return;
  g.respawn ??= { base: 0, kills: {}, dirty: false };
  g.respawn.kills[e.placementKey] = respawnClock(g);
  g.respawn.dirty = true;
}
// A placement may only spawn off-screen and away from the player: never within minPlayerDistance, and closer than
// offscreenDistance only when a wall blocks the line of sight. Otherwise the hostile waits for the player to move.
export function spawnAllowed(g, pos) {
  const policy = respawnPolicy(g),
    distance = Math.hypot(pos.x - g.player.pos.x, pos.z - g.player.pos.z);
  return (
    distance >= policy.minPlayerDistance &&
    (distance >= policy.offscreenDistance || !g.world.lineClear(g.player.pos, pos))
  );
}
// Placement keys of `areaKeys` whose recorded kill is old enough.
export function expiredKeys(g, area, areaKeys) {
  const policy = respawnPolicy(g),
    out = new Set();
  if (!policy || policy.excludedAreas.includes(area) || !g.respawn) return out;
  const now = respawnClock(g);
  for (const key of areaKeys) {
    const killedAt = g.respawn.kills[key];
    if (killedAt !== undefined && now - killedAt >= policy.seconds) out.add(key);
  }
  return out;
}
// Every hostile whose respawn time has passed is alive again at its placement (old corpse removed), whether or not the player
// is in the area, but only while the placement is off-screen and far enough from the player; otherwise it waits. Nothing is
// added to the permanent ledgers, so no second reward, score or loot instance exists. `build(g, area, keys, true)` makes the actors.
export function reviveDue(g, build, defaultRows) {
  if (!g.areaResidents || !g.areaInitialized || g.finished || g.player.hp <= 0) return 0;
  const area = g.world.areaId ?? "westminster",
    rows = g.residentPlacements?.[area] ?? defaultRows[area] ?? [],
    alive = new Set(g.enemies.map((e) => e.placementKey)),
    due = [
      ...expiredKeys(
        g,
        area,
        rows.map((row) => row.key),
      ),
    ].filter((key) => !alive.has(key) && spawnAllowed(g, rows.find((row) => row.key === key).pos));
  if (!due.length) return 0;
  const residents = build(g, area, new Set(due), true);
  const back = new Set(residents.map((e) => e.placementKey));
  if (g.corpses) g.corpses = g.corpses.filter((c) => !back.has(c.placementKey));
  g.enemies.push(...residents);
  if (residents.length) {
    g.encounterActive = true;
    g.encounterCleared = false;
  }
  return residents.length;
}

function validateRespawnRecord(record) {
  return (
    !!record &&
    typeof record === "object" &&
    !Array.isArray(record) &&
    Object.keys(record).length === recordFields.length &&
    recordFields.every((field) => Object.hasOwn(record, field)) &&
    record.version === RECORD_VERSION &&
    Number.isFinite(record.clock) &&
    record.clock >= 0 &&
    !!record.kills &&
    typeof record.kills === "object" &&
    !Array.isArray(record.kills) &&
    Object.entries(record.kills).every(
      ([key, at]) => keyPattern.test(key) && Number.isFinite(at) && at >= 0 && at <= record.clock,
    )
  );
}
export function encodeRespawn(g) {
  return JSON.stringify({ version: RECORD_VERSION, clock: respawnClock(g), kills: g.respawn?.kills ?? {} });
}
export const emptyRespawnRecord = () => JSON.stringify({ version: RECORD_VERSION, clock: 0, kills: {} });
// Adopt a stored record into a loaded run. Anything unreadable is ignored: kills then simply stay permanent.
export function applyRespawnRecord(g, raw) {
  let record;
  try {
    record = raw == null ? null : JSON.parse(raw);
  } catch {
    return false;
  }
  if (!validateRespawnRecord(record)) return false;
  g.respawn = { base: record.clock - g.time, kills: { ...record.kills }, dirty: false };
  return true;
}
