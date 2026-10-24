// A3 save client: sends the phone's run record to the writer (POST <base>/<op>, Bearer token) when the world flag is on. Report-only for
// alpha: the local save stays the truth for play, nothing here is shown to the player, and every failure is swallowed (logged) so the game
// is exactly the single-player game. Two things come back from the server: `clamped` cash (the server's carried/bank win, adopted into the
// live run) and `unreceipted` paths (logged, never acted on). Contract: docs/MULTIPLAYER-DATA-LAYER.md (seq per character, revision guard).
// Tuning (interval, character name, retries) is data: Web/src/data/save-client.json through game-data.js.
import { GAME_DATA } from "./game-data.js";

export const CHARACTER_KEY = "armagedom.world.character.v1";

// The server's money wins: only the two numbers it clamped change. Returns true when something was adopted.
export function adoptServerCash(game, reply) {
  if (reply?.clamped !== true || !game?.marked || !Number.isFinite(reply.carried) || !Number.isFinite(reply.bank))
    return false;
  game.marked.carried = reply.carried;
  game.marked.bank = reply.bank;
  return true;
}

// The run save lives under armagedom:area1-run:v1 (first era) or armagedom:area-run:v3 (extended loot); both are watched.
export const isRunKey = (key) => /^armagedom:area1?-run:v\d+$/.test(key);

// Watches a storage for writes of the keys `matches` accepts without changing what it stores: everything else passes straight through.
export function observeStorage(storage, matches, onWrite) {
  if (!storage) return storage;
  return new Proxy(storage, {
    get(target, name) {
      if (name === "setItem")
        return (k, value) => {
          target.setItem(k, value);
          if (matches(k)) {
            try {
              onWrite(value);
            } catch {
              /* A listener must never break the local save. */
            }
          }
        };
      const member = target[name];
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
}

export function createSaveClient({
  baseUrl,
  getToken,
  storage = null,
  fetchImpl = globalThis.fetch,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
  onCash = () => {},
  log = () => {},
  tuning = GAME_DATA.saveClient,
}) {
  if (!baseUrl || typeof getToken !== "function") return null;
  let character = null,
    revision = null, // null: not synced yet
    seq = 0,
    uncertain = false, // the last request's outcome is unknown (network error): a "stale" answer then means our own save landed
    latest = null, // newest raw record not yet sent
    sending = false,
    lastSentAt = -Infinity,
    timer = null,
    stopped = false;

  const read = (key) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      storage?.setItem(key, value);
    } catch {
      /* The id is then asked for again next load. */
    }
  };

  async function call(op, body) {
    const token = await getToken();
    if (!token) return { error: "no-token" };
    try {
      const response = await fetchImpl(`${baseUrl}/${op}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      return response.ok
        ? payload
        : { error: payload?.error ?? `http-${response.status}`, status: response.status, ...payload };
    } catch {
      return { error: "network" };
    }
  }

  async function ensureCharacter() {
    character ??= read(CHARACTER_KEY);
    if (character) return character;
    const made = await call("create_character", { name: tuning.characterName });
    if (typeof made.character === "string") {
      character = made.character;
      write(CHARACTER_KEY, character);
    }
    return character;
  }

  // Learn the server's revision for this character (0 when it has no run yet). The record itself is NOT applied: alpha is report-only.
  async function sync() {
    if (revision !== null) return true;
    if (!(await ensureCharacter())) return false;
    const loaded = await call("load_run", { character });
    if (loaded.error) return false;
    revision = loaded.run?.revision ?? 0;
    return true;
  }

  async function send(raw) {
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "bad-record" };
    }
    if (!(await sync())) return { ok: false, reason: "offline" };
    for (let attempt = 0; attempt <= tuning.staleSeqRetries; attempt++) {
      seq++;
      const reply = await call("save_run", { character, era: record.version, record, revision, seq });
      if (reply.error === "network") {
        uncertain = true;
        return { ok: false, reason: "network" };
      }
      if (reply.error) return { ok: false, reason: reply.error, retryMs: reply.retryMs };
      if (reply.refused === "stale-seq" || reply.refused === "seq-conflict") {
        seq = reply.lastSeq; // the next loop iteration sends lastSeq + 1
        continue;
      }
      if (reply.refused === "stale" && uncertain) {
        // Our own earlier, unanswered save landed: take the server's revision and send this record again.
        revision = reply.revision;
        uncertain = false;
        continue;
      }
      if (reply.refused) {
        log(`[arma-save] refused: ${reply.refused}${reply.reason ? ` (${reply.reason})` : ""}`);
        return { ok: false, reason: reply.refused };
      }
      uncertain = false;
      revision = reply.revision;
      if (reply.unreceipted?.length) log(`[arma-save] unreceipted: ${reply.unreceipted.join(", ")}`);
      if (reply.clamped === true) onCash(reply);
      return { ok: true, reply };
    }
    return { ok: false, reason: "seq" };
  }

  function schedule() {
    if (timer !== null || sending || stopped || latest === null) return;
    const wait = Math.max(0, lastSentAt + tuning.minSaveIntervalMs - now());
    timer = setTimer(flush, wait);
  }

  async function flush() {
    timer = null;
    if (sending || stopped || latest === null) return;
    const raw = latest;
    latest = null;
    sending = true;
    lastSentAt = now();
    try {
      const result = await send(raw);
      if (!result.ok) log(`[arma-save] not saved: ${result.reason}`);
    } catch (error) {
      log(`[arma-save] error: ${error?.message}`);
    } finally {
      sending = false;
      schedule();
    }
  }

  return {
    // The newest local save: at most one request every minSaveIntervalMs, older unsent records are dropped (the newest carries all state).
    queue(raw) {
      if (typeof raw !== "string") return;
      latest = raw;
      schedule();
    },
    flush,
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    get state() {
      return { character, revision, seq, uncertain };
    },
  };
}
