// Glue between the browser session and the presence client (W2). Created only when presenceConfig() says the flag is on; with it off
// nothing in this file runs, so the game is exactly the single-player game. The phone still moves itself: this only REPORTS where the
// player is and DRAWS the other players of the same area.
import { createPresenceClient, presenceConfig } from "./presence-client.js";
import { createRemotePlayers } from "./remote-players.js";
import { createRemotePlayersView } from "./remote-players-view.js";
import { createSurvivorKit } from "./remote-survivors.js";

export const FULL_LOOK_MAX = 4; // players who get the full survivor model
const FULL_LOOK_KEEP_RANK = 6; // a player already in the full look keeps it until they fall beyond this rank (no flicker)
export function chooseFullLook(samples, position, current = new Set()) {
  const ranked = samples
      .map((p) => ({ id: p.id, d: Math.hypot(p.x - position.x, p.z - position.z) }))
      .sort((a, b) => a.d - b.d || a.id - b.id),
    rank = new Map(ranked.map((p, i) => [p.id, i])),
    next = [...current]
      .filter((id) => rank.get(id) < FULL_LOOK_KEEP_RANK)
      .sort((a, b) => rank.get(a) - rank.get(b))
      .slice(0, FULL_LOOK_MAX);
  for (const { id } of ranked) {
    if (next.length >= FULL_LOOK_MAX) break;
    if (!next.includes(id)) next.push(id);
  }
  return new Set(next);
}
const STATS_EVERY = 100; // state messages (about 10 s)
export const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0);
};

export function createPresenceSession(
  s,
  { config, getToken = async () => null, WebSocketImpl, now, log = (line) => console.info(line) } = {},
) {
  if (!config) return null;
  const client = createPresenceClient({ url: config.url, getToken, WebSocketImpl, now }),
    remote = createRemotePlayers({ selfId: () => client.id });
  let view = null, // built on the first frame: the scene does not exist yet when the session is created
    area = null,
    lastPosition = null, // the previous frame's position: the last one known to be in the area I am leaving
    clock = now ?? (() => globalThis.performance?.now?.() ?? Date.now());

  // The full survivor look (a skinned model, about 61k triangles each) is only for the nearest few players; everyone else keeps the
  // cheap capsule. The kit is built once the player's own model has loaded, and rebuilt if that model is replaced (a restart).
  let kit = null,
    kitSource = null,
    full = new Set();
  function survivorKit() {
    const source = s.survivorSource ?? null;
    if (source !== kitSource) {
      kit?.dispose?.();
      kit = null;
      kitSource = source;
      if (source) {
        try {
          kit = createSurvivorKit({ source, characterScale: s.world?.layout?.characterScale ?? 1.265 });
        } catch {
          kit = null; // not ready: the capsule stays
        }
      }
    }
    return kit;
  }

  // Phase C wants p95 < 150 ms for other players' movement. The protocol carries no server timestamp yet, so what can be measured
  // here is the gap between state messages (the server ticks every 100 ms): its p95 is logged to the console, only when the world
  // flag is on. A real one-way latency needs a server time in `state`.
  const intervals = [];
  let lastStateAt = null;
  client.on("state", (message) => {
    const at = clock();
    remote.apply(message, at);
    if (lastStateAt !== null) intervals.push(at - lastStateAt);
    lastStateAt = at;
    if (intervals.length >= STATS_EVERY) {
      log(
        `[arma-world] state interval ms p50=${percentile(intervals, 0.5)} p95=${percentile(intervals, 0.95)} n=${intervals.length}`,
      );
      intervals.length = 0;
    }
  });
  // A welcome starts a fresh layer: nobody from the area I left is shown any more.
  client.on("welcome", (message) => {
    remote.clear();
    // The server is the authority on arrivals (it spreads newcomers out so they do not stack): when it placed me on an arrival
    // point, stand there. A resumed position (arrival null) is the phone's own and is never overridden.
    const g = s.game;
    if (message.arrival && g && s.world?.areaId === message.area && !s.traveling) {
      g.player.pos.x = message.x / 100;
      g.player.pos.z = message.z / 100;
    }
  });
  // The server only lets me travel from inside an exit zone it knows about; if it said no, start again in the area I am really in.
  client.on("refuse", (message) => {
    if (message.reason === "travel" && area && s.game) client.reconnect(area, s.game.player.pos);
  });

  return {
    client,
    remote,
    get view() {
      return view;
    },
    // Every frame, after the game has moved: join or change layers when the area changed, report my position, draw the others.
    update() {
      const g = s.game;
      if (!g || !s.world || s.traveling) return;
      const position = g.player.pos;
      if (s.world.areaId !== area) {
        const previous = area;
        area = s.world.areaId;
        remote.clear();
        // First area: join. A later area: the server only moves me through an exit zone, so ask to travel.
        if (previous === null || !client.joined) client.join(area, position);
        else {
          // The server checks the exit zone against my last accepted loc: send the last frame's position (still in the old
          // area, inside the exit) at once instead of waiting out the report throttle.
          if (lastPosition) client.flush(lastPosition, clock());
          client.travel(area);
        }
      }
      client.report(position, clock());
      lastPosition = { x: position.x, z: position.z };
      view ??= createRemotePlayersView({
        scene: s.scene,
        toRender: (p, y) => s.world.toRender(p, y),
        survivors: survivorKit,
      });
      const samples = client.joined ? remote.sample(clock()) : [];
      full = chooseFullLook(samples, position, full);
      view.update(samples, full);
    },
    dispose() {
      client.close();
      view?.dispose();
      view = null;
      kit?.dispose?.();
      kit = null;
    },
  };
}

export { presenceConfig };
