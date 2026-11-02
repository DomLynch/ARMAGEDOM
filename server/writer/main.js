// node server/writer/main.js: the writer service. OFF unless ARMA_WRITER=1, so nothing listens by accident (a kill flag, as in Origins).
// Binds 127.0.0.1:8891 (Frankendom uses 8787, 8788 and 8793; this is distinct). Keys come from the environment, never from the repo:
//   DATABASE_URL        the Postgres connection string for the role arma_writer (Supabase pooler)
//   SUPABASE_URL        https://<ref>.supabase.co
//   SUPABASE_ANON_KEY   the publishable key, used only to ask /auth/v1/user who a token belongs to
//   ARMA_INTERNAL_KEY   shared with the presence service for /internal/* (location, hits)
//   ARMA_SPAWNS         optional path to the spawn rows JSON (default server/data/spawns.json)
import fs from "node:fs";
import { poolConfig } from "./db-config.js";
import { createVerifier } from "../shared/supabase-verify.js";
import { createWriter, MAINTENANCE, spawnRowsFrom } from "./writer.js";

if (process.env.ARMA_WRITER !== "1") {
  console.log("writer: OFF (set ARMA_WRITER=1 to start); nothing is listening");
  process.exit(0);
}
const need = (name) => process.env[name] || (() => { throw new Error(`set ${name}`); })();
const host = process.env.WRITER_HOST ?? "127.0.0.1",
  port = Number(process.env.WRITER_PORT ?? 8891);
if (host !== "127.0.0.1" && process.env.ARMA_ALLOW_PUBLIC !== "1") throw new Error("the writer binds 127.0.0.1 only");

const { default: pg } = await import("pg");
const pool = new pg.Pool(poolConfig(need("DATABASE_URL"))); // pins Supabase's root CA with verification on (db-config.js)
const db = { query: async (sql, params) => (await pool.query(sql, params)).rows };
const url = need("SUPABASE_URL"),
  anon = need("SUPABASE_ANON_KEY");
const verify = createVerifier({ url, anon }); // cached 60 s by token hash; throws AuthUnavailable when Supabase Auth cannot answer (the writer then says 503)
const spawns = JSON.parse(fs.readFileSync(process.env.ARMA_SPAWNS ?? new URL("../data/spawns.json", import.meta.url), "utf8"));
const writer = createWriter({ db, verify, spawnRows: spawnRowsFrom(spawns), internalKey: need("ARMA_INTERNAL_KEY"), log: console.log });
writer.server.listen(port, host, () => console.log(`writer listening on ${host}:${port}`));
// Old spawn engages are deleted on a timer (migration 000016); a failure is logged and tried again next time, never fatal.
const prune = setInterval(() => writer.pruneEngages().then((n) => n && console.log(`writer: pruned ${n} old spawn engages`), (error) => console.log(`writer: prune failed: ${error?.message}`)), MAINTENANCE.pruneEngagesEveryMs);
prune.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(prune);
    writer.server.close(() => pool.end().then(() => process.exit(0)));
  });
