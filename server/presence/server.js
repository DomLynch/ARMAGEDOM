// The ARMAGEDOM presence service (W2): who is where, in one always-on world. One LAYER per area: a player only ever sees, and is only
// ever sent, the players of the area they stand in. Phones talk to it over a WebSocket; it never touches the database itself: hits go to
// the writer as ONE batch per tick, and locations as a throttled report, over the writer's internal routes (sendHits / sendLocation).
// Modelled on Frankendom's presence service and built on the same dependency-free ws.js.
//   connect   new WebSocket(url, ["arma.v1", "token.<Supabase access token>"])   the token rides in the subprotocol, never in the URL
//   client -> {t:"join", area, x?, z?}   first message: enter an area; (x, z) is the saved location, trusted only if walkable
//             {t:"loc", x, z}            where I am now (integer cm, the area's frame); checked by checkMove against SERVER time
//             {t:"travel", to}           leave through an exit zone I am standing in
//             {t:"hit", instance, token, weapon, damage, hits?}   damage I dealt to a creature of my area; token is the writer's engage token
//   server -> {t:"welcome", id, area, x, z, arrival, version}   (after join and after travel)   {t:"state", tick, players:[{id,x,z}]}   {t:"refuse", reason}
//             {t:"spawn", instance, hp, maxHp, killed}   the shared bar after a tick's hits (whole layer)   {t:"hit-result", instance, applied, killed, paid?}   (hitter)
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
 * weaponCaps: { [weapon]: { maxDamage, maxHitsPerS } } (maxDamage already includes the progression ceiling, see caps.js);
 * sendHits(rows) -> the writer's per-row results, in order (rows: { account, token, weapon, applied, hits });
 * sendLocation({ account, area, x, z, atMs }) -> void. Without sendHits / sendLocation those features answer "off" / do nothing.
 */
