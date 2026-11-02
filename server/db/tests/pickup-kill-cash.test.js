// Kill-drop cash (migration 000018): a kill claim must be in its tier's range and is limited by rate, not by a per-source window.
import test from "node:test";
import assert from "node:assert/strict";
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
    db.exec(`update public.arma_kill_claims set claimed_at = claimed_at - interval '${seconds} seconds' where character = '${character}' and source = '${source}'`);
  return { db, alice, bob, claim, earned, age };
}

test("each tier pays amounts inside its range, and every kill is a separate credit (no per-source window)", async () => {
  const { alice, claim, earned } = await setup();
  assert.deepEqual(await claim(ids.alice, alice, "kill:trash", 7), { credited: 7, earned: 7, loot: [] });
  assert.deepEqual(await claim(ids.alice, alice, "kill:trash", 7), { credited: 7, earned: 14, loot: [] }, "a second rat right away pays too");
  assert.equal((await claim(ids.alice, alice, "kill:creature", 15)).credited, 15);
  assert.equal((await claim(ids.alice, alice, "kill:boss", 40)).credited, 40);
  assert.equal(await earned(alice), 69);
});

test("an amount outside the tier's range, fractional or missing credits nothing", async () => {
  const { alice, claim, earned } = await setup();
  for (const [source, amount] of [["kill:trash", 11], ["kill:trash", 0], ["kill:creature", 10], ["kill:creature", 21], ["kill:boss", 20], ["kill:boss", 41], ["kill:trash", 5.5], ["kill:trash", -3], ["kill:boss", 99999], ["kill:trash", null]])
    assert.deepEqual(await claim(ids.alice, alice, source, amount), { refused: "bad-amount" }, `${source} ${amount}`);
  assert.equal(await earned(alice), 0);
  assert.equal((await claim(ids.alice, alice, "kill:trash", 10)).credited, 10, "the range ends are payable");
  assert.equal((await claim(ids.alice, alice, "kill:trash", 1)).credited, 1);
});

test("the rate cap: bosses 3 per minute, refused with a retry time, paying again as the window slides", async () => {
  const { alice, claim, earned, age } = await setup();
  for (let i = 0; i < 3; i++) assert.equal((await claim(ids.alice, alice, "kill:boss", 30)).credited, 30);
  const over = await claim(ids.alice, alice, "kill:boss", 30);
  assert.equal(over.refused, "rate-limit");
  assert(over.retryS >= 1 && over.retryS <= 60);
  assert.equal(await earned(alice), 90);
  await age(alice, "kill:boss", 61);
  assert.equal((await claim(ids.alice, alice, "kill:boss", 30)).credited, 30, "the window has passed");
  assert.equal(await earned(alice), 120);
});

test("trash allows a crowd dying at once (30 a minute), then refuses; tiers have separate caps; characters are separate", async () => {
  const { alice, bob, claim, earned } = await setup();
  for (let i = 0; i < 30; i++) assert.equal((await claim(ids.alice, alice, "kill:trash", 10)).credited, 10, "kill " + i);
  assert.equal((await claim(ids.alice, alice, "kill:trash", 10)).refused, "rate-limit");
  assert.equal((await claim(ids.alice, alice, "kill:creature", 20)).credited, 20, "a full trash cap does not block creatures");
  assert.equal((await claim(ids.bob, bob, "kill:trash", 10)).credited, 10, "Bob's own cap");
  assert.equal(await earned(alice), 320);
});

test("the stash and airdrop rules are unchanged, unknown sources are still refused, and a kill claim raises the cash ceiling", async () => {
  const { db, alice, claim, earned } = await setup();
  assert.equal((await claim(ids.alice, alice, "stash:east-3", 999)).credited, 180);
  assert.equal((await claim(ids.alice, alice, "stash:east-3", 180)).refused, "too-soon");
  assert.equal((await claim(ids.alice, alice, "airdrop", 150)).credited, 150);
  assert.equal((await claim(ids.alice, alice, "kill:wizard", 10)).refused, "unknown-source");
  await claim(ids.alice, alice, "kill:boss", 25);
  assert.equal(await earned(alice), 355);
  assert.equal(Number((await call(db, "select public.arma_cash_ceiling($1) as c", [alice]))[0].c), 355);
});

test("only the account's own open character can claim a kill, and clients cannot read or call any of it", async () => {
  const { db, alice } = await setup();
  assert.match((await failure(call(db, "select public.arma_claim_pickup($1, $2, 'kill:trash', 5)", [ids.bob, alice])))?.message ?? "NO ERROR", /not open for this character/);
  for (const sql of ["select public.arma_claim_pickup(auth.uid(), 'x', 'kill:trash', 5)", "select * from public.arma_kill_tiers", "select * from public.arma_kill_claims"])
    assert.match((await as(db, "authenticated", ids.alice, () => failure(call(db, sql))))?.message ?? "NO ERROR", /permission denied/, sql);
});

test("the seeded tiers are Dom's ranges: $1-10 trash, $11-20 creature, $21-40 boss", async () => {
  const { db } = await setup();
  const rows = Object.fromEntries((await call(db, "select source, min_cash, max_cash from public.arma_kill_tiers")).map((r) => [r.source, [r.min_cash, r.max_cash]]));
  assert.deepEqual(rows, { "kill:trash": [1, 10], "kill:creature": [11, 20], "kill:boss": [21, 40] });
});
