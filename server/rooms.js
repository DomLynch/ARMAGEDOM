// Rooms of four per area shard. Pure: no sockets and no clock of its own (the caller passes `now`), so the rules are
// testable and a headless run can drive them. Area ids, links and spawns come from `areas` (see areas.js).
import { encodeDown } from "./wire.js";

const STRIKE_FORGET_MS = 5000;

export function createShards({ areas, rules, emit = () => {} }) {
  const { registry, spawns } = areas;
  // areaId -> shardId -> room. Shard ids count up per area and are never reused while the server runs.
  const shards = new Map();
  const nextShard = new Map();
  const bySession = new Map();
  const counts = { joined: 0, left: 0, travelled: 0, snapped: 0, dropped: 0, refused: {} };
  const refuse = (code) => {
    counts.refused[code] = (counts.refused[code] ?? 0) + 1;
    return { ok: false, code };
  };

  const cleanName = (name) =>
    typeof name === "string"
      ? name.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, rules.maxNameLength) || "Survivor"
      : "Survivor";
  const publicView = (p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, heading: p.heading, anim: p.anim, flags: p.flags });

  // Fill first: the lowest-numbered shard of the area with a free seat, else a new shard.
  function pickRoom(areaId) {
    const byId = shards.get(areaId) ?? new Map();
    shards.set(areaId, byId);
    for (const room of [...byId.values()].sort((a, b) => a.shardId - b.shardId))
      if (room.players.size < rules.roomSize) return room;
    if (byId.size >= rules.maxShardsPerArea) return null;
    const shardId = (nextShard.get(areaId) ?? 0) + 1;
    nextShard.set(areaId, shardId);
    const room = { areaId, shardId, players: new Map() };
    byId.set(shardId, room);
    return room;
  }
  const freeId = (room) => {
    for (let id = 1; id <= rules.roomSize; id++) if (!room.players.has(id)) return id;
    return null;
  };

  function seat(player, areaId, nowMs) {
    const room = pickRoom(areaId);
    if (!room) return false;
    const id = freeId(room);
    if (id === null) return false;
    const spawn = spawns.get(areaId);
    Object.assign(player, { id, areaId, room, x: spawn.x, z: spawn.z, heading: 0, anim: 0, flags: 0, lastMoveMs: nowMs });
    room.players.set(id, player);
    for (const other of room.players.values()) if (other !== player) emit(other, { t: "enter", ...publicView(player) });
    return true;
  }
  function unseat(player, why) {
    const room = player.room;
    room.players.delete(player.id);
    for (const other of room.players.values()) emit(other, { t: "leave", id: player.id, why });
    if (!room.players.size) shards.get(room.areaId).delete(room.shardId);
    player.room = null;
  }
  const view = (player) => ({
    id: player.id,
    area: player.areaId,
    shard: player.room.shardId,
    x: player.x,
    z: player.z,
    players: [...player.room.players.values()].filter((p) => p !== player).map(publicView),
  });

  return {
    /** Seat a session in a shard of `areaId`. Returns {ok, player, view} or {ok:false, code}. */
    join({ sessionId, areaId, name }, nowMs) {
      if (!registry.ids.includes(areaId)) return refuse("unknown-area");
      if (bySession.has(sessionId)) return refuse("already-joined");
      const player = { sessionId, name: cleanName(name), seq: 0, strikes: 0, strikeAt: 0 };
      if (!seat(player, areaId, nowMs)) return refuse("full");
      bySession.set(sessionId, player);
      counts.joined++;
      return { ok: true, player, view: view(player) };
    },
    leave(player, why = "left") {
      if (!player.room) return;
      unseat(player, why);
      bySession.delete(player.sessionId);
      counts.left++;
    },
    /** Move to a linked area: the registry's own links decide what is legal. */
    travel(player, areaId, nowMs) {
      if (!registry.ids.includes(areaId)) return refuse("unknown-area");
      if (!registry.links(player.areaId).some((link) => link.to === areaId)) return refuse("no-link");
      const from = player.areaId;
      unseat(player, "travel");
      if (!seat(player, areaId, nowMs)) {
        // Put the traveller back where they were rather than dropping them.
        seat(player, from, nowMs);
        return refuse("full");
      }
      counts.travelled++;
      return { ok: true, player, view: view(player) };
    },
    /** Take a pose from a client. 'ok', 'snapped' (too fast: the server's position stands) or 'drop' (unusable). */
    pose(player, pose, nowMs) {
      const limit = rules.worldLimit;
      if (!player.room || Math.abs(pose.x) > limit || Math.abs(pose.z) > limit) {
        counts.dropped++;
        return "drop";
      }
      player.seq = pose.seq;
      const dt = Math.min(Math.max((nowMs - player.lastMoveMs) / 1000, 0.001), rules.maxDtSeconds),
        allowed = rules.maxSpeed * dt * rules.speedSlack + rules.snapDistance;
      player.lastMoveMs = nowMs;
      if (Math.hypot(pose.x - player.x, pose.z - player.z) > allowed) {
        if (nowMs - player.strikeAt > STRIKE_FORGET_MS) player.strikes = 0;
        player.strikes++;
        player.strikeAt = nowMs;
        counts.snapped++;
        return "snapped";
      }
      Object.assign(player, { x: pose.x, z: pose.z, heading: pose.heading, anim: pose.anim, flags: pose.flags });
      return "ok";
    },
    /** One packet per player: everyone in its room (at most four, so no interest management is needed). */
    tick(tickNo) {
      const packets = new Map();
      for (const byId of shards.values())
        for (const room of byId.values()) {
          const entities = [...room.players.values()];
          for (const player of entities) packets.set(player, encodeDown(tickNo, player.seq, entities));
        }
      return packets;
    },
    snapshot() {
      const rows = [];
      for (const [areaId, byId] of shards)
        for (const room of byId.values()) rows.push({ areaId, shardId: room.shardId, players: [...room.players.keys()] });
      return rows.sort((a, b) => a.areaId.localeCompare(b.areaId) || a.shardId - b.shardId);
    },
    stats() {
      let players = 0,
        rooms = 0;
      for (const byId of shards.values())
        for (const room of byId.values()) {
          rooms++;
          players += room.players.size;
        }
      return { rooms, players, ...counts };
    },
  };
}