export function createPresence({
  rules,
  limits,
  verify,
  now = Date.now,
  maxMessage = 512,
  maxPerSecond = 40,
  weaponCaps = {},
  sendHits = null,
  sendLocation = null,
  locationEveryMs = 5000,
  hitSlack = 1.25,
  log = () => {},
}) {
  const layers = new Map(Object.keys(rules.areas).map((area) => [area, new Set()])); // area -> clients standing there
  const byAccount = new Map(); // account -> client (one live connection per account)
  const counters = new Map(Object.keys(rules.areas).map((area) => [area, { joins: 0, messages: 0, moves: 0, refused: {}, travels: 0, hits: 0, hitsApplied: 0 }]));
  const enemies = new Map(Object.entries(rules.areas).map(([area, row]) => [area, new Set(row.enemies.map((e) => e.instance))]));
  const pending = new Map(); // `${client.id}|${token}|${weapon}` -> one row of this tick's hit batch
  const service = { hitBatches: 0, hitRows: 0, hitFailures: 0, locationReports: 0, locationFailures: 0 };
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
    if (msg.t === "hit") return onHit(client, msg, at);
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

  // A hit is clamped here (the phone is not trusted) and queued for the tick's batch; the database clamps again. The creature must be
  // one placed in the player's own area. Reach is not checked: presence does not know where a roaming creature is.
  function onHit(client, msg, at) {
    if (!sendHits) return refuse(client, "hits-off");
    const cap = Object.hasOwn(weaponCaps, msg.weapon) ? weaponCaps[msg.weapon] : null;
    const hits = msg.hits === undefined ? 1 : msg.hits;
    if (!cap) return refuse(client, "hit-weapon");
    if (typeof msg.instance !== "string" || !enemies.get(client.area).has(msg.instance)) return refuse(client, "hit-instance");
    if (typeof msg.token !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(msg.token)) return refuse(client, "hit-token");
    if (!Number.isInteger(hits) || hits < 1 || hits > 50 || !Number.isFinite(msg.damage) || msg.damage <= 0) return refuse(client, "hit-damage");
    // Rate: at most maxHitsPerS * slack hits per second since this player's last hit with this weapon (one second's worth for the first).
    const last = client.lastHit.get(msg.weapon);
    const elapsedS = last === undefined ? 1 : Math.min((at - last) / 1000, 5);
    const allowed = Math.floor(cap.maxHitsPerS * hitSlack * elapsedS + 1e-9);
    if (allowed < 1) return refuse(client, "hit-rate");
    const counted = Math.min(hits, allowed);
    client.lastHit.set(msg.weapon, at);
    const key = `${client.id}|${msg.token}|${msg.weapon}`;
    const row = pending.get(key) ?? { client, area: client.area, instance: msg.instance, account: client.account, token: msg.token, weapon: msg.weapon, applied: 0, hits: 0 };
    row.hits += counted;
    row.applied += Math.min(msg.damage, counted * cap.maxDamage);
    pending.set(key, row);
    counters.get(client.area).hits++;
  }

  // One transaction per tick: every queued hit goes to the writer in one batch (200 rows at most per call). A writer that is down
  // loses that tick's hits (they are never retried: a retry could apply damage twice) and each hitter is told.
  async function flushHits() {
    const rows = [...pending.values()];
    pending.clear();
    for (let at = 0; at < rows.length; at += 200) {
      const chunk = rows.slice(at, at + 200);
      service.hitBatches++;
      service.hitRows += chunk.length;
      let results;
      try {
        results = await sendHits(chunk.map(({ account, token, weapon, applied, hits }) => ({ account, token, weapon, applied, hits })));
        if (!Array.isArray(results) || results.length !== chunk.length) throw new Error("writer answered a different number of rows");
      } catch (error) {
        service.hitFailures++;
        log(`presence: hit batch failed: ${error?.message}`);
        for (const row of chunk) row.client.conn.send(JSON.stringify({ t: "refuse", reason: "writer" }));
        continue;
      }
      chunk.forEach((row, i) => {
        const res = results[i] ?? {};
        if (res.error || res.refused) {
          const c = counters.get(row.area);
          const reason = `hit-${res.error ?? res.refused}`;
          c.refused[reason] = (c.refused[reason] ?? 0) + 1;
          return row.client.conn.send(JSON.stringify({ t: "refuse", reason }));
        }
        counters.get(row.area).hitsApplied++;
        const shared = JSON.stringify({ t: "spawn", instance: row.instance, hp: res.hp, maxHp: res.maxHp, killed: !!res.killed });
        for (const c of layers.get(row.area)) c.conn.send(shared);
        row.client.conn.send(JSON.stringify({ t: "hit-result", instance: row.instance, applied: res.applied, killed: !!res.killed, ...(res.killed ? { paid: res.paid } : {}) }));
      });
    }
  }

  // Where each player stands is reported to the writer now and then (never by the phone): at most every locationEveryMs, and only if they moved.
  function reportLocations(at) {
    if (!sendLocation) return;
    for (const clients of layers.values())
      for (const c of clients) {
        if (at - c.reportedAt < locationEveryMs || (c.reported && c.reported.area === c.area && c.reported.x === c.x && c.reported.z === c.z)) continue;
        Object.assign(c, { reportedAt: at, reported: { area: c.area, x: c.x, z: c.z } });
        service.locationReports++;
        Promise.resolve(sendLocation({ account: c.account, area: c.area, x: c.x, z: c.z, atMs: at })).catch((error) => {
          service.locationFailures++;
          log(`presence: location report failed: ${error?.message}`);
        });
      }
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
        const client = { id: nextId++, account, area: null, x: 0, z: 0, atMs: 0, windowStart: now(), windowCount: 0, lastHit: new Map(), reportedAt: -Infinity, reported: null };
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
    /**
     * One tick: each area's layer gets the players of that area only, then the tick's hits go to the writer as one batch and the
     * shared bars come back to the layer. Called by the interval in main.js (which waits for the previous tick); tests await it.
     */
    async tick() {
      tickNumber++;
      for (const [area, clients] of layers) {
        if (clients.size === 0) continue;
        const players = [...clients].map((c) => ({ id: c.id, x: c.x, z: c.z }));
        const payload = JSON.stringify({ t: "state", tick: tickNumber, players });
        for (const c of clients) c.conn.send(payload);
        counters.get(area).lastPlayers = players.length;
      }
      reportLocations(now());
      if (pending.size > 0) await flushHits();
    },
    /** Counters for the operator, per area and for the service as a whole; no account ids. */
    stats: () => ({
      areas: Object.fromEntries([...counters].map(([area, c]) => [area, { ...c, present: layers.get(area).size }])),
      service: { ...service },
    }),
    close: () =>
      new Promise((resolve) => {
        for (const client of byAccount.values()) client.conn.close();
        server.close(resolve);
        server.closeAllConnections?.();
      }),
  };
}
