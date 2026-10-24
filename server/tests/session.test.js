// End to end over real sockets on 127.0.0.1 with Node's built-in WebSocket client. Nothing here leaves the machine.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { loadAreas } from "../areas.js";
import { createSessionServer } from "../session-server.js";
import { decodeDown, encodeUp } from "../wire.js";

const rules = JSON.parse(fs.readFileSync(new URL("../rules.json", import.meta.url), "utf8"));
const areas = await loadAreas();

async function start(overrides = {}) {
  const app = createSessionServer({ areas, rules: { ...rules, ...overrides } });
  const port = await app.listen();
  return { app, port };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > end) throw new Error("timed out waiting for: " + check);
    await wait(5);
  }
}

async function connect(port, { protocol = rules.protocol } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`, protocol);
  ws.binaryType = "arraybuffer";
  const client = { ws, messages: [], packets: [], closed: null, seq: 0 };
  ws.onmessage = (event) => {
    if (typeof event.data === "string") client.messages.push(JSON.parse(event.data));
    else client.packets.push({ at: performance.now(), ...decodeDown(new Uint8Array(event.data)) });
  };
  ws.onclose = (event) => (client.closed = event.code);
  client.send = (message) => ws.send(JSON.stringify(message));
  client.pose = (x, z, extra = {}) => ws.send(encodeUp({ seq: ++client.seq, x, z, heading: 0, anim: 0, flags: 0, ...extra }));
  client.find = (t) => client.messages.find((m) => m.t === t);
  client.open = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("socket error"));
  });
  await client.open;
  return client;
}
async function join(port, area = "westminster", name = "P") {
  const client = await connect(port);
  client.send({ t: "join", area, name });
  client.hello = await until(() => client.find("hello"));
  return client;
}

test("four phones join one area: distinct seats, one shard, everyone sees everyone enter", async () => {
  const { app, port } = await start();
  try {
    const clients = [];
    for (let n = 1; n <= 4; n++) clients.push(await join(port, "westminster", "P" + n));
    assert.deepEqual(clients.map((c) => c.hello.id), [1, 2, 3, 4]);
    assert(clients.every((c) => c.hello.shard === 1 && c.hello.area === "westminster" && c.hello.roomSize === 4));
    assert.deepEqual(clients[3].hello.players.map((p) => p.name), ["P1", "P2", "P3"]);
    await until(() => clients[0].messages.filter((m) => m.t === "enter").length === 3);
    assert.deepEqual(clients[0].messages.filter((m) => m.t === "enter").map((m) => m.name), ["P2", "P3", "P4"]);
    const fifth = await join(port, "westminster", "P5");
    assert.equal(fifth.hello.shard, 2, "the fifth player opens a second shard");
    assert.equal(fifth.hello.players.length, 0);
    for (const c of [...clients, fifth]) c.ws.close();
  } finally {
    await app.close();
  }
});

test("movement reaches the others at the tick rate, and each client's pose is acknowledged", async () => {
  const { app, port } = await start();
  try {
    const a = await join(port),
      b = await join(port);
    const from = { x: a.hello.x, z: a.hello.z };
    for (let step = 1; step <= 10; step++) {
      a.pose(from.x + step * 0.1, from.z);
      await wait(1000 / rules.tickHz);
    }
    const seenByB = await until(() => b.packets.findLast((p) => p.entities.find((e) => e.id === a.hello.id)?.x > from.x + 0.9));
    assert(seenByB.entities.find((e) => e.id === a.hello.id).x > from.x + 0.9);
    assert.equal(seenByB.entities.length, 2);
    const acked = await until(() => a.packets.findLast((p) => p.ack === 10));
    assert.equal(acked.entities.find((e) => e.id === a.hello.id).x.toFixed(1), (from.x + 1).toFixed(1));
    const gaps = b.packets.slice(1).map((p, i) => p.at - b.packets[i].at);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    assert(mean > 1000 / rules.tickHz - 25 && mean < 1000 / rules.tickHz + 40, `tick spacing ${mean.toFixed(1)} ms`);
    a.ws.close();
    b.ws.close();
  } finally {
    await app.close();
  }
});

test("leaving and disconnecting tell the room, and the seat is reused", async () => {
  const { app, port } = await start();
  try {
    const a = await join(port),
      b = await join(port),
      c = await join(port);
    b.send({ t: "leave" });
    await until(() => a.messages.some((m) => m.t === "leave" && m.id === 2 && m.why === "left"));
    await until(() => b.find("left"));
    c.ws.close();
    await until(() => a.messages.some((m) => m.t === "leave" && m.id === 3 && m.why === "disconnected"));
    const d = await join(port);
    assert.equal(d.hello.id, 2, "the lowest free seat is reused");
    for (const x of [a, b, d]) x.ws.close();
    await until(() => app.stats().players === 0);
  } finally {
    await app.close();
  }
});

test("travel moves a player to a linked area's shard and back-fills the old room", async () => {
  const { app, port } = await start();
  try {
    const a = await join(port, "westminster"),
      b = await join(port, "westminster");
    const target = areas.registry.links("westminster")[0].to;
    a.send({ t: "travel", area: target });
    const arrived = await until(() => a.find("travelled"));
    assert.deepEqual([arrived.area, arrived.shard], [target, 1]);
    await until(() => b.messages.some((m) => m.t === "leave" && m.why === "travel"));
    const unlinked = areas.registry.ids.find((id) => id !== target && !areas.registry.links(target).some((l) => l.to === id));
    a.send({ t: "travel", area: unlinked });
    await until(() => a.messages.some((m) => m.t === "error" && m.code === "no-link"));
    a.ws.close();
    b.ws.close();
  } finally {
    await app.close();
  }
});

test("bad input is refused without taking the server down", async () => {
  const { app, port } = await start();
  try {
    const c = await connect(port);
    c.ws.send(new Uint8Array([2, 1, 2])); // a pose before joining
    c.ws.send("{not json");
    c.send({ t: "nonsense" });
    c.send({ t: "join", area: "atlantis" });
    await until(() => c.messages.some((m) => m.t === "error" && m.code === "unknown-area"));
    c.send({ t: "join", area: "westminster" });
    await until(() => c.find("hello"));
    c.send({ t: "join", area: "westminster" });
    await until(() => c.messages.some((m) => m.code === "already-joined"));
    const refused = app.stats().refused;
    assert(refused["bad-pose"] >= 1 && refused["bad-json"] >= 1 && refused["unknown-message"] >= 1);
    c.ws.close();
    // A plain HTTP request and a wrong subprotocol are turned away.
    assert.equal((await fetch(`http://127.0.0.1:${port}/nothing`)).status, 404);
    await assert.rejects(connect(port, { protocol: "someone.else" }));
    assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).sockets >= 0, true);
  } finally {
    await app.close();
  }
});

