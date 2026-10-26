// A3 save client: sends the phone's run record to the writer (POST <base>/<op>, Bearer token) when the world flag is on. Report-only for
// alpha: the local save stays the truth for play, nothing here is shown to the player, and every failure is swallowed (logged) so the game
// is exactly the single-player game. Two things come back from the server: `clamped` cash (the server's carried/bank win, adopted into the
// live run) and `unreceipted` paths (logged, never acted on). Contract: docs/MULTIPLAYER-DATA-LAYER.md (seq per character, revision guard).
// Tuning (interval, character name, retries) is data: Web/src/data/save-client.json through game-data.js.
import { GAME_DATA } from "./game-data.js";
import { CURRENT_ERA } from "./save-eras.js";

// Browsers cap the body of a keepalive request at 64 KiB in all; stay under it, else the page-hide send is a plain request.
const KEEPALIVE_MAX_BYTES = 60000;
// A run that is over (dead or finished): its save is sent at once, never held for the interval.
export const runIsOver = (game) => !!game && (game.finished === true || game.player?.hp <= 0);
export const CHARACTER_KEY ="armagedom.world.character.v1";
// The newest server revision this device has synced (saved to or loaded from), per account: `{ character, revision }`.
export const SYNCED_KEY = "armagedom.world.synced.v1";
export const syncedKey = (account) => `${SYNCED_KEY}:${account}`;
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

