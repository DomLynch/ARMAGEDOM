// POST /arma/clientlog (nginx: /arma/api/clientlog): the phone's error beacon. Public (boot failures happen before sign-in), so everything here is defensive:
// a 4 KB body cap, a fixed schema (unknown fields dropped, every string cut to a charset and a length), anything shaped like a secret or an email removed, and a
// per-IP token bucket. It writes one journal line per event and nothing else: no database, no Authorization header read.
import net from "node:net";

export const CLIENTLOG_MAX_BODY = 4096;
export const CLIENTLOG_LIMIT = { burst: 3, refillMs: 10_000 };
const MAX_EVENTS = 10,
  MAX_IPS = 5000;
const KINDS = new Set(["error", "boot", "presence", "sync"]);

// Things that must never reach a log. Order matters: the broad "long opaque run" rule comes last.
const SECRETS = [
  /eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*){0,2}/g, // a JWT (header part starts eyJ)
  /\b(?:access|refresh|id)?_?token\s*[=:]\s*\S+/gi,
  /\bBearer\s+\S+/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, // an email address
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, // an account or character uuid
];
const FREE_TEXT_ONLY = [
  /\?[^\s]*/g, // a query string
  /[A-Za-z0-9_\-+/=]{24,}/g, // any other long opaque run (keys, hashes)
];
const redact = (rules, text) => rules.reduce((s, re) => s.replace(re, "[x]"), String(text));
/** Free text (message): every rule, then control characters flattened. */
export const scrub = (text) => redact([...SECRETS, ...FREE_TEXT_ONLY], text).replace(/[^\x20-\x7e]/g, " ");

/** An identifier field (release, area, code): the structured secret rules first (a commit sha of 40 hex characters must survive, so no opaque-run rule), then the charset and length cut. */
const word = (value, max, fallback = "") => {
  const s = typeof value === "string" ? redact(SECRETS, value).replace(/[^A-Za-z0-9._/:-]/g, "_").slice(0, max) : "";
  return s || fallback;
};

/**
 * The validated, scrubbed form of a beacon body, or null when it is not one: { release, area, events: [{ kind, code, message, n }] }.
 * Limits: release <= 80 chars, area <= 32, session <= 24 (a random id per page load, not tied to the account), at most 10 events, code <= 40, message <= 200, n an integer 1..1000.
 */
export function cleanClientLog(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body) || body.v !== 1 || !Array.isArray(body.events) || body.events.length === 0) return null;
  const events = [];
  for (const e of body.events.slice(0, MAX_EVENTS)) {
    if (e === null || typeof e !== "object" || !KINDS.has(e.kind)) continue;
    events.push({
      kind: e.kind,
      code: word(e.code, 40, "none"),
      message: scrub(typeof e.message === "string" ? e.message : "").slice(0, 200),
      n: Number.isInteger(e.n) ? Math.min(1000, Math.max(1, e.n)) : 1,
    });
  }
  if (!events.length) return null;
  return { release: word(body.release, 80, "unknown"), area: word(body.area, 32, "none"), session: word(body.session, 24, "none"), events }; // charset-limited ids, not free text: a 40-char commit sha must survive
}

/** Per-IP token buckets, bounded: when MAX_IPS keys are held the full-again ones are dropped, then the oldest. Returns allow(ip) -> boolean. */
export function ipLimiter({ burst, refillMs }, now = Date.now) {
  const buckets = new Map();
  return (ip) => {
    const t = now();
    if (buckets.size >= MAX_IPS) {
      for (const [k, b] of buckets) if (b.tokens + (t - b.at) / refillMs >= burst) buckets.delete(k);
      while (buckets.size >= MAX_IPS) buckets.delete(buckets.keys().next().value);
    }
    const had = buckets.get(ip) ?? { tokens: burst, at: t };
    const tokens = Math.min(burst, had.tokens + (t - had.at) / refillMs);
    buckets.delete(ip); // re-insert so Map order is least-recently-used first
    if (tokens < 1) {
      buckets.set(ip, { tokens, at: t });
      return false;
    }
    buckets.set(ip, { tokens: tokens - 1, at: t });
    return true;
  };
}

/** The client IP nginx saw. The writer listens on loopback only, so X-Real-IP (which nginx sets, overwriting any client value) is trusted; anything else shares one key. */
export const clientIp = (req) => {
  const ip = String(req.headers["x-real-ip"] ?? "").trim();
  return net.isIP(ip) ? ip : "unknown";
};
