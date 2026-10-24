import test from "node:test";
import assert from "node:assert/strict";
import { createGuestAuth, SESSION_KEY, LINK_KEY } from "../src/engine/guest-auth.js";

const memory = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
const session = (n, extra = {}) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  expires_in: 3600,
  user: { id: "user-1", is_anonymous: true },
  ...extra,
});
function fake(handlers) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    const key = Object.keys(handlers).find((k) => url.includes(k));
    const result = key ? handlers[key](calls.at(-1)) : { status: 404 };
    return { ok: (result.status ?? 200) < 400, status: result.status ?? 200, json: async () => result.body };
  };
  return { fetchImpl, calls };
}
const base = { url: "https://proj.supabase.co", anonKey: "publishable-key" };

test("without a project URL and key the live world is not configured", () => {
  assert.equal(createGuestAuth({ url: "", anonKey: "k" }), null);
  assert.equal(createGuestAuth({ url: "https://x", anonKey: "" }), null);
});

test("Play joins as an anonymous guest straight away, with the publishable key and nothing secret", async () => {
  const storage = memory(),
    f = fake({ "/auth/v1/signup": () => ({ body: session(1) }) });
  const auth = createGuestAuth({ ...base, storage, fetchImpl: f.fetchImpl, now: () => 1000 });
  assert.equal(await auth.getToken(), "access-1");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.headers.apikey, "publishable-key");
  assert.equal(f.calls[0].options.headers.Authorization, undefined);
  assert.equal(auth.isGuest, true);
  assert.equal(auth.userId, "user-1");
  assert.match(storage.data.get(SESSION_KEY), /access-1/);
});

test("a valid stored session is reused, so a reload does not make a new guest", async () => {
  const storage = memory(),
    f = fake({ "/auth/v1/signup": () => ({ body: session(1) }) });
  await createGuestAuth({ ...base, storage, fetchImpl: f.fetchImpl, now: () => 1000 }).getToken();
  const again = createGuestAuth({ ...base, storage, fetchImpl: f.fetchImpl, now: () => 2000 });
  assert.equal(await again.getToken(), "access-1");
  assert.equal(f.calls.length, 1);
});

test("an expiring token is refreshed (a minute early); a refused refresh falls back to a fresh guest", async () => {
  const storage = memory();
  let refuse = false;
  const f = fake({
    "/auth/v1/signup": () => ({ body: session(3) }),
    "grant_type=refresh_token": (call) => (refuse ? { status: 400 } : { body: session(2, { access_token: "access-2" }) }),
  });
  let clock = 1000;
  const auth = createGuestAuth({ ...base, storage, fetchImpl: f.fetchImpl, now: () => clock });
  assert.equal(await auth.getToken(), "access-3", "first call signs up");
  clock += 3600 - 30; // inside the early window
  refuse = false;
  assert.equal(await auth.getToken(), "access-2");
  assert.deepEqual(f.calls.at(-1).body, { refresh_token: "refresh-3" });
  clock += 3600 - 30;
  refuse = true;
  assert.equal(await auth.getToken(), "access-3", "a new guest rather than staying signed out");
});

test("concurrent callers share one request", async () => {
  const f = fake({ "/auth/v1/signup": () => ({ body: session(1) }) });
  const auth = createGuestAuth({ ...base, fetchImpl: f.fetchImpl, now: () => 1000 });
  const tokens = await Promise.all([auth.getToken(), auth.getToken(), auth.getToken()]);
  assert.deepEqual(tokens, ["access-1", "access-1", "access-1"]);
  assert.equal(f.calls.length, 1);
});

