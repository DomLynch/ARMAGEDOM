import test from "node:test";
import assert from "node:assert/strict";
import { call, freshDb, ids } from "./helpers.js";

// Five engages around the keep window (a day): only the ones that can no longer be used AND are older than it are deleted.
test("arma_prune_engages deletes used or expired engages older than engage_keep_s and leaves everything else", async () => {
  const db = await freshDb();
  await db.exec("insert into public.arma_spawns (instance, kind, area, max_hp, hp) values ('wolf-1', 'wolf', 'east', 40, 40), ('wolf-2', 'wolf', 'east', 40, 40), ('wolf-3', 'wolf', 'east', 40, 40)");
  const row = (token, instance, issued, expires, used) =>
    `insert into public.arma_spawn_engages (token, account, character, instance, generation, issued_at, expires_at, used_at, result) values ('${token}', '${ids.alice}', 'pc:a', '${instance}', 1, now() - interval '${issued}', now() - interval '${expires}', ${used ? `now() - interval '${used}'` : "null"}, ${used ? "'expired'" : "null"})`;
  await db.exec(
    [
      row("old-used-token-0000001", "wolf-1", "3 days", "3 days", "2 days"), // used two days ago: deleted
      row("old-expired-token-00002", "wolf-2", "3 days", "2 days", null), // never used, expired two days ago: deleted
      row("recent-used-token-00003", "wolf-3", "2 hours", "1 hour", "1 hour"), // used an hour ago: kept
      row("recent-expired-token-004", "wolf-1", "2 hours", "1 hour", null), // expired an hour ago, unused: kept
      row("open-live-token-0000005", "wolf-3", "10 seconds", "-100 seconds", null), // still open and unexpired: kept
    ].join(";\n"),
  );
  assert.equal((await call(db, "select public.arma_prune_engages() as n"))[0].n, 2);
  const left = (await call(db, "select token from public.arma_spawn_engages order by token")).map((r) => r.token);
  assert.deepEqual(left, ["open-live-token-0000005", "recent-expired-token-004", "recent-used-token-00003"]);
  assert.equal((await call(db, "select public.arma_prune_engages() as n"))[0].n, 0, "a second run deletes nothing");
  // A keep window under an hour (or no row) deletes nothing at all.
  await db.exec("update public.arma_config set value = '60'::jsonb where key = 'engage_keep_s'");
  assert.equal((await call(db, "select public.arma_prune_engages() as n"))[0].n, 0);
});