// The whole run is written under the NEWEST era's key (core/io/local-run-storage.js writes the top codec's RUN_SAVE_KEY), today
// armagedom:marked-run:v18. The older keys are read-only migration inputs, so they are not watched.
export const isRunKey = (key) => key === CURRENT_ERA.key;

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
    urgentPending = false, // the queued record is a death record: send it at once, not at the next interval
    urgentRun = null, // the run whose death was already marked urgent (later writes of the same dead run are routine)
    retryWait = 0, // after a refused or failed send: how long to wait before sending the kept record again
    retryFromUrgent = false, // that wait came from a death save's own refusal (a routine save's hold must not delay a death)
    lastToken = null, // the newest token seen, for the page-hide send (which cannot wait for an async token)
    hideGen = 0, // counts page-hide sends: a routine send that one overtook is stale and must stop, never retry (see send())
    stopped = false,
    halted = false; // the world answered "closed": no requests until resume() (the next status read said yes)

  // Our copy of the writer's per-account bucket for save_run: `tokens` refill continuously up to bucketBurst, every request spends one.
  // A routine save needs bucketReserve + 1 (it never spends the last bucketReserve); a death save needs 1; the page-hide send just goes.
  let tokens = tuning.bucketBurst,
    tokensAt = now();
  const refill = () => {
    const t = now();
    tokens = Math.min(tuning.bucketBurst, tokens + Math.max(0, t - tokensAt) / tuning.bucketRefillMs);
    tokensAt = t;
  };
  const waitForTokens = (need) => {
    refill();
    return Math.max(0, Math.ceil((need - tokens) * tuning.bucketRefillMs));
  };
  const spendToken = () => {
    refill();
    tokens = Math.max(0, tokens - 1);
  };

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
    lastToken = token;
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
        halted = true; // closed or not allow-listed: stop the loop (keep the character and sequence) and ask for a status read
        revision = null; // the server may move on while we are stopped: the next send learns the revision again first
        loadedRun = null;
        try {
          onClosed();
        } catch {
          /* The listener must not break the save path. */
        }
      }
      // A proxy's 429 carries its wait in the Retry-After header (seconds) and no JSON: honour it like the writer's own retryMs.
      const header = Number(response.headers?.get?.("retry-after"));
      return response.ok
        ? payload
        : {
            error: payload?.error ?? `http-${response.status}`,
            status: response.status,
            ...(Number.isFinite(header) && header > 0 ? { retryMs: Math.ceil(header * 1000) } : {}),
            ...payload,
          };
    } catch {
      return { error: "network" };
    }
  }

  async function ensureCharacter() {
    if (!(await who())) return null;
    if (!character && account) character = read(characterKey(account)) || null;
    if (character) return character;
    // A device with no cached id (a second phone on the same account) joins the account's active character; creating one here would
    // take the active slot from the first phone. Unknown (the lookup failed): create nothing, try again on the next send.
    const found = await call("active", {});
    if (found.error) return null;
    if (typeof found.character === "string") {
      character = found.character;
      if (account) write(characterKey(account), character);
      return character;
    }
    const made = await call("create_character", { name: tuning.characterName });
    if (typeof made.character === "string") {
      character = made.character;
      if (account) write(characterKey(account), character);
    }
    return character;
  }

  // Learn the server's revision for this character (0 when it has no run yet); the loaded run is kept for pull().
  let loadedRun = null;
  async function sync() {
    if (revision !== null) return true;
    if (!(await ensureCharacter())) return false;
    const loaded = await call("load_run", { character });
    if (loaded.error) return false;
    loadedRun = loaded.run ?? null;
    revision = loadedRun?.revision ?? 0;
    return true;
  }

  // The newest revision this device has synced for the current character (null: never, e.g. a new device or cleared storage).
  function readSynced() {
    try {
      const mark = JSON.parse(read(syncedKey(account)) ?? "null");
      return mark?.character === character && Number.isInteger(mark.revision) ? mark.revision : null;
    } catch {
      return null;
    }
  }
  function markSynced(value) {
    if (account && character && Number.isInteger(value))
      write(syncedKey(account), JSON.stringify({ character, revision: value }));
  }

  async function send(raw, run, { urgent = false } = {}) {
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "bad-record" };
    }
    const generation = hideGen;
    await who(); // a changed account resets the cached character, revision and sequence BEFORE the request is built
    if (!(await sync()) || !character) return { ok: false, reason: "offline" };
    const sent = { carried: record.marked?.carried ?? 0, bank: record.marked?.bank ?? 0 };
    for (let attempt = 0; attempt <= tuning.staleSeqRetries; attempt++) {
      // A page-hide send left after this one began: it carries a NEWER record. This record must never be sent (or resent) now, or the
      // server would end on the older state (a living save over a death). Nothing is requeued: the newer record is sent or kept.
      if (hideGen !== generation) return { ok: false, reason: "superseded" };
      // Not enough tokens (a routine save leaves the reserve alone): nothing is sent, the record waits for the bucket to refill.
      const wait = waitForTokens(urgent ? 1 : 1 + tuning.bucketReserve);
      if (wait > 0) return { ok: false, reason: "rate-limited", status: 429, retryMs: wait, local: true }; // tuning-ok: HTTP status code
      spendToken();
      seq++;
      const reply = await call("save_run", { character, era: record.version, record, revision, seq });
      if (reply.status === 429) { // tuning-ok: HTTP status code
        refill();
        tokens = 0; // the writer says its bucket is empty, whatever we thought
      }
      const overtaken = hideGen !== generation;
      if (reply.error === "network") {
        uncertain = true;
        return { ok: false, reason: "network" };
      }
      if (reply.error) {
        if (reply.status === 429) seq--; // tuning-ok: HTTP status code (refused before it was counted: the same sequence number goes out again)
        // The writer may have committed before the proxy gave up.
        if (reply.status === 502 || reply.status === 504) uncertain = true; // tuning-ok: HTTP status codes
        return { ok: false, reason: reply.error, retryMs: reply.retryMs, status: reply.status };
      }
      if (overtaken && ["stale", "stale-seq", "seq-conflict"].includes(reply.refused)) return { ok: false, reason: "superseded" };
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
      markSynced(revision);
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

  // One request in flight and the newest record queued behind it (older unsent records are dropped: the newest carries all state).
  // A refused or failed send keeps its record queued and waits `retryWait` (the writer's Retry-After); a death record skips the interval.
  function schedule() {
    if (sending || stopped || halted || latest === null) return;
    // A hold left by a routine save does not delay a death record (it may use the reserve); a hold left by a death save's own refusal does.
    const held = retryWait > 0 && (!urgentPending || retryFromUrgent);
    const wait = held ? retryWait : urgentPending ? 0 : Math.max(0, lastSentAt + tuning.minSaveIntervalMs - now());
    if (timer !== null) {
      if (wait > 0) return;
      clearTimer(timer); // a waiting routine send is overtaken by an urgent one
    }
    timer = setTimer(flush, wait);
  }

  async function flush() {
    timer = null;
    if (sending || stopped || halted || latest === null) return;
    const taken = latest,
      wasUrgent = urgentPending;
    latest = null;
    urgentPending = false;
    retryWait = 0;
    retryFromUrgent = false;
    sending = true;
    lastSentAt = now();
    try {
      const result = await send(taken.raw, taken.run, { urgent: wasUrgent });
      if (!result.ok) {
        // Our own bucket holding a save back is not a failure to report. The HTTP status and a death mark tell the beacon which send failed.
        if (!result.local) log(`[arma-save] not saved: ${result.reason}${result.status ? ` (http ${result.status})` : ""}${wasUrgent ? " [death]" : ""}`);
        // Never drop the record: a rate limit or a network failure leaves it queued (a newer record, if one arrived, replaces it).
        if (result.reason === "network" || result.status === 429 || result.status >= 500) { // tuning-ok: HTTP status codes
          if (latest === null) latest = taken;
          urgentPending = urgentPending || wasUrgent;
          // The writer's (or a proxy's) own wait when it gave one; otherwise the normal interval, so a down server is not hammered.
          retryWait = Math.max(tuning.retryFloorMs, result.retryMs ?? tuning.minSaveIntervalMs);
          retryFromUrgent = wasUrgent;
        }
      }
    } catch (error) {
      log(`[arma-save] error: ${error?.message}`);
    } finally {
      sending = false;
      schedule();
    }
  }

  // The page is going away (pagehide, or the tab turned hidden): send the newest unsent record NOW with a keepalive request, which the
  // browser finishes after the page is gone. It starts synchronously from the cached token, character and revision (an async token or
  // load would not finish in time); if any is unknown the record stays queued. Only the newest record is sent. A request already in
  // flight is not waited for: if it lands first this one is refused as stale (the in-flight one carried older state).
  function flushOnHide() {
    if (stopped || halted || latest === null || revision === null || !character || !lastToken) return false;
    let record;
    try {
      record = JSON.parse(latest.raw);
    } catch {
      return false;
    }
    const inFlight = sending;
    hideGen++; // a routine send already in flight is now older than this one: it stops instead of retrying over it
    spendToken(); // it may use the reserve; the writer decides if the bucket really had one
    const taken = latest,
      body = JSON.stringify({ character, era: record.version, record, revision, seq: ++seq });
    latest = null;
    urgentPending = false;
    retryWait = 0;
    lastSentAt = now();
    // Only when a routine send was in flight is a later "stale" possibly our own save landing; with nothing in flight a stale reply
    // means another device and must not be overwritten (a network failure of this send itself also makes the outcome unknown, below).
    if (inFlight) uncertain = true;
    const keep = () => {
      if (latest === null) latest = taken;
    };
    let request;
    try {
      request = fetchImpl(`${baseUrl}/save_run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lastToken}`, "Content-Type": "application/json" },
        body,
        keepalive: new TextEncoder().encode(body).length < KEEPALIVE_MAX_BYTES,
      });
    } catch {
      keep();
      return false;
    }
    Promise.resolve(request)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok && !payload.refused && !payload.error) {
          uncertain = false;
          revision = payload.revision;
          markSynced(revision);
        } else if (payload?.refused === "stale") {
          // The server holds a newer revision than this send was built on (another device saved, or an older save of ours landed first).
          // The server wins a save conflict: stop. The server's revision is NOT adopted and the record is NOT resent, so a newer save
          // from another device is never overwritten; this device pulls the server record on its next boot.
          uncertain = false;
          if (inFlight) {
            // A routine save of ours was in flight at hide time: most likely IT landed first. Its reply sets the revision, then this newest
            // record is sent on top at once (flush waits for the in-flight send to finish). If the stale was really another device's
            // save, the resend is refused again and nothing is overwritten (a normal send never adopts a revision unless uncertain).
            keep();
            urgentPending = true;
            log("[arma-save] page-hide save refused: stale (our own save landed first; the newest record is sent again)");
          } else log("[arma-save] page-hide save refused: stale (the server's newer save stays)");
        } else {
          keep();
          log(`[arma-save] page-hide save not saved: ${payload?.error ?? "refused"} (http ${response.status})`);
          if (payload?.retryMs) retryWait = payload.retryMs;
          if (response.status === 502 || response.status === 504) uncertain = true; // tuning-ok: HTTP status codes
        }
      })
      .catch(() => {
        keep();
        uncertain = true; // a network failure: this save may have landed
        log("[arma-save] page-hide save not saved: network");
      })
      .finally(schedule);
    return true;
  }

  return {
    // The newest local save: at most one request every minSaveIntervalMs, older unsent records are dropped (the newest carries all state).
    // `run` is the live game the record was built from: the server's cash correction is only applied back to that same run.
    // `urgent` marks a death record: the first one of a run goes out at once (the player may close the tab in the next second, and the
    // server must not keep a living save); later writes of the same dead run are routine.
    queue(raw, run = null, { urgent = false } = {}) {
      if (typeof raw !== "string") return;
      latest = { raw, run };
      if (urgent && run !== null && urgentRun !== run) {
        urgentRun = run;
        urgentPending = true;
      }
      schedule();
    },
    flush,
    flushOnHide,
    // A status read says the world is open again: carry on with the newest queued record.
    resume() {
      if (!halted) return;
      halted = false;
      schedule();
    },
    get halted() {
      return halted;
    },
    // Boot, before the run is read: the server save wins when it is online (multiplayer-proof.md). If the server's record is newer than
    // what this device last synced (or this device never synced), it replaces the local run in `target` (the UNWRAPPED storage, so the
    // write is not queued back). The replaced local record is kept under `<key>.pre-sync`, never lost. Only a record of the CURRENT era
    // is applied: an older one would not override the local newest-era key. Unreachable server: play local (the queue sends it later).
    // `canApply` is the cut-off: once the caller has read the local run (the game holds it and will save it), a late server record must
    // neither replace the stored run nor mark this device synced, or the next save would overwrite the newer server record.
    async pull({ target = storage, current = CURRENT_ERA, canApply = () => true } = {}) {
      if (!target || !(await sync()) || !character) return { status: "offline" };
      const run = loadedRun;
      if (!run || typeof run.record !== "object" || run.record === null) return { status: "kept" };
      const synced = readSynced();
      if (synced !== null && run.revision <= synced) return { status: "kept" };
      if (run.record.version !== current.version) return { status: "kept", reason: "other-era" };
      if (!canApply()) return { status: "kept", reason: "late" };
      try {
        const before = target.getItem(current.key);
        if (before != null) target.setItem(`${current.key}.pre-sync`, before);
        target.setItem(current.key, JSON.stringify(run.record));
      } catch {
        return { status: "kept", reason: "storage" };
      }
      markSynced(run.revision);
      return { status: "applied", revision: run.revision };
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
