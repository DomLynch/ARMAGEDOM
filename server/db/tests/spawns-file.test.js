// The generated server/data/spawns.json against the real migrations: every row passes the database's own checks when engaged, every loot rule names a real
// spawn instance, and the writer's lookup treats names like "constructor" as unknown. (The generator and the drift guard live in Web/tests/arma-spawns-seed.test.js.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { call, freshDb, ids, openFor } from "./helpers.js";
import { spawnRowsFrom } from "../../writer/writer.js";

const spawns = JSON.parse(fs.readFileSync(new URL("../../data/spawns.json", import.meta.url), "utf8"));

test("every generated spawn row can be engaged (kind, area and hp pass the database's checks) and a second engage of the same row agrees", async () => {
  const db = await freshDb();
  await openFor(db, ids.alice);
  const [{ id }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  let n = 0;
  for (const [instance, row] of Object.entries(spawns)) {
    const token = `token-spawn-${++n}-aaaaaaaaaaaaaaaa`;
    const engaged = (await call(db, "select public.arma_spawn_engage($1, $2, $3, $4, $5, $6, $7) as r", [ids.alice, id, token, instance, row.kind, row.area, row.maxHp]))[0].r;
    assert.equal(engaged.maxHp, row.maxHp, instance);
    await db.exec("update public.arma_spawn_engages set used_at = now()"); // keep under the open-engage cap
  }
  assert.equal((await call(db, "select count(*)::int as n from public.arma_spawns"))[0].n, Object.keys(spawns).length);
});

test("every loot rule names a real spawn instance (the drop can be earned), and the writer's lookup knows the file's rows", async () => {
  const db = await freshDb();
  const rules = await call(db, "select distinct kind from public.arma_loot_rules");
  assert.ok(rules.length >= 8);
  for (const { kind } of rules) assert.ok(spawns[kind], `${kind} has loot but no spawn row, so nobody can ever engage it`);
  const rowOf = spawnRowsFrom(spawns);
  assert.deepEqual(rowOf("east:east-roamer-2"), spawns["east:east-roamer-2"]);
  for (const name of ["constructor", "__proto__", "toString", "ghost:placement"]) assert.equal(rowOf(name), null, name);
});
