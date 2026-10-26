// Client error beacon for the ONLINE path (it exists only once the world has started): uncaught errors and boot / presence / sync
// failures, batched and sent to POST <origin>/arma/api/clientlog, which the writer only writes to its journal. Nothing personal leaves
// the page: the rows carry a kind, a short code, a scrubbed message, a count, the area id and the release path. No token, no cookie
// (credentials omitted, no Authorization), no URL query or hash. At most one request every minIntervalMs; the same failure repeating
// is one row with a count, so a reconnect storm is a few bytes. A failed send is dropped: the beacon never retries and never throws.
import { GAME_DATA } from "./game-data.js";

// What may not leave the page, in the order it is removed: URLs (their query and hash included), token shapes and e-mail addresses.
export function scrub(value, max = GAME_DATA.world.clientLog.messageChars) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"')]*/gi, (url) => url.replace(/[?#].*$/, ""))
    .replace(/\bBearer\s+\S+/gi, "Bearer <x>") // text-ok: redaction marker in a diagnostic log line
    .replace(/\b(access_token|refresh_token|token|apikey|code|link)=\S+/gi, "$1=<x>")
    .replace(/\beyJ[\w-]{5,}(?:\.[\w-]+)*/g, "<jwt>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
const cleanCode = (value) =>
  String(value ?? "")
    .replace(/[^A-Za-z0-9_.:-]/g, "")
    .slice(0, 40) || "unknown"; // tuning-ok: the longest error code kept in a client log line
// The release the page was served from is part of its path (/armagedom/preview/<id>/ or /armagedom/releases/<id>/); nothing else is kept.
export const releaseOf = (pathname) =>
  String(pathname ?? "")
    .replace(/[^A-Za-z0-9._/:-]/g, "")
    .slice(0, 80); // tuning-ok: the longest release path kept in a client log line

// A random id for this page load only: it ties one visit's rows together and is not tied to the account, the token or the device.
export function newSessionId(random = globalThis.crypto) {
  const bytes = new Uint8Array(6);
  if (random?.getRandomValues) random.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createClientLog({
  baseUrl = "",
  release = "",
  sessionId = newSessionId(),
  getArea = () => "",
  fetchImpl = globalThis.fetch,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  tuning = GAME_DATA.world.clientLog,
} = {}) {
  const rows = new Map(); // "kind code message" -> { kind, code, message, n }
  let timer = null,
    lastSentAt = -Infinity,
    dropped = 0,
    paused = false,
    stopped = false;

  function schedule() {
    if (timer !== null || stopped || rows.size === 0) return;
    // A first failure waits a second so the rows that arrive with it travel together; after that, never faster than minIntervalMs.
    timer = setTimer(flush, Math.max(1000, lastSentAt + tuning.minIntervalMs - now()));
  }

  function flush() {
    timer = null;
    if (stopped || rows.size === 0 || typeof fetchImpl !== "function") return;
    const events = [...rows.values()].slice(0, tuning.maxEvents),
      head = { v: 1, release, session: sessionId, area: cleanCode(getArea()), ...(dropped ? { dropped } : {}) },
      build = () => JSON.stringify({ ...head, events });
    // The writer refuses a body over 4096 BYTES, and escapes and non-ASCII text count more than characters: drop rows from the end of
    // this batch (they stay queued for the next window) until the encoded body fits. One row alone always fits (200 characters).
    let body = build();
    while (events.length > 1 && new TextEncoder().encode(body).length > tuning.maxBodyBytes) {
      events.pop();
      body = build();
    }
    for (const row of events) rows.delete(`${row.kind} ${row.code} ${row.message}`);
    lastSentAt = now();
    dropped = 0;
    try {
      Promise.resolve(
        fetchImpl(`${baseUrl}${tuning.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          credentials: "omit",
          keepalive: true,
        }),
      ).catch(() => {});
    } catch {
      /* The beacon must never break the game. */
    }
    schedule();
  }

  const api = {
    // kind: one of tuning.kinds; code: a short stable id ("pull-failed", "close-1006"); detail: an Error, a string or nothing.
    report(kind, code, detail = "") {
      if (stopped || paused || !tuning.kinds.includes(kind)) return;
      const row = { kind, code: cleanCode(code), message: scrub(detail?.message ?? detail), n: 1 },
        key = `${row.kind} ${row.code} ${row.message}`,
        had = rows.get(key);
      if (had) had.n++;
      else if (rows.size >= tuning.maxDistinct) dropped++;
      else rows.set(key, row);
      schedule();
    },
    // window-like target: uncaught errors and unhandled promise rejections become rows.
    install(target = globalThis) {
      const onError = (event) => api.report("error", "uncaught", event?.error ?? event?.message ?? "");
      const onRejection = (event) => api.report("error", "unhandled-rejection", event?.reason ?? "");
      target.addEventListener?.("error", onError);
      target.addEventListener?.("unhandledrejection", onRejection);
      return () => {
        target.removeEventListener?.("error", onError);
        target.removeEventListener?.("unhandledrejection", onRejection);
      };
    },
    flush,
    // The server's status read says the world is closed: send nothing, keep nothing, until a status read says open again.
    pause() {
      paused = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      rows.clear();
      dropped = 0;
    },
    resume() {
      paused = false;
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      rows.clear();
    },
    get pending() {
      return rows.size;
    },
  };
  return api;
}
