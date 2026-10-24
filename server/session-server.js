// The session server (multiplayer proof P1): WebSocket, one room of up to four per area shard, join and leave,
// presence and movement broadcast at tickHz. It binds loopback by default and holds no state beyond memory.
// Control messages are JSON text; poses are the binary frames in wire.js. Tokens, saves and server-held runs are P3.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { CLOSE, connection, handshake } from "./ws.js";
import { createShards } from "./rooms.js";
import { decodeUp } from "./wire.js";

export function createSessionServer({ areas, rules, host = "127.0.0.1", port = 0, now = Date.now, log = () => {} }) {
  const sockets = new Map(); // session id -> { conn, player, lastSeen, windowStart, windowCount }
  const perIp = new Map();
  const counts = { packets: 0, bytes: 0, up: 0, ticks: 0, maxTickMs: 0, refused: {} };
  const refused = (why) => (counts.refused[why] = (counts.refused[why] ?? 0) + 1);
  const tickMs = 1000 / rules.tickHz;

  const shards = createShards({
    areas,
    rules,
    emit: (player, message) => sockets.get(player.sessionId)?.conn.send(JSON.stringify(message)),
  });

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats()));
      return;
    }
    res.writeHead(404).end();
  });

  server.on("upgrade", (req, socket) => {
    const ip = req.socket.remoteAddress ?? "?",
      open = (perIp.get(ip) ?? 0) + 1;
    if (open > rules.ipSockets) {
      refused("ip-sockets");
      socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    if (!handshake(req, socket, { protocol: rules.protocol })) return refused("handshake");
    perIp.set(ip, open);
    const sessionId = randomUUID(),
      session = { conn: null, player: null, lastSeen: now(), windowStart: now(), windowCount: 0 };
    sockets.set(sessionId, session);
    session.conn = connection(socket, {
      maxMessage: rules.maxMessageBytes,
      graceMs: rules.closeGraceMs,
      onMessage: (data, binary) => onMessage(sessionId, session, data, binary),
      onClose() {
        if (session.player) shards.leave(session.player, "disconnected");
        sockets.delete(sessionId);
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left <= 0) perIp.delete(ip);
        else perIp.set(ip, left);
      },
    });
  });

  function reply(session, message) {
    session.conn.send(JSON.stringify(message));
  }
  function seated(sessionId, session, result, t) {
    if (!result.ok) return reply(session, { t: "error", code: result.code });
    session.player = result.player;
    reply(session, {
      t,
      session: sessionId,
      tickHz: rules.tickHz,
      roomSize: rules.roomSize,
      ...result.view,
    });
  }

  function onMessage(sessionId, session, data, binary) {
    const t = now();
    session.lastSeen = t;
    if (t - session.windowStart >= 1000) {
      session.windowStart = t;
      session.windowCount = 0;
    }
    if (++session.windowCount > rules.messagesPerSecond) {
      refused("message-rate");
      return session.conn.close(CLOSE.RATE);
    }
    if (binary) {
      const pose = decodeUp(data);
      if (!pose || !session.player) return refused("bad-pose");
      counts.up++;
      const result = shards.pose(session.player, pose, t);
      if (result === "snapped" && session.player.strikes >= rules.strikesBeforeClose) {
        refused("speed");
        session.conn.close(CLOSE.SPEED);
      }
      return;
    }
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return refused("bad-json");
    }
    switch (message?.t) {
      case "join":
        if (session.player) return reply(session, { t: "error", code: "already-joined" });
        return seated(sessionId, session, shards.join({ sessionId, areaId: message.area, name: message.name }, t), "hello");
      case "travel":
        if (!session.player) return reply(session, { t: "error", code: "not-joined" });
        return seated(sessionId, session, shards.travel(session.player, message.area, t), "travelled");
      case "leave":
        if (session.player) shards.leave(session.player, "left");
        session.player = null;
        return reply(session, { t: "left" });
      case "ping":
        return reply(session, { t: "pong", c: message.c });
      default:
        return refused("unknown-message");
    }
  }

  // The tick is aimed at the wall clock, not setInterval's drift, so one slow tick does not stretch every later one.
  let tickNo = 0,
    nextTick = now() + tickMs;
  const ticker = setInterval(() => {
    if (now() < nextTick) return;
    nextTick += tickMs;
    const started = performance.now();
    tickNo = (tickNo + 1) & 0xffff;
    for (const [player, packet] of shards.tick(tickNo)) {
      const session = sockets.get(player.sessionId);
      if (!session?.conn.open) continue;
      session.conn.sendBinary(packet);
      counts.packets++;
      counts.bytes += packet.length;
    }
    counts.ticks++;
    counts.maxTickMs = Math.max(counts.maxTickMs, performance.now() - started);
  }, Math.max(1, Math.floor(tickMs / 4)));
  // Heartbeat and idle sweep.
  const beat = setInterval(() => {
    const t = now();
    for (const session of sockets.values()) {
      if (t - session.lastSeen > rules.idleMs) {
        refused("idle");
        session.conn.close(CLOSE.IDLE);
      } else session.conn.send('{"t":"beat"}');
    }
  }, rules.beatMs);
  ticker.unref();
  beat.unref();

  const stats = () => ({ ...shards.stats(), sockets: sockets.size, ...counts, refusedTotal: counts.refused });

  return {
    server,
    shards,
    stats,
    listen: () =>
      new Promise((resolve) =>
        server.listen(port, host, () => {
          log(`session server listening on ${host}:${server.address().port}`);
          resolve(server.address().port);
        }),
      ),
    close: () =>
      new Promise((resolve) => {
        clearInterval(ticker);
        clearInterval(beat);
        for (const session of sockets.values()) session.conn.close(CLOSE.NORMAL);
        // Wait for clients to finish their close handshake; after the grace period drop whoever is left.
        const force = setTimeout(() => server.closeAllConnections?.(), rules.closeGraceMs + 100);
        server.close(() => {
          clearTimeout(force);
          resolve();
        });
      }),
  };
}
