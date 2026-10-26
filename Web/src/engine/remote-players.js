// Other players in my area (W2): the presence server sends {tick, players:[{id,x,z}]} (integer cm) about ten times a second. Drawing
// them straight from those snapshots would step; instead each player is shown INTERP_DELAY_MS in the past, interpolated between the two
// snapshots around that time. Pure data: no THREE, no DOM, no clock of its own (the caller passes the time).
import { GAME_DATA } from "./game-data.js";
import { fromCm } from "./presence-client.js";

// data/presenceClient.json: interpDelayMs is a little over one 100 ms server tick, so there is almost always a newer snapshot to blend
// to; facingMinMetres is how far a player must move to change facing; movingMetresPerSecond is the speed above which a player counts as moving.
export const INTERP_DELAY_MS = GAME_DATA.presenceClient.interpDelayMs;
export const KEEP_MS = 1000; // snapshots older than this are dropped
const FACING_MIN = GAME_DATA.presenceClient.facingMinMetres;
const MAX_NAME = GAME_DATA.presenceClient.maxNameLength;
const MOVING_SPEED = GAME_DATA.presenceClient.movingMetresPerSecond;

export function createRemotePlayers({ selfId = () => null } = {}) {
  const tracks = new Map(); // id -> [{ at, x, z }] oldest first, metres
  const facing = new Map(),
    names = new Map(); // id -> display name, when the server sends one
  let latestAt = -Infinity;

  return {
    // A "state" message received at `at` (ms). The player's own id is never drawn (the phone shows its own player).
    apply(message, at) {
      latestAt = at;
      const present = new Set();
      for (const row of message.players ?? []) {
        if (!Number.isInteger(row.id) || row.id === selfId() || !Number.isFinite(row.x) || !Number.isFinite(row.z))
          continue;
        present.add(row.id);
        // The display name the server sends with a player ('Survivor-1234' for guests, the Google first name otherwise).
        if (typeof row.name === "string" && row.name.trim()) names.set(row.id, row.name.trim().slice(0, MAX_NAME));
        else names.delete(row.id);
        const track = tracks.get(row.id) ?? [];
        track.push({ at, x: fromCm(row.x), z: fromCm(row.z) });
        while (track.length > 2 && at - track[0].at > KEEP_MS) track.shift();
        tracks.set(row.id, track);
      }
      for (const id of [...tracks.keys()])
        if (!present.has(id)) {
          tracks.delete(id);
          facing.delete(id);
          names.delete(id);
        }
    },
    // Everyone who has left the layer, or a new area: forget them at once.
    clear() {
      tracks.clear();
      facing.clear();
      names.clear();
    },
    // Positions to draw at time `now` (ms): [{ id, x, z, facing, moving }] with x, z in metres.
    sample(now) {
      const at = now - INTERP_DELAY_MS,
        out = [];
      for (const [id, track] of tracks) {
        let a = track[0],
          b = track[0];
        for (const point of track) {
          if (point.at <= at) a = b = point;
          else {
            b = point;
            break;
          }
        }
        const span = b.at - a.at,
          t = span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 0,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t,
          dx = b.x - a.x,
          dz = b.z - a.z,
          moved = Math.hypot(dx, dz);
        if (moved > FACING_MIN) facing.set(id, Math.atan2(dx, -dz)); // render yaw: toRender flips z, as the local player's atan2(facing.x, -facing.z)
        out.push({
          id,
          x,
          z,
          facing: facing.get(id) ?? 0,
          name: names.get(id) ?? null,
          moving: span > 0 && moved / (span / 1000) > MOVING_SPEED,
        });
      }
      return out;
    },
    get size() {
      return tracks.size;
    },
    get latestAt() {
      return latestAt;
    },
  };
}
