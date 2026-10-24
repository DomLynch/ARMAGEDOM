// A3 save client: sends the phone's run record to the writer (POST <base>/<op>, Bearer token) when the world flag is on. Report-only for
// alpha: the local save stays the truth for play, nothing here is shown to the player, and every failure is swallowed (logged) so the game
// is exactly the single-player game. Two things come back from the server: `clamped` cash (the server's carried/bank win, adopted into the
// live run) and `unreceipted` paths (logged, never acted on). Contract: docs/MULTIPLAYER-DATA-LAYER.md (seq per character, revision guard).
// Tuning (interval, character name, retries) is data: Web/src/data/save-client.json through game-data.js.
import { GAME_DATA } from "./game-data.js";

export const CHARACTER_KEY = "armagedom.world.character.v1";
// The cached character id belongs to one account: a new guest session must not reuse (and be refused) another's.
export const characterKey = (account) => `${CHARACTER_KEY}:${account}`;

// The account id is the token's `sub`. It is read only to key the cache; the server verifies the token.
export function accountOf(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

// The server lowered the cash of the record `sent`; apply ONLY that drop to the live run, and only if the live run is the one that
// produced the record. Spending after the record was built stays spent, a newer run is never touched. Returns true when adopted.
export function adoptServerCash(game, reply, { run = null, sent = null } = {}) {
  if (reply?.clamped !== true || !game?.marked || !run || game !== run || !sent) return false;
  if (![reply.carried, reply.bank, sent.carried, sent.bank].every(Number.isFinite)) return false;
  const drop = (was, now) => Math.max(0, was - now);
  game.marked.carried = Math.max(0, game.marked.carried - drop(sent.carried, reply.carried));
  game.marked.bank = Math.max(0, game.marked.bank - drop(sent.bank, reply.bank));
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
  onClosed = () => {},
  log = () => {},
  tuning = GAME_DATA.saveClient,
}) {
  if (!baseUrl || typeof getToken !== "function") return null;
  let account = null, // whose token the cached state below belongs to
    character = null,
    revision = null, // null: not synced yet
    seq = 0,
    uncertain = false, // the last request's outcome is unknown (network error): a "stale" answer then means our own save landed
    latest = null, // newest raw record not yet sent
    sending = false,
    lastSentAt = -Infinity,
    timer = null,
    stopped = false,
    halted = false; // the world answered "closed": no requests until resume() (the next status read said yes)

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

  // The current token. A different account (a new guest session) starts over: its own character, revision and sequence.
  async function who() {
    const token = await getToken();
    if (!token) return null;
    const next = accountOf(token);
    if (next !== account) {
      account = next;
      character = null;
      revision = null;
      seq = 0;
      uncertain = false;
    }
    return token;
  }
  // An O0007 refusal is NOT acted on here: it also means "the world is switched off / not allow-listed", and forgetting the character
  // then would orphan its receipts and cash. A refusal is only logged; the per-account key is what keeps guests apart.
  async function call(op, body) {
    const token = await who();
    if (!token) return { error: "no-token" };
    try {
      const response = await fetchImpl(`${baseUrl}/${op}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && payload?.error === GAME_DATA.world.closedError && !halted) {
        halted = true; // closed or not allow-listed: stop the loop (keep the character, revision and sequence) and ask for a status read
        try {
          onClosed();
        } catch {
          /* The listener must not break the save path. */
        }
      }
      return response.ok
        ? payload
        : { error: payload?.error ?? `http-${response.status}`, status: response.status, ...payload };
    } catch {
      return { error: "network" };
    }
  }

  async function ensureCharacter() {
    if (!(await who())) return null;
    if (!character && account) character = read(characterKey(account)) || null;
    if (character) return character;
    const made = await call("create_character", { name: tuning.characterName });
    if (typeof made.character === "string") {
      character = made.character;
      if (account) write(characterKey(account), character);
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

  async function send(raw, run) {
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "bad-record" };
    }
    await who(); // a changed account resets the cached character, revision and sequence BEFORE the request is built
    if (!(await sync()) || !character) return { ok: false, reason: "offline" };
    const sent = { carried: record.marked?.carried ?? 0, bank: record.marked?.bank ?? 0 };
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
      if (reply.clamped === true && onCash(reply, { run, sent }) === true) lowerPending(run, reply, sent);
      return { ok: true, reply };
    }
    return { ok: false, reason: "seq" };
  }

  // A record queued while the save above was in flight was built BEFORE the live run took the server's correction, so it still carries the
  // old cash and would be clamped (and adopted) a second time. Lower it by the same drop. Only the same run's pending record is touched.
  function lowerPending(run, reply, sent) {
    if (!latest || latest.run !== run) return;
    try {
      const record = JSON.parse(latest.raw);
      if (!record.marked || !Number.isFinite(record.marked.carried) || !Number.isFinite(record.marked.bank)) return;
      record.marked.carried = Math.max(0, record.marked.carried - Math.max(0, sent.carried - reply.carried));
      record.marked.bank = Math.max(0, record.marked.bank - Math.max(0, sent.bank - reply.bank));
      latest = { raw: JSON.stringify(record), run };
    } catch {
      /* An unreadable pending record is dropped by its own send. */
    }
  }

  function schedule() {
    if (timer !== null || sending || stopped || halted || latest === null) return;
    const wait = Math.max(0, lastSentAt + tuning.minSaveIntervalMs - now());
    timer = setTimer(flush, wait);
  }

  async function flush() {
    timer = null;
    if (sending || stopped || halted || latest === null) return;
    const { raw, run } = latest;
    latest = null;
    sending = true;
    lastSentAt = now();
    try {
      const result = await send(raw, run);
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
    // `run` is the live game the record was built from: the server's cash correction is only applied back to that same run.
    queue(raw, run = null) {
      if (typeof raw !== "string") return;
      latest = { raw, run };
      schedule();
    },
    flush,
    // A status read says the world is open again: carry on with the newest queued record.
    resume() {
      if (!halted) return;
      halted = false;
      schedule();
    },
    get halted() {
      return halted;
    },
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
