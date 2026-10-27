// Stash and airdrop cash is credited once per source per real-time window (migration 000017), so a page reload cannot farm it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { as, call, failure, freshDb, ids, openFor } from "./helpers.js";

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice);
  await openFor(db, ids.bob);
  const [{ id: alice }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  const [{ id: bob }] = await call(db, "select public.arma_create_character($1, 'Bob') as id", [ids.bob]);
  const claim = async (account, character, source, amount) => (await call(db, "select public.arma_claim_pickup($1, $2, $3, $4) as r", [account, character, source, amount]))[0].r;
  const earned = async (character) => (await call(db, "select coalesce((select earned from public.arma_cash where character = $1), 0) as n", [character]))[0].n;
  const age = (character, source, seconds) =>
    db.exec(`update public.arma_pickup_claims set claimed_at = claimed_at - interval '${seconds} seconds' where character = '${character}' and source = '${source}'`);
  return { db, alice, bob, claim, earned, age };
}

test("a stash pays once; claiming it again (a reload) credits nothing until its window has passed", async () => {
  const { alice, claim, earned, age } = await setup();
  assert.deepEqual(await claim(ids.alice, alice, "stash:east-3", 120), { credited: 120, earned: 120 });
  const again = await claim(ids.alice, alice, "stash:east-3", 120);
  assert.equal(again.refused, "too-soon");
  assert(again.retryS > 0 && again.retryS <= 180);
  assert.equal(await earned(alice), 120, "the reload credited nothing");
  await age(alice, "stash:east-3", 181);
  assert.equal((await claim(ids.alice, alice, "stash:east-3", 60)).credited, 60, "after the respawn window it pays again");
  assert.equal(await earned(alice), 180);
});

test("each source has its own window, and the airdrop is one more source", async () => {
  const { alice, claim, earned } = await setup();
  assert.equal((await claim(ids.alice, alice, "stash:east-3", 180)).credited, 180);
  assert.equal((await claim(ids.alice, alice, "stash:south-3", 180)).credited, 180);
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).credited, 150);
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).refused, "too-soon");
  assert.equal(await earned(alice), 510);
});

test("the airdrop interval: refused inside its 60 s window, pays again once it has passed", async () => {
  const { alice, claim, earned, age } = await setup();
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).credited, 150);
  await age(alice, "airdrop", 59);
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).refused, "too-soon");
  await age(alice, "airdrop", 2);
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).credited, 150);
  assert.equal(await earned(alice), 300);
});

test("the client's amount is only a claim: clamped to the rule, never negative, and an unknown source is refused", async () => {
  const { alice, claim, earned } = await setup();
  assert.equal((await claim(ids.alice, alice, "stash:east-3", 99999)).credited, 180, "over the rule pays the rule");
  assert.equal((await claim(ids.alice, alice, "airdrop", -50)).credited, 0, "negative pays nothing");
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).refused, "too-soon", "even a zero claim uses the window");
  assert.equal((await claim(ids.alice, alice, "stash:invented-99", 60)).refused, "unknown-source");
  assert.equal(await earned(alice), 180);
});

test("windows are per character, and only the account's own open character can claim", async () => {
  const { db, alice, bob, claim, earned } = await setup();
  assert.equal((await claim(ids.alice, alice, "stash:east-3", 180)).credited, 180);
  assert.equal((await claim(ids.bob, bob, "stash:east-3", 180)).credited, 180, "Bob's own window");
  assert.match((await failure(call(db, "select public.arma_claim_pickup($1, $2, 'airdrop', 150)", [ids.bob, alice])))?.message ?? "NO ERROR", /not open for this character/);
  assert.equal(await earned(alice), 180);
});

test("the claim raises the cash ceiling a save is clamped to, and clients cannot call or read any of it", async () => {
  const { db, alice, claim } = await setup();
  assert.equal(Number((await call(db, "select public.arma_cash_ceiling($1) as c", [alice]))[0].c), 0);
  await claim(ids.alice, alice, "airdrop", 150);
  assert.equal(Number((await call(db, "select public.arma_cash_ceiling($1) as c", [alice]))[0].c), 150);
  for (const sql of ["select public.arma_claim_pickup(auth.uid(), 'x', 'airdrop', 1)", "select * from public.arma_pickup_rules", "select * from public.arma_pickup_claims"])
    assert.match((await as(db, "authenticated", ids.alice, () => failure(call(db, sql))))?.message ?? "NO ERROR", /permission denied/, sql);
});

test("the seeded rules match the game's own data: every cash stash placement, the airdrop cash and the shortest airdrop gap", async () => {
  const { db } = await setup();
  const read = (path) => JSON.parse(fs.readFileSync(new URL("../../../Web/src/data/" + path, import.meta.url), "utf8"));
  const pickups = read("worldPickups.json"),
    airdrop = read("airdrop.json");
  const rows = Object.fromEntries((await call(db, "select source, kind, cash, window_s from public.arma_pickup_rules")).map((r) => [r.source, r]));
  const stashes = Object.values(pickups.placements).flat().filter((p) => p.type === "cashStash");
  assert.equal(Object.values(rows).filter((r) => r.kind === "stash").length, stashes.length, "one row per stash placement");
  for (const p of stashes) assert.deepEqual([rows["stash:" + p.id]?.cash, rows["stash:" + p.id]?.window_s], [pickups.items.cashStash.max, pickups.respawnSeconds], p.id);
  assert.equal(rows.airdrop.cash, airdrop.loot.bundle.find((r) => r.id === "cash").amount);
  assert.equal(rows.airdrop.window_s, airdrop.schedule.firstDelayMin);
});
