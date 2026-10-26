// Who does this access token belong to? One answer for the writer and presence: Supabase Auth's GET /auth/v1/user, with the answer kept for a
// short time so a burst of requests (a page's calls, a reconnect loop) asks Auth once. Abuse review, 26 Oct 2026, item 3.
//   * cache: keyed by the SHA-256 of the token (the token itself is never held), for AUTH.cacheTtlMs, and never past the token's own `exp`.
//     A token Auth refused is remembered for AUTH.negativeTtlMs, so a flood of junk tokens costs one Auth call per distinct token per window.
//     The price: a sign-out or ban reaches this service up to AUTH.cacheTtlMs late.
//   * what is kept is only what `pick(user)` returns (an id, or an id and a first name), never the profile.
//   * Auth saying 429 or 5xx, a timeout, or a network failure is NOT "invalid token": verify throws AuthUnavailable, nothing is cached, and the
//     caller answers 503 with a retry time instead of 401, so a Supabase hiccup does not sign players out.
//   * concurrent verifies of one token share one Auth call.
// The numbers are the `auth` block of server/data/rate-limits.json.
import crypto from "node:crypto";
import fs from "node:fs";

export const AUTH = JSON.parse(fs.readFileSync(new URL("../data/rate-limits.json", import.meta.url), "utf8")).auth;

export class AuthUnavailable extends Error {
  constructor(why) {
    super(`auth unavailable: ${why}`);
    this.code = "AUTH_UNAVAILABLE";
  }
}

const tokenKey = (token) => crypto.createHash("sha256").update(token).digest("hex");
/** The token's `exp` (seconds) when it is a JWT that carries one; used only to shorten a cache entry, never to trust the token. */
const expiresAtMs = (token) => {
  try {
    const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).exp;
    return Number.isFinite(exp) ? exp * 1000 : Infinity;
  } catch {
    return Infinity;
  }
};

/** verify(token) -> pick(user) | null (Auth refused it) ; throws AuthUnavailable when Auth could not answer. */
export function createVerifier({ url, anon, pick = (user) => user?.id ?? null, fetchImpl = fetch, now = Date.now, config = AUTH }) {
  const cache = new Map(); // key -> { value, until }
  const inflight = new Map(); // key -> promise
  const remember = (key, value, until) => {
    if (cache.size >= config.maxEntries) {
      const t = now();
      for (const [k, e] of cache) if (e.until <= t) cache.delete(k);
      while (cache.size >= config.maxEntries) cache.delete(cache.keys().next().value);
    }
    cache.delete(key); // re-insert so Map order is oldest first
    cache.set(key, { value, until });
  };
  async function ask(token, key) {
    let res;
    try {
      res = await fetchImpl(`${url}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: anon },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
    } catch (error) {
      throw new AuthUnavailable(error?.name ?? "network");
    }
    if (res.status === 429 || res.status >= 500) throw new AuthUnavailable(`status ${res.status}`);
    let value = null;
    if (res.ok) {
      try {
        value = pick(await res.json()) ?? null;
      } catch {
        throw new AuthUnavailable("unreadable answer");
      }
    }
    const t = now();
    remember(key, value, Math.min(t + (value === null ? config.negativeTtlMs : config.cacheTtlMs), expiresAtMs(token)));
    return value;
  }
  return async function verify(token) {
    const key = tokenKey(token),
      hit = cache.get(key);
    if (hit && hit.until > now()) return hit.value;
    if (!inflight.has(key)) inflight.set(key, ask(token, key).finally(() => inflight.delete(key)));
    return inflight.get(key);
  };
}
