import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { KILL_DROPS } from "../src/engine/kill-drops.js";

// The tiers and ranges in data/killDrops.json must equal the rows migration 000018 seeds into arma_kill_tiers (the server refuses a claim
// outside its tier's range, so a drift would silently drop cash). The migration lives in the server PR; until it is in this tree the
// test skips, and it runs by itself as soon as the file arrives.
const dir = new URL("../../supabase/migrations/", import.meta.url);
const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => /000018_arma_kill_cash\.sql$/.test(n)) : undefined;
test("killDrops.json tiers and ranges match arma_kill_tiers in migration 000018", { skip: file ? false : "migration 000018 is not in this tree yet" }, () => {
  const sql = fs.readFileSync(new URL(file, dir), "utf8"),
    rows = [...sql.matchAll(/\('(kill:[a-z]+)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g)].map((m) => ({ source: m[1], min: +m[2], max: +m[3] }));
  assert.equal(rows.length, Object.keys(KILL_DROPS.tiers).length, "the migration seeds one row per tier");
  for (const tier of Object.values(KILL_DROPS.tiers)) {
    const row = rows.find((r) => r.source === tier.source);
    assert.ok(row, `${tier.source} is seeded`);
    assert.deepEqual({ min: tier.min, max: tier.max }, { min: row.min, max: row.max }, tier.source);
  }
});