test("teleporting is snapped back, then the socket is closed after repeated strikes", async () => {
  const { app, port } = await start({ strikesBeforeClose: 3 });
  try {
    const c = await join(port),
      watcher = await join(port);
    for (let i = 0; i < 3; i++) {
      c.pose(c.hello.x + 500, c.hello.z);
      await wait(20);
    }
    await until(() => c.closed === 4009);
    const seen = watcher.packets.findLast((p) => p.entities.length);
    assert(Math.abs(seen.entities.find((e) => e.id === c.hello.id)?.x - c.hello.x) < 1, "the others never saw the jump");
    watcher.ws.close();
  } finally {
    await app.close();
  }
});

test("a flood of messages is closed with the rate code", async () => {
  const { app, port } = await start({ messagesPerSecond: 20 });
  try {
    const c = await join(port);
    for (let i = 0; i < 60; i++) c.pose(c.hello.x, c.hello.z);
    await until(() => c.closed === 4008);
  } finally {
    await app.close();
  }
});

test("a silent socket is closed as idle, and the per-address limit refuses extra sockets", async () => {
  const { app, port } = await start({ idleMs: 150, beatMs: 50, ipSockets: 2 });
  try {
    const a = await connect(port),
      b = await connect(port);
    await assert.rejects(connect(port));
    await until(() => a.closed === 4000 && b.closed === 4000);
    assert((await connect(port)).ws.readyState === 1, "the address is free again once the sockets are gone");
  } finally {
    await app.close();
  }
});

test("an oversized or unmasked frame is refused", async () => {
  const { app, port } = await start();
  try {
    const c = await join(port);
    c.ws.send("x".repeat(rules.maxMessageBytes + 10));
    await until(() => c.closed === 1009);
    // A raw socket sending an unmasked frame after a valid handshake is closed with a protocol error.
    const raw = net.connect(port, "127.0.0.1");
    const key = Buffer.from("0123456789abcdef").toString("base64");
    raw.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: ${rules.protocol}\r\n\r\n`);
    const chunks = [];
    raw.on("data", (d) => chunks.push(d));
    await until(() => Buffer.concat(chunks).toString("latin1").includes("101 Switching"));
    raw.write(Buffer.from([0x81, 0x02, 0x68, 0x69])); // FIN text frame, no mask
    await until(() => Buffer.concat(chunks).includes(Buffer.from([0x88, 0x02, 0x03, 0xea])), 2000); // close 1002
    raw.destroy();
  } finally {
    await app.close();
  }
});

test("sixteen players in four areas: four full rooms, and the per-tick work stays small", async () => {
  const { app, port } = await start({ ipSockets: 32 }); // every test client shares one loopback address
  try {
    const clients = [];
    for (const area of ["westminster", "east", "south", "central-hub"]) for (let n = 0; n < 4; n++) clients.push(await join(port, area));
    await wait(600);
    const stats = app.stats();
    assert.equal(stats.rooms, 4);
    assert.equal(stats.players, 16);
    assert(stats.maxTickMs < 25, `longest tick ${stats.maxTickMs.toFixed(2)} ms`);
    for (const c of clients) c.ws.close();
  } finally {
    await app.close();
  }
});
