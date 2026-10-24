// The ARMAGEDOM writer (W1/W3): the one service that writes the database, as the low-privilege role `arma_writer`, and only by calling
// the SECURITY DEFINER functions in supabase/migrations. Modelled on Frankendom's Origins writer. It binds loopback; nginx (later) is the
// only public face. It performs no game rules of its own: the database is the referee.
//   client routes   POST /arma/<op>   Authorization: Bearer <Supabase access token>      (one request at a time per account)
//   internal routes POST /internal/<op>   x-arma-internal-key: <shared key>               (presence only: location and hit batches)
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

const MAX_BODY = 256 * 1024;
const STATUS = { O0007: 403, O0009: 409, O0002: 422, O0001: 200 };

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const same = (a, b) => {
  const x = Buffer.from(String(a ?? "")),
    y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * db.query(sql, params) -> rows (a pg Pool or any adapter); verify(token) -> account uuid or null;
 * spawnRows(instance) -> { kind, area, maxHp } from the world rows, or null (the phone never names these).
 */
export function createWriter({ db, verify, spawnRows, internalKey, log = () => {}, now = Date.now }) {
  const lanes = new Map(); // account -> promise chain: one request at a time per account
  const counts = { requests: 0, refused: {}, hitBatches: 0, hitRows: 0, locations: 0 };
  const refuse = (why) => (counts.refused[why] = (counts.refused[why] ?? 0) + 1);
  const call = async (fn, params) => {
    const marks = params.map((_, i) => `$${i + 1}`).join(", ");
    return (await db.query(`select public.${fn}(${marks}) as r`, params))[0]?.r;
  };

  const clientOps = {
    async create_character({ account, body }) {
      return { character: await call("arma_create_character", [account, String(body.name ?? "")]) };
    },
    async set_active({ account, body }) {
      return { ok: await call("arma_set_active", [account, String(body.character ?? "")]) };
    },
    async load_run({ account, body }) {
      return { run: await call("arma_load_run", [account, String(body.character ?? "")]) };
    },
    async save_run({ account, body }) {
      const { character, era, record, revision } = body;
      if (!Number.isInteger(era) || !Number.isInteger(revision) || typeof record !== "object" || record === null) throw new HttpError(400, "bad-request");
      return call("arma_save_run", [account, String(character ?? ""), era, JSON.stringify(record), revision]);
    },
    async spawn_state({ body }) {
      const instances = Array.isArray(body.instances) ? body.instances.filter((s) => typeof s === "string").slice(0, 200) : [];
      return call("arma_spawn_state", [instances]);
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
    // One presence tick of already-clamped hits; the database clamps again.
    async hits({ body }) {
      if (!Array.isArray(body.batch)) throw new HttpError(400, "bad-request");
      counts.hitBatches++;
      counts.hitRows += body.batch.length;
      return call("arma_spawn_hit_batch", [JSON.stringify(body.batch)]);
    },
  };

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, "too-large");
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
  const send = (res, status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(payload));
  };

  const server = http.createServer(async (req, res) => {
    counts.requests++;
    try {
      const url = new URL(req.url, "http://x"),
        [, area, op] = url.pathname.split("/");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, ...counts });
      if (req.method !== "POST") throw new HttpError(405, "method");
      if (area === "internal" && internalOps[op]) {
        if (!internalKey || !same(req.headers["x-arma-internal-key"], internalKey)) throw new HttpError(401, "key");
        return send(res, 200, await internalOps[op]({ body: await readJson(req) }));
      }
      if (area === "arma" && clientOps[op]) {
        const token = /^Bearer (.{10,4096})$/.exec(req.headers.authorization ?? "")?.[1];
        if (!token) throw new HttpError(401, "token");
        const account = await verify(token);
        if (!account) throw new HttpError(401, "token");
        const body = await readJson(req);
        return send(res, 200, await serialise(account, () => clientOps[op]({ account, body })));
      }
      throw new HttpError(404, "route");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : STATUS[error?.code] ?? 500;
      const code = error instanceof HttpError ? error.code : error?.code ?? "error";
      refuse(code);
      if (status === 500) log(`writer error: ${error?.message}`);
      send(res, status, { error: code });
    }
  });
  return { server, stats: () => ({ ...counts }) };
}
