// The presence service over real sockets on 127.0.0.1 with a fake clock and fake tokens ("user:<id>"); nothing leaves the machine.
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { loadAreaRows } from "./area-rules.js";
import { createPresence, CLOSE_REPLACED } from "./server.js";

const square = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const area = (id, other) => ({
  area: id,
  bounds: { minX: 0, maxX: 4000, minZ: 0, maxZ: 3000 },
  originCm: { x: 0, z: 0 },
  road: square(0, 0, 4000, 3000),
  blockers: [square(1000, 1000, 1500, 1500)],
  playerRadiusCm: 40,
  exits: [{ to: other, zone: square(3800, 1000, 4000, 2000) }],
  arrivals: [
    { id: `${id}:a1`, x: 200, z: 200, from: null },
    { id: `${id}:a2`, x: 3500, z: 1500, from: other },
    { id: `${id}:a3`, x: 200, z: 2800, from: null },
  ],
  enemies: [{ instance: `${id}:rat-1`, home: { x: 2000, z: 2000 } }],
});
const areas = [area("south", "east"), area("east", "south")];
const rules = loadAreaRows({ version: createHash("sha256").update(JSON.stringify(areas)).digest("hex").slice(0, 16), maxSpeedCmPerS: 520, areas });
const limits = { maxSpeedCmPerS: 520, impulseCm: 15 };

