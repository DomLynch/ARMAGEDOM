import test from "node:test";
import assert from "node:assert/strict";
import {
  createPresenceClient,
  presenceConfig,
  localDevUrl,
  PRESENCE_PROTOCOL,
  LOC_INTERVAL_MS,
  CLOSE_REPLACED,
  toCm,
} from "../src/engine/presence-client.js";

class FakeSocket {
  static all = [];
  constructor(url, protocols) {
    Object.assign(this, { url, protocols, readyState: 0, sent: [] });
    FakeSocket.all.push(this);
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen();
  }
  receive(message) {
    this.onmessage({ data: JSON.stringify(message) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose({ code });
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(overrides = {}) {
  FakeSocket.all = [];
  const clock = { ms: 1000 },
    timers = [];
  const client = createPresenceClient({
    url: "wss://example.test/presence",
    getToken: async () => "tok-123",
    WebSocketImpl: FakeSocket,
    now: () => clock.ms,
    setTimer: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    clearTimer: () => {},
    ...overrides,
  });
  return { client, clock, timers, socket: () => FakeSocket.all.at(-1) };
}
async function joined(s, area = "westminster") {
  s.client.join(area, { x: 1.234, z: -5.678 });
  await flush();
  s.socket().open();
  s.socket().receive({ t: "welcome", id: 7, area, x: 123, z: -568, arrival: null, version: "v" });
}

test("the token rides in the subprotocol, never in the URL, and the first message is the join in centimetres", async () => {
  const s = setup();
  s.client.join("westminster", { x: 1.234, z: -5.678 });
  await flush();
  assert.deepEqual(s.socket().protocols, [PRESENCE_PROTOCOL, "token.tok-123"]);
  assert.doesNotMatch(s.socket().url, /tok-123/);
  s.socket().open();
  assert.deepEqual(s.socket().sent, [{ t: "join", area: "westminster", x: 123, z: -568 }]);
});

test("a join without a saved position sends no coordinates", async () => {
  const s = setup();
  s.client.join("central-hub");
  await flush();
  s.socket().open();
  assert.deepEqual(s.socket().sent, [{ t: "join", area: "central-hub" }]);
});

test("no loc is sent before the welcome, and none when the position has not changed", async () => {
  const s = setup();
  s.client.join("westminster", { x: 0, z: 0 });
  await flush();
  s.socket().open();
  assert.equal(s.client.report({ x: 5, z: 5 }), false, "not joined yet");
  s.socket().receive({ t: "welcome", id: 7, area: "westminster", x: 0, z: 0, arrival: null });
  assert.equal(s.client.joined, true);
  assert.equal(s.client.id, 7);
  assert.equal(s.client.report({ x: 0, z: 0 }), false, "still at the welcome position");
});

test("loc is rate-limited while moving, and the resting position goes out within one interval of stopping", async () => {
  const s = setup();
  await joined(s);
  const sentLocs = () => s.socket().sent.filter((m) => m.t === "loc");
  s.clock.ms += LOC_INTERVAL_MS;
  assert.equal(s.client.report({ x: 2, z: -5.678 }, s.clock.ms), true);
  s.clock.ms += 20;
  assert.equal(s.client.report({ x: 2.1, z: -5.678 }, s.clock.ms), false, "inside the interval");
  s.clock.ms += 20;
  assert.equal(s.client.report({ x: 2.2, z: -5.678 }, s.clock.ms), false);
  // The player stops at x = 2.3: the next frame past the interval sends exactly that.
  s.clock.ms += LOC_INTERVAL_MS;
  assert.equal(s.client.report({ x: 2.3, z: -5.678 }, s.clock.ms), true);
  assert.equal(s.client.report({ x: 2.3, z: -5.678 }, s.clock.ms + 500), false, "nothing more once at rest");
  assert.deepEqual(sentLocs(), [
    { t: "loc", x: 200, z: -568 },
    { t: "loc", x: 230, z: -568 },
  ]);
  // Over one second of 60 fps movement stays far below the server's 40 messages a second.
  let sent = 0;
  for (let i = 0; i < 60; i++) {
    s.clock.ms += 1000 / 60;
    sent += s.client.report({ x: 3 + i * 0.05, z: -5.678 }, s.clock.ms) ? 1 : 0;
  }
  assert.ok(sent <= 13, `${sent} loc messages in one second`);
});

test("travel sends the exit and the welcome for the new area re-bases the client", async () => {
  const s = setup();
  await joined(s);
  s.client.travel("south");
  assert.equal(s.client.joined, false, "no loc while travelling");
  assert.equal(s.client.report({ x: 50, z: 50 }, s.clock.ms + 1000), false);
  assert.deepEqual(s.socket().sent.at(-1), { t: "travel", to: "south" });
  const welcomes = [];
  s.client.on("welcome", (m) => welcomes.push(m));
  s.socket().receive({ t: "welcome", id: 7, area: "south", x: 4000, z: 100, arrival: "south:from-westminster" });
  assert.equal(s.client.area, "south");
  assert.equal(s.client.joined, true);
  assert.equal(welcomes[0].arrival, "south:from-westminster");
  assert.equal(s.client.report({ x: 40, z: 1 }, s.clock.ms + 1000), false, "the arrival is already where the server has me");
});

test("state, refuse and the shared-bar messages are passed on to listeners; junk is ignored", async () => {
  const s = setup();
  await joined(s);
  const seen = [];
  for (const type of ["state", "refuse", "spawn", "hit-result"]) s.client.on(type, (m) => seen.push(m.t));
  s.socket().receive({ t: "state", tick: 1, players: [{ id: 9, x: 1, z: 2 }] });
  s.socket().receive({ t: "refuse", reason: "speed" });
  s.socket().receive({ t: "spawn", instance: "a", hp: 3, maxHp: 10, killed: false });
  s.socket().receive({ t: "hit-result", instance: "a", applied: 2, killed: false });
  s.socket().onmessage({ data: "not json" });
  s.socket().onmessage({ data: "[]" });
  s.socket().receive({ nope: 1 });
  assert.deepEqual(seen, ["state", "refuse", "spawn", "hit-result"]);
});

test("a dropped socket retries with growing delays and rejoins at the last known position", async () => {
  const s = setup();
  await joined(s);
  s.clock.ms += LOC_INTERVAL_MS;
  s.client.report({ x: 2, z: -5.678 }, s.clock.ms);
  s.socket().drop();
  assert.equal(s.client.connected, false);
  assert.deepEqual(s.timers.map((t) => t.ms), [1000]);
  s.timers[0].fn();
  await flush();
  assert.equal(FakeSocket.all.length, 2);
  s.socket().drop();
  assert.deepEqual(s.timers.map((t) => t.ms), [1000, 2000]);
  s.timers[1].fn();
  await flush();
  s.socket().open();
  assert.deepEqual(s.socket().sent, [{ t: "join", area: "westminster", x: 123, z: -568 }]);
});

test("a replaced session does not reconnect; close() stops everything", async () => {
  const s = setup();
  await joined(s);
  s.socket().drop(CLOSE_REPLACED);
  assert.equal(s.timers.length, 0);
  const t = setup();
  await joined(t);
  t.client.close();
  t.socket().drop();
  assert.equal(t.timers.length, 0);
});

test("no token means no connection yet: the client stays offline and retries", async () => {
  const s = setup({ getToken: async () => null });
  s.client.join("westminster");
  await flush();
  assert.equal(FakeSocket.all.length, 0);
  assert.equal(s.timers.length, 1);
});

test("the world client is on by default (the server's status read decides whether it starts); ?world=0 is a diagnostic off for that page load only", () => {
  const data = new Map(),
    storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
    location = { protocol: "https:", host: "playarmagedom.com" },
    own = { url: "wss://playarmagedom.com/arma/ws" };
  assert.deepEqual(presenceConfig({ search: "", storage, location }), own);
  assert.equal(presenceConfig({ search: "?world=0", storage, location }), null);
  assert.deepEqual(presenceConfig({ search: "", storage, location }), own, "?world=0 is not remembered");
  assert.equal(data.size, 0, "nothing is written to storage any more");
  assert.deepEqual(presenceConfig({ search: "?world=1", storage, location }), own, "the old ?world=1 changes nothing");
  assert.deepEqual(presenceConfig({ search: "?world=maybe", storage, location }), own, "only 0 turns it off");
  assert.deepEqual(presenceConfig({ search: "?presence=0", storage, location }), own, "the ?presence= alias is gone");
  assert.equal(presenceConfig({ search: "", storage, location: null }), null, "no page origin, no endpoint");
});

test("a closed close-code or a closed/auth refusal stops reconnecting; reopen() tries again from the start", async () => {
  for (const stop of [
    (s) => s.socket().onclose({ code: 4003 }),
    (s) => s.socket().onclose({ code: 4001 }),
    (s) => s.socket().receive({ t: "refuse", reason: "closed" }),
    (s) => s.socket().receive({ t: "refuse", reason: "auth" }),
  ]) {
    const s = setup(),
      events = [];
    s.client.on("closed", () => events.push("closed"));
    s.client.join("westminster");
    await flush();
    s.socket().open();
    stop(s);
    if (s.socket().readyState === 1) s.socket().onclose({ code: 1000 });
    assert.deepEqual(events, ["closed"]);
    assert.equal(s.client.closed, true);
    assert.deepEqual(s.timers, [], "no retry timer");
    const before = FakeSocket.all.length;
    s.client.reopen();
    await flush();
    assert.equal(s.client.closed, false);
    assert.equal(FakeSocket.all.length, before + 1, "one fresh attempt");
  }
});

test("reconnect delays follow data/world.json and are capped at its last entry (1 s up to 30 s), never faster", async () => {
  const s = setup({ getToken: async () => null });
  s.client.join("westminster");
  await flush();
  const seen = [];
  for (let i = 0; i < 9; i++) {
    seen.push(s.timers.at(-1).ms);
    s.timers.at(-1).fn();
    await flush();
  }
  assert.deepEqual(seen, [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000]);
});

test("SECURITY: the endpoint is the page's own /arma/ws; a presenceUrl in the page URL can never send the token elsewhere", () => {
  const location = { protocol: "https:", host: "playarmagedom.com" },
    own = { url: "wss://playarmagedom.com/arma/ws" };
  for (const dev of [false, true])
    for (const evil of [
      "wss://attacker.example/x",
      "ws://attacker.example",
      "wss://localhost.attacker.example/x",
      "wss://127.0.0.1.attacker.example/x",
      "wss://user@attacker.example/",
      "https://attacker.example",
      "//attacker.example",
    ])
      assert.deepEqual(
        presenceConfig({ search: `?presence=1&presenceUrl=${encodeURIComponent(evil)}`, storage: null, location, dev }),
        own,
        `${evil} (dev ${dev}) must be ignored`,
      );
  // In production even a local URL is ignored; only a dev build may point at this machine.
  assert.deepEqual(presenceConfig({ search: "?presence=1&presenceUrl=ws://127.0.0.1:8892", storage: null, location, dev: false }), own);
  assert.deepEqual(presenceConfig({ search: "?presence=1&presenceUrl=ws://127.0.0.1:8892", storage: null, location, dev: true }), {
    url: "ws://127.0.0.1:8892/",
  });
  assert.deepEqual(presenceConfig({ search: "?presence=1&presenceUrl=ws://localhost:8892", storage: null, location, dev: true }), {
    url: "ws://localhost:8892/",
  });
  assert.equal(localDevUrl("wss://attacker.example"), null);
  assert.equal(localDevUrl("not a url"), null);
});

test("SECURITY: with a foreign presenceUrl in the page URL no socket opens to it and the token goes only to the page's own endpoint", async () => {
  const s = setup({
    url: presenceConfig({
      search: "?presence=1&presenceUrl=wss://attacker.example/x",
      storage: null,
      location: { protocol: "https:", host: "playarmagedom.com" },
      dev: false,
    }).url,
  });
  s.client.join("westminster");
  await flush();
  assert.equal(FakeSocket.all.length, 1);
  assert.equal(FakeSocket.all[0].url, "wss://playarmagedom.com/arma/ws");
  assert.ok(FakeSocket.all.every((socket) => !socket.url.includes("attacker")));
});

test("flush sends the current position at once, past the 80 ms throttle, and only when it differs from the last one sent", async () => {
  const s = setup();
  await joined(s);
  s.clock.ms += LOC_INTERVAL_MS;
  s.client.report({ x: 2, z: -5.678 }, s.clock.ms);
  s.clock.ms += 10; // inside the throttle: report would refuse
  assert.equal(s.client.report({ x: 2.4, z: -5.678 }, s.clock.ms), false);
  assert.equal(s.client.flush({ x: 2.4, z: -5.678 }, s.clock.ms), true);
  assert.deepEqual(s.socket().sent.at(-1), { t: "loc", x: 240, z: -568 });
  assert.equal(s.client.flush({ x: 2.4, z: -5.678 }, s.clock.ms), false, "nothing new to send");
});

test("positions go out as whole centimetres", () => {
  assert.equal(toCm(1.234), 123);
  assert.equal(toCm(-5.678), -568);
});
