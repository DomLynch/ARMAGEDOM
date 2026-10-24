import test from "node:test";
import assert from "node:assert/strict";
import { createGuestAuth, SESSION_KEY } from "../src/engine/guest-auth.js";

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
  const auth = createGuestAuth({ ...base, fetchImpl: f.fetchImpl, now: () => 1000 });
  const url = await auth.googleLinkUrl("https://playarmagedom.com/");
  assert.equal(url, "https://accounts.google.com/o/oauth2/auth?x=1");
  const call = f.calls.at(-1);
  assert.equal(call.options.headers.Authorization, "Bearer access-1");
  assert.match(call.url, /provider=google/);
  assert.match(call.url, /redirect_to=https%3A%2F%2Fplayarmagedom\.com%2F/);
});

test("a link URL that is not https, or a failed request, gives null", async () => {
  const bad = fake({
    "/auth/v1/signup": () => ({ body: session(1) }),
    "/auth/v1/user/identities/authorize": () => ({ body: { url: "javascript:alert(1)" } }),
  });
  assert.equal(await createGuestAuth({ ...base, fetchImpl: bad.fetchImpl, now: () => 1000 }).googleLinkUrl("https://x/"), null);
  const down = fake({
    "/auth/v1/signup": () => ({ body: session(1) }),
    "/auth/v1/user/identities/authorize": () => ({ status: 422 }),
  });
  assert.equal(await createGuestAuth({ ...base, fetchImpl: down.fetchImpl, now: () => 1000 }).googleLinkUrl("https://x/"), null);
});

test("coming back from Google, the session in the URL hash replaces the guest's token and keeps the user id", async () => {
  const storage = memory(),
    f = fake({ "/auth/v1/signup": () => ({ body: session(1) }) });
  const auth = createGuestAuth({ ...base, storage, fetchImpl: f.fetchImpl, now: () => 1000 });
  await auth.getToken();
  assert.equal(auth.takeRedirect("#access_token=g-access&refresh_token=g-refresh&expires_in=3600"), true);
  assert.equal(await auth.getToken(), "g-access");
  assert.equal(auth.isGuest, false);
  assert.equal(auth.userId, "user-1");
  assert.equal(auth.takeRedirect("#nothing=here"), false);
});