test("a failing auth service gives null (the presence client stays offline and retries), never a throw", async () => {
  const f = fake({ "/auth/v1/signup": () => ({ status: 500 }) });
  const auth = createGuestAuth({ ...base, fetchImpl: f.fetchImpl });
  assert.equal(await auth.getToken(), null);
  const broken = createGuestAuth({
    ...base,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(await broken.getToken(), null);
});

test("Sign in with Google links the guest: the link request carries the guest's bearer token and returns the Google URL", async () => {
  const f = fake({
    "/auth/v1/signup": () => ({ body: session(1) }),
    "/auth/v1/user/identities/authorize": () => ({ body: { url: "https://accounts.google.com/o/oauth2/auth?x=1" } }),
  });
  const linkStorage = memory(),
    auth = createGuestAuth({ ...base, linkStorage, nonce: () => "n-1", fetchImpl: f.fetchImpl, now: () => 1000 });
  const url = await auth.googleLinkUrl("https://playarmagedom.com/");
  assert.equal(url, "https://accounts.google.com/o/oauth2/auth?x=1");
  const call = f.calls.at(-1);
  assert.equal(call.options.headers.Authorization, "Bearer access-1");
  assert.match(call.url, /provider=google/);
  assert.match(call.url, /redirect_to=https%3A%2F%2Fplayarmagedom\.com%2F%3Flink%3Dn-1/, "the nonce travels in the return URL");
  assert.deepEqual(JSON.parse(linkStorage.data.get(LINK_KEY)), { nonce: "n-1", userId: "user-1", at: 1000 });
});

test("without tab storage there is no safe way to take the return, so no link is offered", async () => {
  const f = fake({ "/auth/v1/signup": () => ({ body: session(1) }) });
  const auth = createGuestAuth({ ...base, linkStorage: null, fetchImpl: f.fetchImpl, now: () => 1000 });
  assert.equal(await auth.googleLinkUrl("https://playarmagedom.com/"), null);
});

test("a link URL that is not https, or a failed request, gives null", async () => {
  const bad = fake({
    "/auth/v1/signup": () => ({ body: session(1) }),
    "/auth/v1/user/identities/authorize": () => ({ body: { url: "javascript:alert(1)" } }),
  });
  assert.equal(
    await createGuestAuth({ ...base, linkStorage: memory(), fetchImpl: bad.fetchImpl, now: () => 1000 }).googleLinkUrl("https://x/"),
    null,
  );
  const down = fake({
    "/auth/v1/signup": () => ({ body: session(1) }),
    "/auth/v1/user/identities/authorize": () => ({ status: 422 }),
  });
  assert.equal(
    await createGuestAuth({ ...base, linkStorage: memory(), fetchImpl: down.fetchImpl, now: () => 1000 }).googleLinkUrl("https://x/"),
    null,
  );
});

// A player who has started a Google link (the nonce is stored in this tab) and a hash that comes back with tokens.
async function linking({ userAfter = { id: "user-1", is_anonymous: false }, clock = { now: 1000 } } = {}) {
  const storage = memory(),
    linkStorage = memory(),
    f = fake({
      "/auth/v1/signup": () => ({ body: session(1) }),
      "/auth/v1/user/identities/authorize": () => ({ body: { url: "https://accounts.google.com/x" } }),
      "/auth/v1/user": () => ({ body: userAfter }),
    });
  const auth = createGuestAuth({ ...base, storage, linkStorage, nonce: () => "n-1", fetchImpl: f.fetchImpl, now: () => clock.now });
  await auth.googleLinkUrl("https://playarmagedom.com/");
  return { auth, storage, linkStorage, f };
}
const HASH = "#access_token=g-access&refresh_token=g-refresh&expires_in=3600";

test("coming back from Google with this tab's nonce and the SAME user id, the new session replaces the guest's", async () => {
  const { auth, linkStorage } = await linking();
  assert.equal(await auth.takeRedirect(HASH, "?link=n-1"), true);
  assert.equal(await auth.getToken(), "g-access");
  assert.equal(auth.isGuest, false);
  assert.equal(auth.userId, "user-1");
  assert.equal(linkStorage.data.has(LINK_KEY), false, "the nonce is spent");
});

test("SECURITY: a hash with tokens but no link pending in this tab is ignored (login CSRF)", async () => {
  const f = fake({ "/auth/v1/signup": () => ({ body: session(1, { user: { id: "victim-guest", is_anonymous: true } }) }) });
  const auth = createGuestAuth({ ...base, linkStorage: memory(), fetchImpl: f.fetchImpl, now: () => 1000 });
  assert.equal(await auth.getToken(), "access-1");
  const attacker = "#access_token=ATTACKER_AT&refresh_token=ATTACKER_RT&expires_in=3600";
  assert.equal(await auth.takeRedirect(attacker, ""), false);
  assert.equal(await auth.takeRedirect(attacker, "?link=guess"), false);
  assert.equal(await auth.getToken(), "access-1", "still the victim's own session");
  assert.equal(auth.userId, "victim-guest");
  assert.equal(auth.isGuest, true);
});

test("SECURITY: a pending link only accepts its own nonce, once, and within ten minutes", async () => {
  const wrong = await linking();
  assert.equal(await wrong.auth.takeRedirect(HASH, "?link=other"), false);
  assert.equal(await wrong.auth.getToken(), "access-1");
  assert.equal(await wrong.auth.takeRedirect(HASH, "?link=n-1"), false, "a wrong attempt spends the pending link");
  const once = await linking();
  assert.equal(await once.auth.takeRedirect(HASH, "?link=n-1"), true);
  assert.equal(await once.auth.takeRedirect(HASH, "?link=n-1"), false, "one time only");
  const clock = { now: 1000 },
    late = await linking({ clock });
  clock.now += 601;
  assert.equal(await late.auth.takeRedirect(HASH, "?link=n-1"), false, "expired");
  assert.equal(await late.auth.getToken(), "access-1");
});

test("SECURITY: a returned token that belongs to a DIFFERENT user is discarded and the guest's session is kept", async () => {
  const { auth, storage } = await linking({ userAfter: { id: "someone-else", is_anonymous: false } });
  assert.equal(await auth.takeRedirect(HASH, "?link=n-1"), false);
  assert.equal(await auth.getToken(), "access-1");
  assert.equal(auth.userId, "user-1");
  assert.match(storage.data.get(SESSION_KEY), /refresh-1/, "the guest's refresh token is still stored");
});

test("a returned token whose user cannot be verified is discarded", async () => {
  const down = await linking();
  down.f.calls.length = 0;
  const bad = createGuestAuth({
    ...base,
    storage: down.storage,
    linkStorage: down.linkStorage,
    fetchImpl: async (u) => (u.includes("/auth/v1/user") && !u.includes("identities") ? { ok: false, status: 503, json: async () => ({}) } : down.f.fetchImpl(u)),
    now: () => 1000,
  });
  assert.equal(await bad.takeRedirect(HASH, "?link=n-1"), false);
  assert.equal(await bad.getToken(), "access-1");
});

test("DATA LOSS: a refresh that fails with a 5xx or a network error keeps the stored guest and returns null; only a definite refusal makes a new guest", async () => {
  const storage = memory();
  let mode = "ok";
  const f = fake({
    "/auth/v1/signup": () => ({ body: session(2, { user: { id: "guest-2", is_anonymous: true } }) }),
    "grant_type=refresh_token": () => (mode === "503" ? { status: 503 } : mode === "401" ? { status: 401 } : { body: session(1) }),
  });
  let clock = 1000;
  const fetchImpl = async (u, o) => {
    if (mode === "net" && u.includes("grant_type=refresh_token")) throw new Error("offline");
    return f.fetchImpl(u, o);
  };
  const auth = createGuestAuth({ ...base, storage, fetchImpl, now: () => clock });
  await auth.getToken(); // signs up as guest-2 first
  const keptRefresh = JSON.parse(storage.data.get(SESSION_KEY)).refresh_token;
  for (const bad of ["503", "net"]) {
    clock += 3600;
    mode = bad;
    assert.equal(await auth.getToken(), null, `${bad}: offline for now`);
    assert.equal(auth.userId, "guest-2");
    assert.equal(JSON.parse(storage.data.get(SESSION_KEY)).refresh_token, keptRefresh, `${bad}: the guest is not overwritten`);
  }
  assert.equal(f.calls.filter((c) => c.url.includes("/signup")).length, 1, "no second guest was created");
  mode = "401";
  assert.equal(await auth.getToken(), "access-2", "a definitive refusal falls back to a fresh guest");
});
