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
  enemies: [],
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
    assert.deepEqual(Object.fromEntries(Object.entries(t.presence.stats()).map(([k, v]) => [k, v.present])), { south: 2, east: 1 });
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
    const south = t.presence.stats().south;
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
    assert.equal(t.presence.stats().south.present, 0);
    assert.equal(t.presence.stats().south.travels, 1);
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
    assert.equal(t.presence.stats().south.present, 1);
    a.socket.end();
    await a.closed;
    await settle();
    assert.equal(t.presence.stats().south.present, 0);
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
    assert.equal(t.presence.stats().south.present, 1, "the stale player left the layer");
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
