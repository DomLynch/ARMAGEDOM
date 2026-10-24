// The ARMAGEDOM presence service (W2): who is where, in one always-on world. One LAYER per area: a player only ever sees, and is only
// ever sent, the players of the area they stand in. Phones talk to it over a WebSocket; it never writes the database (hits and the
// writer batch are the next commits). Modelled on Frankendom's presence service and built on the same dependency-free ws.js.
//   connect   new WebSocket(url, ["arma.v1", "token.<Supabase access token>"])   the token rides in the subprotocol, never in the URL
//   client -> {t:"join", area, x?, z?}   first message: enter an area; (x, z) is the saved location, trusted only if walkable
//             {t:"loc", x, z}            where I am now (integer cm, the area's frame); checked by checkMove against SERVER time
//             {t:"travel", to}           leave through an exit zone I am standing in
//   server -> {t:"welcome", id, area, x, z, arrival, version}   (after join and after travel)   {t:"state", tick, players:[{id,x,z}]}   {t:"refuse", reason}
// The phone's own clock is never used: a report's time is when the server received it. Loopback only, OFF unless ARMA_PRESENCE=1 (main.js).
import http from "node:http";
import { CLOSE, connection, handshake } from "./ws.js";
import { checkMove, checkTravel, pickArrival, resumePosition } from "./area-rules.js";

export const PROTOCOL = "arma.v1";
export const CLOSE_REPLACED = 4010;
const TOKEN_PREFIX = "token.";

/**
 * rules: loadAreaRows(...) result; limits: presenceLimits(...) result; verify(token) -> account uuid | null (async);
 * now(): ms clock; maxMessage: bytes; maxPerSecond: messages a client may send per second before it is closed.
 */
export function createPresence({ rules, limits, verify, now = Date.now, maxMessage = 512, maxPerSecond = 40, log = () => {} }) {
  const layers = new Map(Object.keys(rules.areas).map((area) => [area, new Set()])); // area -> clients standing there
  const byAccount = new Map(); // account -> client (one live connection per account)
  const counters = new Map(Object.keys(rules.areas).map((area) => [area, { joins: 0, messages: 0, moves: 0, refused: {}, travels: 0 }]));
  let nextId = 1,
    tickNumber = 0;

  const refuse = (client, reason) => {
    const c = client.area ? counters.get(client.area) : null;
    if (c) c.refused[reason] = (c.refused[reason] ?? 0) + 1;
    client.conn.send(JSON.stringify({ t: "refuse", reason }));
  };
  const enter = (client, area, pos, arrival) => {
    layers.get(area).add(client);
    Object.assign(client, { area, x: pos.x, z: pos.z, atMs: now() });
    counters.get(area).joins++;
    client.conn.send(JSON.stringify({ t: "welcome", id: client.id, area, x: pos.x, z: pos.z, arrival, version: rules.version }));
  };
  const leave = (client) => {
    if (client.area) layers.get(client.area).delete(client);
    client.area = null;
  };

  function onMessage(client, text) {
    const at = now();
    if (at - client.windowStart >= 1000) Object.assign(client, { windowStart: at, windowCount: 0 });
    if (++client.windowCount > maxPerSecond) return client.conn.close(CLOSE.RATE);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return client.conn.close(CLOSE.PROTOCOL);
    }
    if (msg === null || typeof msg !== "object") return client.conn.close(CLOSE.PROTOCOL);
    if (client.area) counters.get(client.area).messages++;

    if (msg.t === "join") {
      if (client.area || typeof msg.area !== "string" || !layers.has(msg.area)) return refuse(client, "join");
      const resume = resumePosition(rules, msg.area, Number.isInteger(msg.x) && Number.isInteger(msg.z) ? { x: msg.x, z: msg.z } : null);
      // A newcomer who must land on an arrival is placed away from the players already there.
      const placed = resume.arrival ? pickArrival(rules, msg.area, null, [...layers.get(msg.area)]) : resume;
      return enter(client, msg.area, placed, resume.arrival ? placed.id : null);
    }
    if (!client.area) return refuse(client, "not-joined");
    if (msg.t === "loc") {
      const next = { x: msg.x, z: msg.z, atMs: at };
      const verdict = checkMove(rules.areas[client.area], { x: client.x, z: client.z, atMs: client.atMs }, next, limits);
      if (!verdict.ok) return refuse(client, verdict.reason);
      Object.assign(client, { x: msg.x, z: msg.z, atMs: at });
      counters.get(client.area).moves++;
      return;
    }
    if (msg.t === "travel") {
      if (typeof msg.to !== "string" || !checkTravel(rules, client.area, msg.to, client)) return refuse(client, "travel");
      const from = client.area;
      counters.get(from).travels++;
      leave(client);
      const arrival = pickArrival(rules, msg.to, from, [...layers.get(msg.to)]);
      return enter(client, msg.to, arrival, arrival.id);
    }
    refuse(client, "unknown");
  }

  const server = http.createServer((req, res) => res.writeHead(426, { "Content-Length": 0 }).end());
  server.on("upgrade", (req, socket) => {
    socket.on("error", () => socket.destroy());
    const offered = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim());
    const token = offered.find((p) => p.startsWith(TOKEN_PREFIX))?.slice(TOKEN_PREFIX.length);
    const deny = () => socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    if (!token) return deny();
    Promise.resolve(verify(token)).then(
      (account) => {
        if (!account) return deny();
        if (socket.destroyed) return;
        if (!handshake(req, socket, { protocol: PROTOCOL })) return;
        const client = { id: nextId++, account, area: null, x: 0, z: 0, atMs: 0, windowStart: now(), windowCount: 0 };
        client.conn = connection(socket, {
          maxMessage,
          onMessage: (data, isBinary) => (isBinary ? client.conn.close(CLOSE.UNSUPPORTED) : onMessage(client, data)),
          onClose: () => {
            leave(client);
            if (byAccount.get(account) === client) byAccount.delete(account);
          },
        });
        const stale = byAccount.get(account); // a reconnecting phone replaces its stale socket, which leaves the layer at once
        if (stale) {
          leave(stale);
          stale.conn.close(CLOSE_REPLACED);
        }
        byAccount.set(account, client);
      },
      () => deny(),
    );
  });

  return {
    server,
    /** One broadcast: each area's layer gets the players of that area only. Called by the interval in main.js; tests call it directly. */
    tick() {
      tickNumber++;
      for (const [area, clients] of layers) {
        if (clients.size === 0) continue;
        const players = [...clients].map((c) => ({ id: c.id, x: c.x, z: c.z }));
        const payload = JSON.stringify({ t: "state", tick: tickNumber, players });
        for (const c of clients) c.conn.send(payload);
        counters.get(area).lastPlayers = players.length;
      }
    },
    /** Per-area counters for the operator; no account ids. */
    stats: () => Object.fromEntries([...counters].map(([area, c]) => [area, { ...c, present: layers.get(area).size }])),
    close: () =>
      new Promise((resolve) => {
        for (const client of byAccount.values()) client.conn.close();
        server.close(resolve);
        server.closeAllConnections?.();
      }),
  };
}
