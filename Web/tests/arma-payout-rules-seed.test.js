// The database's seeded kill payouts (arma_payout_rules) must be what the game's own tables say: every spawn kind, bosses at marked.bossCash,
// everything else at marked.cashPerKill. Drift guard like arma-weapon-rules-seed.test.js: when the game's rates or its creature kinds change,
// this fails until a seed migration is generated (node server/data/generate-payout-seed.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedPayoutRows } from "../../server/data/world-rows.js";
import { worldSpawnRows } from "../src/engine/world-events.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));

/** The rows the migrations leave in arma_payout_rules: every migration that inserts them, in file order, a later one overriding an earlier. */
function migratedPayouts() {
  const rules = new Map();
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(new URL(file, migrations), "utf8");
    const block = /insert into public\.arma_payout_rules[^;]*;/.exec(sql)?.[0];
    if (block) for (const [, kind, cash] of block.matchAll(/\('([a-z0-9._:-]+)',\s*(\d+)\)/g)) rules.set(kind, Number(cash));
  }
  return rules;
}

test("the seeded payouts equal the game's tables: every spawn kind, bosses at bossCash, the rest at cashPerKill", () => {
  const spawns = [...worldSpawnRows(content, "A"), ...worldSpawnRows(content, "B")];
  const bossKinds = new Set(Object.values(content.bossData.profiles).map((profile) => profile.modelRef));
  const expected = seedPayoutRows(spawns, bossKinds, content.markedData);
  const seeded = migratedPayouts();
  assert.deepEqual([...seeded.keys()].sort(), expected.map(([kind]) => kind).sort(), "a new creature kind needs a payout row: generate the next seed migration");
  for (const [kind, cash] of expected) assert.equal(seeded.get(kind), cash, `${kind}: generate the next seed migration`);
});

test("pinned example: a boss pays 200 and a creature 100, and nothing pays a bounty", () => {
  const seeded = migratedPayouts();
  assert.equal(seeded.get("boss-warden"), 200);
  assert.equal(seeded.get("original-rat"), 100);
});

test("seedPayoutRows refuses a gap instead of inventing a rate", () => {
  assert.throws(() => seedPayoutRows([{ kind: "a" }], new Set(), { cashPerKill: 1 }), /bossCash/);
  assert.throws(() => seedPayoutRows([], new Set(), { cashPerKill: 1, bossCash: 2 }), /no spawn rows/);
  assert.throws(() => seedPayoutRows([{ kind: "Bad Kind" }], new Set(), { cashPerKill: 1, bossCash: 2 }), /bad kind/);
  assert.deepEqual(seedPayoutRows([{ kind: "b" }, { kind: "a" }, { kind: "a" }], new Set(["b"]), { cashPerKill: 1, bossCash: 2 }), [["a", 1], ["b", 2]]);
});