async function start(over = {}) {
  const clock = { ms: 1_000_000 };
  const presence = createPresence({ rules, limits, verify: async (t) => (t.startsWith("user:") ? t.slice(5) : null), now: () => clock.ms, ...over });
  await new Promise((resolve) => presence.server.listen(0, "127.0.0.1", resolve));
  const port = presence.server.address().port;
  const clients = [];
  /** Open a WebSocket by hand. Resolves to a client, or { status } when the handshake is refused. */
  const open = (protocols) =>
    new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1");
      const key = randomBytes(16).toString("base64");
      let buffer = Buffer.alloc(0),
        upgraded = false,
        closeCode = null;
      const messages = [],
        waiting = [];
      const client = {
        socket,
        messages,
        closed: new Promise((done) => socket.on("close", () => done(closeCode))),
        send(obj, raw) {
          const payload = Buffer.from(raw ?? JSON.stringify(obj)),
            mask = randomBytes(4),
            masked = Buffer.from(payload.map((b, i) => b ^ mask[i & 3]));
          const head = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 255]);
          socket.write(Buffer.concat([head, mask, masked]));
        },
        sendBinary() {
          socket.write(Buffer.concat([Buffer.from([0x82, 0x81]), Buffer.alloc(4), Buffer.from([1])]));
        },
        next: (ms = 1000) =>
          messages.length
            ? Promise.resolve(messages.shift())
            : new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("no message")), ms);
                waiting.push((m) => (clearTimeout(timer), resolve(m)));
              }),
        get closeCode() {
          return closeCode;
        },
      };
      clients.push(client);
      const deliver = (m) => (waiting.length ? waiting.shift()(m) : messages.push(m));
      socket.on("error", () => {});
      socket.on("connect", () =>
        socket.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: ${protocols.join(", ")}\r\n\r\n`),
      );
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!upgraded) {
          const end = buffer.indexOf("\r\n\r\n");
          if (end < 0) return;
          const head = buffer.subarray(0, end).toString();
          buffer = buffer.subarray(end + 4);
          const status = Number(head.split(" ")[1]);
          if (status !== 101) return resolve({ status, head });
          upgraded = true;
          resolve(client);
        }
        for (;;) {
          if (buffer.length < 2) return;
          let length = buffer[1] & 0x7f,
            offset = 2;
          if (length === 126) {
            if (buffer.length < 4) return;
            length = buffer.readUInt16BE(2);
            offset = 4;
          }
          if (buffer.length < offset + length) return;
          const payload = buffer.subarray(offset, offset + length),
            opcode = buffer[0] & 15;
          buffer = buffer.subarray(offset + length);
          if (opcode === 1) deliver(JSON.parse(payload.toString()));
          else if (opcode === 8) closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        }
      });
    });
  const connect = (account) => open(["arma.v1", `token.user:${account}`]);
  return { presence, clock, open, connect, stop: async () => { clients.forEach((c) => c.socket.destroy()); await presence.close(); } };
}

// Messages are handled when the server reads them, and it reads the fake clock then: let each one land before the clock moves.
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
const take = async (client, n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await client.next());
  return out;
};
const ALICE = "00000000-0000-4000-8000-00000000000a",
  BOB = "00000000-0000-4000-8000-00000000000b";

test("auth: the token rides in the subprotocol; none, a bad one or no protocol is refused before the upgrade", async () => {
  const t = await start();
  try {
    assert.equal((await t.open(["arma.v1"])).status, 401, "no token");
    assert.equal((await t.open(["arma.v1", "token.forged"])).status, 401, "verify said no");
    assert.equal((await t.open([`token.user:${ALICE}`])).status, 400, "valid token but no arma.v1 protocol");
    const ok = await t.connect(ALICE);
    assert.ok(ok.send, "a verified account gets the upgrade");
  } finally {
    await t.stop();
  }
});

test("join: a walkable saved spot is kept, an unwalkable one lands on an arrival, one join per connection", async () => {
  const t = await start();
  try {
    const a = await t.connect(ALICE);
    a.send({ t: "loc", x: 1, z: 1 });
    assert.deepEqual(await a.next(), { t: "refuse", reason: "not-joined" });
    a.send({ t: "join", area: "moon" });
    assert.deepEqual(await a.next(), { t: "refuse", reason: "join" });
    a.send({ t: "join", area: "south", x: 2500, z: 500 });
    const welcome = await a.next();
    assert.deepEqual([welcome.t, welcome.area, welcome.x, welcome.z, welcome.arrival, welcome.version], ["welcome", "south", 2500, 500, null, rules.version]);
    a.send({ t: "join", area: "east" });
    assert.deepEqual(await a.next(), { t: "refuse", reason: "join" }, "already in an area");
    const b = await t.connect(BOB);
    b.send({ t: "join", area: "south", x: 1200, z: 1200 });
    const placed = await b.next();
    assert.equal(placed.arrival?.startsWith("south:"), true, "a spot inside a blocker is replaced by an arrival");
  } finally {
    await t.stop();
  }
});

test("layers: a player is sent only the players of their own area", async () => {
  const t = await start();
  try {
    const [a, b, c] = [await t.connect(ALICE), await t.connect(BOB), await t.connect("00000000-0000-4000-8000-00000000000c")];
    a.send({ t: "join", area: "south", x: 2000, z: 500 });
    b.send({ t: "join", area: "south", x: 2200, z: 500 });
    c.send({ t: "join", area: "east", x: 2000, z: 500 });
    const ids = [(await a.next()).id, (await b.next()).id, (await c.next()).id];
    t.presence.tick();
    const south = await a.next(),
      east = await c.next();
    assert.deepEqual(south.players.map((p) => p.id).sort(), [ids[0], ids[1]].sort());
    assert.deepEqual(east.players, [{ id: ids[2], x: 2000, z: 500 }], "east sees only east");
    assert.equal(JSON.stringify(south).includes(ALICE), false, "no account ids on the wire");
    assert.deepEqual(Object.fromEntries(Object.entries(t.presence.stats().areas).map(([k, v]) => [k, v.present])), { south: 2, east: 1 });
  } finally {
    await t.stop();
  }
});

test("moves: checked against SERVER time and the area; the phone's own clock is ignored; refusals are counted", async () => {
  const t = await start();
  try {
    const a = await t.connect(ALICE);
    a.send({ t: "join", area: "south", x: 2000, z: 500 });
    await a.next();
    t.clock.ms += 1000;
    a.send({ t: "loc", x: 2400, z: 500, atMs: 1 }); // 4 m in 1 s: fine
    await settle();
    t.clock.ms += 1000;
    a.send({ t: "loc", x: 2400, z: 500 }); // standing still: fine
    await settle();
    a.send({ t: "loc", x: 3400, z: 500, atMs: 999999999 }); // 10 m with no time passing: a teleport, whatever the phone says
    assert.deepEqual(await a.next(), { t: "refuse", reason: "speed" });
    t.clock.ms += 1000;
    a.send({ t: "loc", x: 1200, z: 1200 }); // inside the blocker
    assert.deepEqual(await a.next(), { t: "refuse", reason: "blocked" });
    a.send({ t: "loc", x: 2400.5, z: 500 });
    assert.deepEqual(await a.next(), { t: "refuse", reason: "position" });
    const south = t.presence.stats().areas.south;
    assert.equal(south.moves, 2);
    assert.deepEqual(south.refused, { speed: 1, blocked: 1, position: 1 });
    t.presence.tick();
    assert.deepEqual((await a.next()).players[0], { id: 1, x: 2400, z: 500 }, "a refused move does not move the player");
  } finally {
    await t.stop();
  }
});

test("travel: only from inside an exit zone; the newcomer is placed at the arrival for that direction, in the new layer", async () => {
  const t = await start();
  try {
    const a = await t.connect(ALICE),
      b = await t.connect(BOB);
    a.send({ t: "join", area: "south", x: 2000, z: 500 });
    b.send({ t: "join", area: "east", x: 2000, z: 2500 });
    await a.next();
    await b.next();
    a.send({ t: "travel", to: "east" });
    assert.deepEqual(await a.next(), { t: "refuse", reason: "travel" }, "not in the exit zone");
    t.clock.ms += 10_000;
    a.send({ t: "loc", x: 3900, z: 1500 });
    await settle();
    a.send({ t: "travel", to: "east" });
    const arrived = await a.next();
    assert.deepEqual([arrived.t, arrived.area, arrived.arrival, arrived.x, arrived.z], ["welcome", "east", "east:a2", 3500, 1500]);
    t.presence.tick();
    assert.equal((await a.next()).players.length, 2, "now in east with bob");
    assert.equal((await b.next()).players.length, 2);
    assert.equal(t.presence.stats().areas.south.present, 0);
    assert.equal(t.presence.stats().areas.south.travels, 1);
  } finally {
    await t.stop();
  }
});

test("disconnect: a phone that just drops (FIN, no close frame) leaves its layer", async () => {
  const t = await start();
  try {
    const a = await t.connect(ALICE);
    a.send({ t: "join", area: "south", x: 2000, z: 500 });
    await a.next();
    assert.equal(t.presence.stats().areas.south.present, 1);
    a.socket.end();
    await a.closed;
    await settle();
    assert.equal(t.presence.stats().areas.south.present, 0);
  } finally {
    await t.stop();
  }
});

test("one connection per account: a reconnect replaces the stale socket", async () => {
  const t = await start();
  try {
    const first = await t.connect(ALICE);
    first.send({ t: "join", area: "south", x: 2000, z: 500 });
    await first.next();
    const second = await t.connect(ALICE);
    assert.equal(await first.closed, CLOSE_REPLACED);
    second.send({ t: "join", area: "south", x: 2000, z: 500 });
    await second.next();
    assert.equal(t.presence.stats().areas.south.present, 1, "the stale player left the layer");
  } finally {
    await t.stop();
  }
});

test("abuse: too many messages, binary frames and malformed JSON close the connection", async () => {
  const t = await start({ maxPerSecond: 5 });
  try {
    const flood = await t.connect(ALICE);
    for (let i = 0; i < 8; i++) flood.send({ t: "loc", x: 1, z: 1 });
    assert.equal(await flood.closed, 4008);
    const bin = await t.connect(BOB);
    bin.sendBinary();
    assert.equal(await bin.closed, 1003);
    const junk = await t.connect("00000000-0000-4000-8000-00000000000c");
    junk.send(null, "{not json");
    assert.equal(await junk.closed, 1002);
  } finally {
    await t.stop();
  }
});

// ---- hits and the writer batch ------------------------------------------------------------------------------------------------------
const CAPS = { knife: { maxDamage: 20, maxHitsPerS: 2 } };
const TOKEN_A = "token-alice-0000000000",
  TOKEN_B = "token-bob-000000000000";
const CAROL = "00000000-0000-4000-8000-00000000000c";
/** A fake writer: records every batch and answers from `reply(row, index)`. */
const fakeWriter = (reply = (row) => ({ token: row.token, applied: row.applied, hp: 100 - row.applied, maxHp: 100, killed: false })) => {
  const calls = [];
  return { calls, sendHits: async (rows) => (calls.push(rows), rows.map(reply)) };
};
async function joined(t, account, area = "south", x = 2000, z = 500) {
  const c = await t.connect(account);
  c.send({ t: "join", area, x, z });
  await c.next();
  return c;
}

test("hits: one tick is one batch to the writer; the shared bar goes to the whole layer and only that layer", async () => {
  const writer = fakeWriter((row, i) => ({ token: row.token, applied: row.applied, hp: 100 - (i + 1) * 20, maxHp: 100, killed: i === 1, ...(i === 1 ? { paid: 2 } : {}) }));
  const t = await start({ weaponCaps: CAPS, sendHits: writer.sendHits });
  try {
    const [a, b, c] = [await joined(t, ALICE), await joined(t, BOB), await joined(t, CAROL, "east")];
    a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 15 });
    b.send({ t: "hit", instance: "south:rat-1", token: TOKEN_B, weapon: "knife", damage: 20 });
    await settle();
    await t.presence.tick();
    assert.equal(writer.calls.length, 1, "both hits in one batch");
    assert.deepEqual(
      writer.calls[0].map(({ account, token, weapon, applied, hits }) => [account, token, weapon, applied, hits]),
      [[ALICE, TOKEN_A, "knife", 15, 1], [BOB, TOKEN_B, "knife", 20, 1]],
    );
    const bar = (hp, killed) => ({ t: "spawn", instance: "south:rat-1", hp, maxHp: 100, killed });
    // The bar goes to everyone in the layer, in batch order; each hitter also gets their own result.
    assert.deepEqual((await take(a, 4)).slice(1), [bar(80, false), { t: "hit-result", instance: "south:rat-1", applied: 15, killed: false }, bar(60, true)]);
    assert.deepEqual((await take(b, 4)).slice(1), [bar(80, false), bar(60, true), { t: "hit-result", instance: "south:rat-1", applied: 20, killed: true, paid: 2 }]);
    assert.equal((await c.next()).t, "state", "the east layer is sent the state only");
    await settle();
    assert.equal(c.messages.length, 0, "and no south spawn");
    assert.equal(t.presence.stats().areas.south.hitsApplied, 2);
  } finally {
    await t.stop();
  }
});

test("hits: clamped before the writer (damage by weapon cap, hit count by rate); the same token and weapon merge in a tick", async () => {
  const writer = fakeWriter();
  const t = await start({ weaponCaps: CAPS, sendHits: writer.sendHits });
  try {
    const a = await joined(t, ALICE);
    // The first hit may claim a second's worth: 2 hits/s * 1.25 slack = 2 hits (not the 10 claimed), each at most 20 (not 500).
    a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 500, hits: 10 });
    await settle();
    // Half a second later one more hit is allowed (1 allowed), and a second one right behind it is not.
    t.clock.ms += 500;
    a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 5 });
    await settle();
    a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 6 });
    assert.deepEqual(await a.next(), { t: "refuse", reason: "hit-rate" });
    await t.presence.tick();
    assert.equal(writer.calls.length, 1);
    assert.equal(writer.calls[0].length, 1, "the same token and weapon are one row in the tick");
    const [{ applied, hits }] = writer.calls[0];
    assert.deepEqual([applied, hits], [45, 3], "40 (2 clamped hits) + 5, hits 2 + 1");
    assert.deepEqual(t.presence.stats().areas.south.refused, { "hit-rate": 1 });
  } finally {
    await t.stop();
  }
});

test("hits: refused before the writer when the weapon, creature, token or damage is wrong, or hits are not wired", async () => {
  const writer = fakeWriter();
  const t = await start({ weaponCaps: CAPS, sendHits: writer.sendHits });
  const off = await start({ weaponCaps: CAPS });
  try {
    const a = await joined(t, ALICE);
    const bad = {
      "hit-weapon": { weapon: "railgun" },
      "hit-weapon ": { weapon: "constructor" },
      "hit-instance": { instance: "east:rat-1" },
      "hit-instance ": { instance: "south:ghost" },
      "hit-token": { token: "short" },
      "hit-damage": { damage: -5 },
      "hit-damage ": { damage: "20" },
      "hit-damage  ": { hits: 0 },
      "hit-damage   ": { hits: 1.5 },
    };
    for (const [reason, over] of Object.entries(bad)) {
      t.clock.ms += 1000;
      a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 10, ...over });
      assert.deepEqual(await a.next(), { t: "refuse", reason: reason.trim() }, JSON.stringify(over));
      await settle();
    }
    await t.presence.tick();
    assert.equal(writer.calls.length, 0, "nothing reached the writer");
    const b = await joined(off, BOB);
    b.send({ t: "hit", instance: "south:rat-1", token: TOKEN_B, weapon: "knife", damage: 10 });
    assert.deepEqual(await b.next(), { t: "refuse", reason: "hits-off" });
  } finally {
    await t.stop();
    await off.stop();
  }
});

test("hits: a writer that is down loses the tick's hits, tells the hitters, and is not retried; a database refusal reaches only its hitter", async () => {
  let calls = 0;
  const t = await start({
    weaponCaps: CAPS,
    sendHits: async (rows) => {
      calls++;
      if (calls === 1) throw new Error("connect ECONNREFUSED");
      return rows.map((row) => (row.token === TOKEN_A ? { token: row.token, error: "O0009", message: "engage token unknown, used or expired" } : { token: row.token, applied: row.applied, hp: 80, maxHp: 100, killed: false }));
    },
  });
  try {
    const [a, b] = [await joined(t, ALICE), await joined(t, BOB)];
    a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 10 });
    await settle();
    await t.presence.tick();
    assert.deepEqual((await take(a, 2)).slice(1), [{ t: "refuse", reason: "writer" }]);
    await t.presence.tick();
    assert.equal(calls, 1, "the lost hits are not sent again");
    assert.equal(t.presence.stats().service.hitFailures, 1);
    await take(b, 2);
    t.clock.ms += 1000;
    a.send({ t: "hit", instance: "south:rat-1", token: TOKEN_A, weapon: "knife", damage: 10 });
    b.send({ t: "hit", instance: "south:rat-1", token: TOKEN_B, weapon: "knife", damage: 10 });
    await settle();
    await t.presence.tick();
    // alice: the leftover state of the second tick, this tick's state, her refusal, the shared bar bob's hit produced.
    const [aGot, bGot] = [await take(a, 4), await take(b, 3)];
    assert.deepEqual(aGot.find((m) => m.t === "refuse"), { t: "refuse", reason: "hit-O0009" }, "the refused hitter is told why");
    assert.equal(aGot.some((m) => m.t === "hit-result"), false);
    assert.equal(aGot.filter((m) => m.t === "spawn").length, 1, "the other hit still moved the shared bar");
    assert.equal(bGot.some((m) => m.t === "hit-result"), true);
    assert.equal(bGot.some((m) => m.t === "refuse"), false, "bob was not refused");
    assert.deepEqual(t.presence.stats().areas.south.refused, { "hit-O0009": 1 });
  } finally {
    await t.stop();
  }
});

test("locations: reported to the writer now and then, only when the player moved, never by the phone", async () => {
  const reports = [];
  const t = await start({ sendLocation: async (r) => void reports.push(r), locationEveryMs: 5000 });
  try {
    const a = await joined(t, ALICE, "south", 2000, 500);
    await t.presence.tick();
    assert.deepEqual(reports, [{ account: ALICE, area: "south", x: 2000, z: 500, atMs: t.clock.ms }]);
    t.clock.ms += 1000;
    a.send({ t: "loc", x: 2300, z: 500 });
    await settle();
    await t.presence.tick();
    assert.equal(reports.length, 1, "moved, but reported less than 5 s ago");
    t.clock.ms += 5000;
    await t.presence.tick();
    assert.deepEqual(reports.at(-1), { account: ALICE, area: "south", x: 2300, z: 500, atMs: t.clock.ms });
    assert.equal(reports.length, 2);
    t.clock.ms += 6000;
    await t.presence.tick();
    assert.equal(reports.length, 2, "unchanged: not reported again");
  } finally {
    await t.stop();
  }
});

test("locations: a failing writer is counted and does not stop the tick", async () => {
  const t = await start({ sendLocation: async () => Promise.reject(new Error("down")) });
  try {
    const a = await joined(t, ALICE);
    await t.presence.tick();
    await settle();
    assert.equal(t.presence.stats().service.locationFailures, 1);
    assert.equal((await a.next()).t, "state", "the layer still got its state");
  } finally {
    await t.stop();
  }
});
