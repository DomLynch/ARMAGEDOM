// The ARMAGEDOM writer (W1/W3): the one service that writes the database, as the low-privilege role `arma_writer`, and only by calling
// the SECURITY DEFINER functions in supabase/migrations. Modelled on Frankendom's Origins writer. It binds loopback; nginx (later) is the
// only public face. It performs no game rules of its own: the database is the referee.
//   client routes   POST /arma/<op>   Authorization: Bearer <Supabase access token>      (one request at a time per account)
//   internal routes POST /internal/<op>   x-arma-internal-key: <shared key>               (presence only: location and hit batches)
import fs from "node:fs";
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { AUTH } from "../shared/supabase-verify.js";
import { CLIENTLOG_LIMIT, CLIENTLOG_MAX_BODY, cleanClientLog, clientIp, ipLimiter } from "./clientlog.js";

const MAX_BODY = 256 * 1024;
const STATUS_MAX_AGE_S = 30,
  STATUS_MEMO_MS = 5000;
const STATUS = { O0007: 403, O0009: 409, O0010: 409, O0002: 422, O0001: 200 }; // O0010: the account already has its maximum characters

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const same = (a, b) => {
  const x = Buffer.from(String(a ?? "")),
    y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Per-account token buckets on the client routes that cost a database round trip: `burst` requests at once, then one more every `refillMs`.
// Numbers (docs/MULTIPLAYER-DATA-LAYER.md): saves 1 per 5 s, burst 6 (a fight's save triggers, then the death or pagehide flush, must not be refused); loads 1 per second, burst 3.
// The numbers live in server/data/rate-limits.json.
const RATE_LIMITS = JSON.parse(fs.readFileSync(new URL("../data/rate-limits.json", import.meta.url), "utf8"));
export const DEFAULT_LIMITS = RATE_LIMITS.clientOps;
export const MAINTENANCE = RATE_LIMITS.maintenance;

/** spawnRows over a plain object of world rows; names like "constructor" or "__proto__" are unknown spawns, not prototype values. */
export const spawnRowsFrom = (spawns) => (instance) => (Object.hasOwn(spawns, instance) ? spawns[instance] : null);

/**
 * db.query(sql, params) -> rows (a pg Pool or any adapter); verify(token) -> account uuid or null;
 * spawnRows(instance) -> { kind, area, maxHp } from the world rows, or null (the phone never names these).
 */
export function createWriter({ db, verify, spawnRows, internalKey, log = () => {}, now = Date.now, limits = DEFAULT_LIMITS }) {
  const lanes = new Map(); // account -> promise chain: one request at a time per account
  const counts = { requests: 0, refused: {}, hitBatches: 0, hitRows: 0, locations: 0 };
  const refuse = (why) => (counts.refused[why] = (counts.refused[why] ?? 0) + 1);
  const buckets = new Map(); // "<account> <op>" -> { tokens, at }
  /** Spend one token of the account's bucket for this op, or throw 429 with the wait in ms. An op with no limit passes. */
  const spend = (account, op) => {
    const limit = limits[op];
    if (!limit) return;
    const key = `${account} ${op}`,
      t = now();
    const had = buckets.get(key) ?? { tokens: limit.burst, at: t };
    const tokens = Math.min(limit.burst, had.tokens + Math.max(0, t - had.at) / limit.refillMs);
    if (tokens < 1) throw new HttpError(429, "rate-limited", { retryMs: Math.ceil((1 - tokens) * limit.refillMs) });
    buckets.set(key, { tokens: tokens - 1, at: t });
    // A full bucket is the same as no bucket: forget those so the map cannot grow with every account ever seen.
    if (buckets.size > 20000)
      for (const [k, b] of buckets) {
        const l = limits[k.split(" ")[1]];
        if (b.tokens + (t - b.at) / l.refillMs >= l.burst) buckets.delete(k);
      }
  };
  const call = async (fn, params) => {
    const marks = params.map((_, i) => `$${i + 1}`).join(", ");
    return (await db.query(`select public.${fn}(${marks}) as r`, params))[0]?.r;
  };

  const clientOps = {
    async create_character({ account, body }) {
      return { character: await call("arma_create_character", [account, String(body.name ?? "")]) };
    },
    // The account's active character (null when it has none or arma is closed to it): a second device joins it instead of creating one.
    async active({ account }) {
      return { character: (await call("arma_active", [account])) ?? null };
    },
    async set_active({ account, body }) {
      return { ok: await call("arma_set_active", [account, String(body.character ?? "")]) };
    },
    async load_run({ account, body }) {
      return { run: await call("arma_load_run", [account, String(body.character ?? "")]) };
    },
    async save_run({ account, body }) {
      const { character, era, record, revision, seq } = body;
      if (!Number.isInteger(era) || !Number.isInteger(revision) || !Number.isInteger(seq) || seq < 1 || seq > 2147483647 || typeof record !== "object" || record === null || Array.isArray(record))
        throw new HttpError(400, "bad-request");
      return call("arma_save_run", [account, String(character ?? ""), era, JSON.stringify(record), revision, seq]);
    },
    // Cash from a world stash or the airdrop, credited once per source per real-time window (arma_claim_pickup); the amount is clamped to the rule.
    async claim_pickup({ account, body }) {
      const source = String(body.source ?? ""),
        amount = Number(body.amount);
      if (!Number.isFinite(amount)) throw new HttpError(400, "bad-request");
      const active = await call("arma_active", [account]);
      if (!active) throw new HttpError(403, "no-character");
      // A kill may name its enemy kind and carry a client-made killId: loot is rolled by the database and a retried killId answers the first answer.
      const enemy = typeof body.enemy === "string" ? body.enemy : null,
        killId = typeof body.killId === "string" ? body.killId : null;
      return call("arma_claim_pickup", [account, active, source, amount, enemy, killId]);
    },
    // The market (docs/MARKET-CONTRACT.md). The database settles every price, stock row and replay.
    async inventory_get({ account }) {
      const active = await call("arma_active", [account]);
      if (!active) throw new HttpError(403, "no-character");
      // The wallet rides along so the shop opens with the server's cash: { inventory, cash, bank, ceiling }.
      return { inventory: await call("arma_inventory_get", [account, active]), ...(await call("arma_wallet", [account, active])) };
    },
    async item_defs({ account }) {
      return { items: await call("arma_item_defs", [account]) };
    },
    async market_stock({ account, body }) {
      return { stock: await call("arma_market_stock", [account, String(body.shop_id ?? "")]) };
    },
    async buy_item({ account, body }) {
      const active = await call("arma_active", [account]);
      if (!active) throw new HttpError(403, "no-character");
      return call("arma_buy_item", [account, active, String(body.shop_id ?? ""), String(body.item_id ?? ""), Number.isInteger(body.qty) ? body.qty : 0, String(body.request_id ?? "")]);
    },
    async sell_item({ account, body }) {
      const active = await call("arma_active", [account]);
      if (!active) throw new HttpError(403, "no-character");
      return call("arma_sell_item", [account, active, String(body.shop_id ?? ""), String(body.item_id ?? ""), Number.isInteger(body.qty) ? body.qty : 0, String(body.request_id ?? "")]);
    },
    async spawn_state({ account, body }) {
      const instances = Array.isArray(body.instances) ? body.instances.filter((s) => typeof s === "string").slice(0, 200) : [];
      return call("arma_spawn_state", [account, instances]);
    },
    async spawn_engage({ account, body }) {
      const row = spawnRows(String(body.instance ?? ""));
      if (!row) throw new HttpError(404, "unknown-spawn");
      const active = await call("arma_active", [account]);
      if (!active) throw new HttpError(403, "no-character");
      const token = randomBytes(24).toString("base64url");
      return call("arma_spawn_engage", [account, active, token, String(body.instance), row.kind, row.area, row.maxHp]);
    },
  };
  const internalOps = {
    // Presence's observation of where an account stands. The phone never writes this.
    async location({ body }) {
      counts.locations++;
      return call("arma_save_location", [String(body.account), String(body.area), body.x, body.z, body.atMs ?? now()]);
    },
    // Presence asks whether a verified account may be in the world (the same answer the client's status read gets with its token).
    async status({ body }) {
      if (typeof body.account !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.account)) throw new HttpError(400, "bad-request");
      return call("arma_world_status", [body.account]);
    },
    // One presence tick of already-clamped hits; the database clamps again.
    async hits({ body }) {
      if (!Array.isArray(body.batch)) throw new HttpError(400, "bad-request");
      counts.hitBatches++;
      counts.hitRows += body.batch.length;
      return call("arma_spawn_hit_batch", [JSON.stringify(body.batch)]);
    },
  };

  const allowClientLog = ipLimiter(CLIENTLOG_LIMIT, now);
  async function readJson(req, maxBody = MAX_BODY) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBody) throw new HttpError(413, "too-large");
      chunks.push(chunk);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (body === null || typeof body !== "object" || Array.isArray(body)) throw 0;
      return body;
    } catch {
      throw new HttpError(400, "bad-json");
    }
  }
  const serialise = (account, task) => {
    const run = (lanes.get(account) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => {});
    lanes.set(account, tail);
    tail.then(() => lanes.get(account) === tail && lanes.delete(account));
    return run;
  };
  let statusMemo = null; // { at, body }: the anonymous status answer
  const send = (res, status, payload, headers = {}) => {
    // Vary: the status answer differs with and without a token, so a shared cache must not serve one in place of the other.
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Authorization", ...headers });
    res.end(JSON.stringify(payload));
  };

  const server = http.createServer(async (req, res) => {
    counts.requests++;
    try {
      const url = new URL(req.url, "http://x"),
        [, area, op] = url.pathname.split("/");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, ...counts });
      // The client's one cheap read, before any signup, socket or save: {enabled, open} for anyone, plus {allowed} when a valid Bearer token is sent.
      // A token that is sent but not valid is a 401, never a quiet downgrade to the anonymous answer. No bucket, no body; nginx's per-IP limit covers it.
      if (req.method === "GET" && url.pathname === "/arma/status") {
        const header = req.headers.authorization;
        let account = null;
        if (header !== undefined) {
          const token = /^Bearer (.{10,4096})$/.exec(header)?.[1];
          account = token ? await verify(token) : null;
          if (!account) throw new HttpError(401, "token");
        }
        // The anonymous answer is the same for everyone: browsers and nginx may keep it 30 s (so the kill switch reaches pages within about half a minute), and the
        // writer itself reads the database at most once every 5 s for it. An answer for a token is per account: private, never cached.
        if (!account) {
          const t = now();
          if (!statusMemo || t - statusMemo.at > STATUS_MEMO_MS) statusMemo = { at: t, body: await call("arma_world_status", [null]) };
          return send(res, 200, statusMemo.body, { "Cache-Control": `public, max-age=${STATUS_MAX_AGE_S}` });
        }
        spend(account, "status");
        return send(res, 200, await call("arma_world_status", [account]), { "Cache-Control": "private, no-store" });
      }
      // The phone's error beacon: public, per-IP limited, journal only (clientlog.js). It never reads the Authorization header.
      if (req.method === "POST" && area === "arma" && op === "clientlog") {
        if (!allowClientLog(clientIp(req))) throw new HttpError(429, "rate", { retryAfterMs: CLIENTLOG_LIMIT.refillMs });
        const entry = cleanClientLog(await readJson(req, CLIENTLOG_MAX_BODY));
        if (!entry) throw new HttpError(400, "bad-request");
        counts.clientlog = (counts.clientlog ?? 0) + entry.events.length;
        for (const event of entry.events) log(`clientlog ${JSON.stringify({ release: entry.release, area: entry.area, session: entry.session, ...event })}`);
        res.writeHead(204, { "Cache-Control": "no-store", Vary: "Authorization" });
        return res.end();
      }
      // A wrong method on a route that exists is a 405; on anything else it is simply not a route.
      const knownPost = (area === "internal" && internalOps[op]) || (area === "arma" && clientOps[op]);
      if (req.method !== "POST") throw new HttpError(knownPost ? 405 : 404, knownPost ? "method" : "route");
      if (area === "internal" && internalOps[op]) {
        if (!internalKey || !same(req.headers["x-arma-internal-key"], internalKey)) throw new HttpError(401, "key");
        return send(res, 200, await internalOps[op]({ body: await readJson(req) }));
      }
      if (area === "arma" && clientOps[op]) {
        const token = /^Bearer (.{10,4096})$/.exec(req.headers.authorization ?? "")?.[1];
        if (!token) throw new HttpError(401, "token");
        const account = await verify(token);
        if (!account) throw new HttpError(401, "token");
        spend(account, op);
        const body = await readJson(req);
        return send(res, 200, await serialise(account, () => clientOps[op]({ account, body })));
      }
      throw new HttpError(404, "route");
    } catch (error) {
      // Supabase Auth could not answer (429, 5xx, timeout): that is not a bad token. 503 and a retry time, so the page waits instead of signing the player out.
      if (error?.code === "AUTH_UNAVAILABLE") error = new HttpError(503, "auth-unavailable", { retryMs: AUTH.retryMs });
      const status = error instanceof HttpError ? error.status : STATUS[error?.code] ?? 500;
      const code = error instanceof HttpError ? error.code : error?.code ?? "error";
      refuse(code);
      if (status === 500) log(`writer error: ${error?.message}`);
      const retryMs = error instanceof HttpError ? error.extra.retryMs : undefined;
      send(res, status, { error: code, ...(error instanceof HttpError ? error.extra : {}) }, retryMs ? { "Retry-After": String(Math.ceil(retryMs / 1000)) } : {});
    }
  });
  /** Deletes the spawn engages that can no longer be used (arma_prune_engages); resolves to the number deleted. main.js runs it on a timer. */
  // Also deletes market replay rows older than 7 days (arma_prune_market_requests); its count is added to the result.
  const pruneEngages = async () => (Number(await call("arma_prune_engages", [])) || 0) + (Number(await call("arma_prune_market_requests", [])) || 0);
  return { server, stats: () => ({ ...counts }), pruneEngages };
}
