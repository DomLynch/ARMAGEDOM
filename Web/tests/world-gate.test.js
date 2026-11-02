import test from "node:test";
import assert from "node:assert/strict";
import { createWorldGate } from "../src/engine/world-gate.js";
import { createSaveClient } from "../src/engine/save-client.js";
import { GAME_DATA, validateWorld } from "../src/engine/game-data.js";

const tuning = GAME_DATA.world;
const answer = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
function spy(handler) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
  };
}
const clock = () => {
  const c = { ms: 1000 };
  return { c, now: () => c.ms };
};

test("the status read bypasses the browser HTTP cache (no-store), so a 404 cached earlier is never served, and a non-200 is not remembered past the page", async () => {
  const s = spy(answer(404, { error: "route" }));
  const t = clock();
  const gate = createWorldGate({ baseUrl: "https://x.test", fetchImpl: s.fetchImpl, now: t.now });
  assert.equal(await gate.check(), false);
  assert.equal(s.calls[0].init.cache, "no-store");
  assert.equal(s.calls[0].url, "https://x.test/arma/api/status");
  // The 404 lives only in this page's memory: a new page (a new gate) asks again, and the route being back opens the world.
  const later = createWorldGate({ baseUrl: "https://x.test", fetchImpl: spy(answer(200, { enabled: true, open: true })).fetchImpl, now: t.now });
  assert.equal(await later.check(), true);
  // Within the page, a closed answer is only held for recheckMinMs, then read again.
  assert.equal(await gate.check(), false);
  assert.equal(s.calls.length, 1, "inside the interval the answer is the held one");
  t.c.ms += tuning.recheckMinMs;
  assert.equal(await gate.check(), false);
  assert.equal(s.calls.length, 2, "after the interval the status is read again");
});

test("the status path, timeout and recheck interval are data, and the loader refuses a bad file", () => {
  assert.equal(tuning.statusPath, "/arma/api/status");
  assert.throws(() => validateWorld({ ...tuning, statusPath: "https://evil.example/status" }));
  assert.throws(() => validateWorld({ ...tuning, presenceBackoffMs: [8000, 1000] }), /shrink/);
  assert.throws(() => validateWorld({ ...tuning, extra: 1 }));
});

test("open only when the server says enabled AND open (and this account is not refused)", async () => {
  const cases = [
    [{ enabled: true, open: true }, true],
    [{ enabled: true, open: true, allowed: true }, true],
    [{ enabled: true, open: true, allowed: false }, false],
    [{ enabled: false, open: true }, false],
    [{ enabled: true, open: false }, false],
    [{ enabled: "true", open: 1 }, false],
    [{}, false],
    [null, false],
  ];
  for (const [body, expected] of cases) {
    const w = spy(answer(200, body)),
      gate = createWorldGate({ baseUrl: "https://x.test", fetchImpl: w.fetchImpl });
    assert.equal(await gate.check(), expected, JSON.stringify(body));
    assert.equal(w.calls[0].url, "https://x.test/arma/api/status");
    assert.equal(w.calls[0].init.method, "GET");
    assert.equal(w.calls[0].init.headers.Authorization, undefined, "no token on the status read");
  }
});

test("a failing status read (HTTP error, network error, not JSON) leaves the world off, quietly", async () => {
  for (const fetchImpl of [
    answer(503, {}),
    async () => {
      throw new Error("offline");
    },
    async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError("x")) }),
  ])
    assert.equal(await createWorldGate({ fetchImpl }).check(), false);
});

test("while the world is off the ONLY request is the status read: repeated checks inside the interval make none, and nothing else is asked", async () => {
  const w = spy(answer(200, { enabled: false, open: false })),
    { c, now } = clock(),
    gate = createWorldGate({ fetchImpl: w.fetchImpl, now });
  for (let i = 0; i < 5; i++) await gate.check();
  assert.equal(w.calls.length, 1);
  assert.ok(w.calls.every((call) => call.url.endsWith("/arma/api/status")), "no other /arma request");
  c.ms += tuning.recheckMinMs - 1;
  await gate.check();
  assert.equal(w.calls.length, 1, "still inside the interval");
  c.ms += 2;
  await gate.check();
  assert.equal(w.calls.length, 2, "a later look is allowed");
  assert.equal(gate.reads, 2);
});

test("concurrent checks share one request; a change is announced once; force skips the interval", async () => {
  let open = false;
  const w = spy(async () => ({ ok: true, json: async () => ({ enabled: true, open }) })),
    { now } = clock(),
    gate = createWorldGate({ fetchImpl: w.fetchImpl, now }),
    changes = [];
  gate.onChange((value) => changes.push(value));
  await Promise.all([gate.check(), gate.check(), gate.check()]);
  assert.equal(w.calls.length, 1);
  assert.deepEqual(changes, [], "closed to closed is no change");
  open = true;
  assert.equal(await gate.check(), false, "inside the interval the answer is the cached one");
  assert.equal(await gate.check({ force: true }), true);
  await gate.check({ force: true });
  assert.deepEqual(changes, [true], "announced once");
  assert.equal(gate.open, true);
});

test("the save client stops on the closed error and sends nothing more until resume()", async () => {
  const sent = [],
    closed = [];
  const fetchImpl = async (url) => {
    const op = url.split("/").pop();
    sent.push(op);
    if (op === "create_character") return { ok: true, status: 200, json: async () => ({ character: "pc:1" }) };
    if (op === "load_run") return { ok: true, status: 200, json: async () => ({ run: null }) };
    return sent.filter((o) => o === "save_run").length === 1
      ? { ok: false, status: 403, json: async () => ({ error: tuning.closedError }) }
      : { ok: true, status: 200, json: async () => ({ revision: 1 }) };
  };
  const timers = [];
  const client = createSaveClient({
    baseUrl: "https://x.test/arma/api",
    getToken: async () => `h.${btoa(JSON.stringify({ sub: "u" }))}.s`,
    fetchImpl,
    now: () => 0,
    setTimer: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    clearTimer: () => {},
    onClosed: () => closed.push(true),
  });
  client.queue(JSON.stringify({ version: 18 }));
  await timers.shift().fn();
  assert.deepEqual(closed, [true]);
  assert.equal(client.halted, true);
  const asked = sent.length;
  client.queue(JSON.stringify({ version: 18, hp: 1 }));
  client.queue(JSON.stringify({ version: 18, hp: 2 }));
  assert.equal(timers.length, 0, "no timer while halted: no 5 s retry loop");
  assert.equal(sent.length, asked);
  client.resume();
  assert.equal(timers.length, 1, "the newest queued record goes out after the next fresh status read");
  await timers.shift().fn();
  assert.equal(sent.at(-1), "save_run");
  assert.equal(client.halted, false);
});
