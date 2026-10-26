import test from "node:test";
import assert from "node:assert/strict";
import { AUTH, AuthUnavailable, createVerifier } from "./supabase-verify.js";

const CONFIG = { cacheTtlMs: 60000, negativeTtlMs: 5000, maxEntries: 3, requestTimeoutMs: 4000, retryMs: 5000 };
const reply = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
// A fetch that answers from a script and counts its calls; "token-ok-*" is valid, "token-bad-*" is refused.
const authServer = (override = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const token = init.headers.Authorization.slice("Bearer ".length);
    calls.push(token);
    if (override.answer) return override.answer(token);
    return token.startsWith("token-ok") ? reply(200, { id: `user-of-${token}`, email: "secret@example.com", user_metadata: { name: "Ada" } }) : reply(401);
  };
  return { calls, fetchImpl };
};

test("the numbers come from the auth block of server/data/rate-limits.json", () => {
  assert.deepEqual(AUTH, { _comment: AUTH._comment, cacheTtlMs: 60000, negativeTtlMs: 5000, maxEntries: 5000, requestTimeoutMs: 4000, retryMs: 5000 });
});

test("a verified token is asked of Auth once for the cache window, then again after it; only what pick returns is kept", async () => {
  let clock = 1_000_000;
  const auth = authServer();
  const verify = createVerifier({ url: "https://x.supabase.co", anon: "anon", fetchImpl: auth.fetchImpl, now: () => clock, config: CONFIG, pick: (user) => ({ id: user.id }) });
  assert.deepEqual(await verify("token-ok-1"), { id: "user-of-token-ok-1" });
  assert.deepEqual(await verify("token-ok-1"), { id: "user-of-token-ok-1" });
  clock += 59_999;
  await verify("token-ok-1");
  assert.equal(auth.calls.length, 1);
  clock += 2;
  await verify("token-ok-1");
  assert.equal(auth.calls.length, 2, "asked again after cacheTtlMs");
});

test("a refused token is remembered briefly (a junk-token flood costs one call per token per window) and null is never confused with unavailable", async () => {
  let clock = 1_000_000;
  const auth = authServer();
  const verify = createVerifier({ url: "u", anon: "a", fetchImpl: auth.fetchImpl, now: () => clock, config: CONFIG });
  for (let i = 0; i < 5; i++) assert.equal(await verify("token-bad-1"), null);
  assert.equal(auth.calls.length, 1);
  clock += 5001;
  assert.equal(await verify("token-bad-1"), null);
  assert.equal(auth.calls.length, 2);
});

test("Auth saying 429 or 5xx, a timeout or a network failure throws AuthUnavailable and caches nothing", async () => {
  for (const answer of [() => reply(429), () => reply(503), () => { throw new TypeError("fetch failed"); }, () => reply(200, null)]) {
    const auth = authServer({ answer });
    const verify = createVerifier({ url: "u", anon: "a", fetchImpl: auth.fetchImpl, config: CONFIG, pick: (user) => user.id });
    await assert.rejects(verify("token-ok-1"), (error) => error instanceof AuthUnavailable && error.code === "AUTH_UNAVAILABLE");
    await assert.rejects(verify("token-ok-1"), AuthUnavailable);
    assert.equal(auth.calls.length, 2, "an unavailable answer is not cached");
  }
});

test("concurrent verifies of one token share one Auth call, the cache is bounded, and the token itself is never a key", async () => {
  const auth = authServer();
  const verify = createVerifier({ url: "u", anon: "a", fetchImpl: auth.fetchImpl, config: CONFIG });
  assert.deepEqual(await Promise.all([verify("token-ok-1"), verify("token-ok-1"), verify("token-ok-1")]), ["user-of-token-ok-1", "user-of-token-ok-1", "user-of-token-ok-1"]);
  assert.equal(auth.calls.length, 1);
  for (const n of [2, 3, 4]) await verify(`token-ok-${n}`); // maxEntries is 3: token 1 (the oldest) is dropped
  await verify("token-ok-4");
  assert.equal(auth.calls.length, 4);
  await verify("token-ok-1");
  assert.equal(auth.calls.length, 5, "the oldest entry was evicted");
});

test("a cache entry never outlives the token's own exp", async () => {
  let clock = 1_000_000_000_000;
  const jwt = (exp) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
  const token = jwt(Math.floor(clock / 1000) + 10); // expires in 10 s
  const calls = [];
  const verify = createVerifier({ url: "u", anon: "a", config: CONFIG, now: () => clock, fetchImpl: async (url, init) => (calls.push(init), reply(200, { id: "u1" })) });
  await verify(token);
  clock += 9_000;
  await verify(token);
  assert.equal(calls.length, 1);
  clock += 2_000;
  await verify(token);
  assert.equal(calls.length, 2, "asked again once the token's exp passed, well inside the 60 s window");
});
