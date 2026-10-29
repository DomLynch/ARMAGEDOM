// node --test ops/realtime/verify-hosted.test.mjs   (needs npm install in server/db for pglite)
// Runs ops/realtime/verify-hosted.sql, the script apply-migrations.sh runs on the hosted project, against a pglite with every migration
// applied: it must pass on the repo's own schema (with the switches open, as on the live project) and name each way the lock-down can break.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freshDb } from "../../server/db/tests/helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = fs.readFileSync(path.join(here, "verify-hosted.sql"), "utf8");

/** The verdict of verify-hosted.sql on a migrated database after `change`: null when it passes, else the exception message. */
async function verdict(change = async () => {}) {
  const db = await freshDb();
  await change(db);
  try {
    await db.exec(VERIFY);
    return null;
  } catch (error) {
    await db.exec("rollback").catch(() => {});
    return String(error.message);
  } finally {
    await db.close?.();
  }
}

test("the migrated schema passes, with the switches open as on the live project", async () => {
  assert.equal(await verdict(async (db) => {
    await db.exec(`update public.arma_config set value = 'true'::jsonb where key in ('arma_enabled', 'arma_open_access')`);
  }), null);
});

test("the migrated schema passes with the switches closed", async () => {
  assert.equal(await verdict(), null);
});

test("a switch row that is missing fails", async () => {
  assert.match(await verdict((db) => db.exec(`delete from public.arma_config where key = 'arma_open_access'`)), /config row arma_open_access is missing/);
});

test("a function the writer lost fails", async () => {
  assert.match(await verdict((db) => db.exec(`revoke execute on function public.arma_wallet(uuid, text) from arma_writer`)), /arma_writer cannot execute arma_wallet/);
});

test("a client that can call an internal helper fails", async () => {
  assert.match(await verdict((db) => db.exec(`grant execute on function public.arma_market_trade(uuid, text, text, text, text, int, text) to authenticated`)), /authenticated can execute arma_market_trade/);
});

test("a server role that can call an internal helper fails", async () => {
  assert.match(await verdict((db) => db.exec(`grant execute on function public.arma_roll_loot(text, text, text) to arma_writer`)), /arma_roll_loot/);
});

test("presence with a function outside its three fails", async () => {
  assert.match(await verdict((db) => db.exec(`grant execute on function public.arma_wallet(uuid, text) to arma_presence`)), /arma_presence can execute arma_wallet/);
});

test("a table without row level security fails", async () => {
  assert.match(await verdict((db) => db.exec(`alter table public.arma_inventory disable row level security`)), /RLS is off on arma_inventory/);
});

test("an API role with write access to an economy table fails", async () => {
  assert.match(await verdict((db) => db.exec(`grant insert on public.arma_cash to authenticated`)), /authenticated can write arma_cash/);
});
