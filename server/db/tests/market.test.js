// Market (migrations 000024 + 000025): items, inventory, server-rolled loot, the NPC shop, buy/sell with replay, and the cash ceiling. Real migrations on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { as, call, failure, freshDb, ids, openFor } from "./helpers.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice, ids.bob);
  const [{ id: alice }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  const [{ id: bob }] = await call(db, "select public.arma_create_character($1, 'Bob') as id", [ids.bob]);
  const q = async (sql, params) => (await call(db, sql, params))[0].r;
  const kill = (account, character, source, amount, enemy, killId) => q("select public.arma_claim_pickup($1, $2, $3, $4, $5, $6) as r", [account, character, source, amount, enemy ?? null, killId ?? null]);
  const buy = (account, character, item, qty, req, shop = "hub-trader") => q("select public.arma_buy_item($1, $2, $3, $4, $5, $6) as r", [account, character, shop, item, qty, req]);
  const sell = (account, character, item, qty, req, shop = "hub-trader") => q("select public.arma_sell_item($1, $2, $3, $4, $5, $6) as r", [account, character, shop, item, qty, req]);
  const inv = (account, character) => q("select public.arma_inventory_get($1, $2) as r", [account, character]);
  const stock = (account, shop = "hub-trader") => q("select public.arma_market_stock($1, $2) as r", [account, shop]);
  const cash = async (character) => (await call(db, "select earned, spent from public.arma_cash where character = $1", [character]))[0] ?? { earned: 0, spent: 0 };
  const ceiling = async (character) => Number((await call(db, "select public.arma_cash_ceiling($1) as c", [character]))[0].c);
  const earn = (character, n) => db.exec(`insert into public.arma_cash (character, earned) values ('${character}', ${n}) on conflict (character) do update set earned = public.arma_cash.earned + ${n}`);
  const save = (account, character, rev, seq, carried, bank = 0) =>
    q("select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [account, character, JSON.stringify({ ...v18, marked: { ...v18.marked, carried, bank } }), rev, seq]);
  return { db, alice, bob, kill, buy, sell, inv, stock, cash, ceiling, earn, save };
}
const qty = (list, id) => list.find((x) => x.item_id === id)?.qty ?? 0;

test("the seeded catalogue: six rare parts, three shop consumables, no item sells for more than it costs", async () => {
  const { db } = await setup();
  const items = await call(db, "select id, kind, base_price, sell_price from public.arma_items order by id");
  assert.deepEqual(items.filter((i) => i.kind === "part").map((i) => i.id), ["drone-chip", "hunter-cpu", "military-battery", "roach-mandibles", "robot-parts", "salamander-gland"]);
  assert.deepEqual(items.filter((i) => i.kind === "consumable").map((i) => i.id), ["ammo-pack", "medkit-pack", "vest-patch"]);
  assert.ok(items.every((i) => i.sell_price <= i.base_price));
  const enemies = (await call(db, "select distinct enemy from public.arma_loot_table")).map((r) => r.enemy);
  assert.ok(enemies.every((e) => !["original-rat", "hollow-scavenger", "original-dog"].includes(e)), "rare creatures and bosses only");
});

test("guests (anonymous sessions) can hold loot but cannot trade; the wallet and the catalogue answer", async () => {
  const { db, alice, buy, sell, earn, inv } = await setup();
  await earn(alice, 500);
  assert.equal((await buy(ids.alice, alice, "ammo-pack", 1, "gst-aaaa-0001")).ok, true);
  await db.exec(`update auth.users set is_anonymous = true where id = '${ids.alice}'`);
  assert.deepEqual(await buy(ids.alice, alice, "ammo-pack", 1, "gst-aaaa-0002"), { ok: false, error: "guest" });
  assert.deepEqual(await sell(ids.alice, alice, "ammo-pack", 1, "gst-aaaa-0003"), { ok: false, error: "guest" });
  assert.deepEqual(await inv(ids.alice, alice), [{ item_id: "ammo-pack", qty: 1 }]);
  const defs = (await call(db, "select public.arma_item_defs($1) as r", [ids.alice]))[0].r;
  assert.equal(defs.length, 9);
  const wallet = (await call(db, "select public.arma_wallet($1, $2) as r", [ids.alice, alice]))[0].r;
  assert.deepEqual(wallet, { cash: 0, bank: 0, ceiling: 440 });
});

test("loot is rolled by the server on a credited kill and returned with the cash; the client names no item", async () => {
  const { db, alice, kill, inv } = await setup();
  await db.exec("update public.arma_loot_table set chance = 1 where enemy = 'boss-warden'");
  const r = await kill(ids.alice, alice, "kill:boss", 30, "boss-warden");
  assert.deepEqual([r.credited, r.earned], [30, 30]);
  assert.deepEqual(r.loot, [{ item_id: "hunter-cpu", qty: 1 }]);
  assert.deepEqual(await inv(ids.alice, alice), [{ item_id: "hunter-cpu", qty: 1 }]);
  assert.deepEqual((await kill(ids.alice, alice, "kill:trash", 5, null)).loot, [], "no enemy, no roll");
  assert.deepEqual((await kill(ids.alice, alice, "kill:creature", 15, "original-dog")).loot, [], "an enemy with no table row drops nothing");
  // the zero-chance world: nothing drops
  await db.exec("update public.arma_loot_table set chance = 0.000001");
  let drops = 0;
  for (let i = 0; i < 20; i++) drops += (await kill(ids.alice, alice, "kill:boss", 25, "boss-warden")).loot?.length ?? 0;
  assert.ok(drops <= 1);
});

test("a refused kill (bad amount, rate cap) rolls no loot; a stash claim carries no loot key", async () => {
  const { db, alice, kill, inv } = await setup();
  await db.exec("update public.arma_loot_table set chance = 1");
  assert.deepEqual(await kill(ids.alice, alice, "kill:boss", 5, "boss-warden"), { refused: "bad-amount" });
  for (let i = 0; i < 3; i++) await kill(ids.alice, alice, "kill:boss", 30, "boss-warden");
  assert.equal((await kill(ids.alice, alice, "kill:boss", 30, "boss-warden")).refused, "rate-limit");
  assert.equal(qty(await inv(ids.alice, alice), "hunter-cpu"), 3);
  assert.equal("loot" in (await kill(ids.alice, alice, "stash:east-3", 180)), false);
});

test("a retried kill (same killId) is a replay: no second credit, no second drop, no extra rate use", async () => {
  const { db, alice, kill, inv, cash } = await setup();
  await db.exec("update public.arma_loot_table set chance = 1 where enemy = 'boss-warden'");
  const first = await kill(ids.alice, alice, "kill:boss", 30, "boss-warden", "kill-aaaa-0001");
  const again = await kill(ids.alice, alice, "kill:boss", 30, "boss-warden", "kill-aaaa-0001");
  assert.deepEqual(again, { ...first, replayed: true });
  assert.equal(qty(await inv(ids.alice, alice), "hunter-cpu"), 1);
  assert.equal((await cash(alice)).earned, 30);
  assert.equal((await db.query("select count(*)::int as n from public.arma_kill_claims")).rows[0].n, 1);
  assert.deepEqual(await kill(ids.alice, alice, "kill:boss", 40, "boss-warden", "kill-aaaa-0001"), { refused: "request-conflict" });
});

test("buy: debits cash, adds inventory, answers the contract shape, and the cash ceiling falls with it", async () => {
  const { alice, buy, earn, inv, ceiling, cash, save } = await setup();
  await earn(alice, 500);
  await save(ids.alice, alice, 0, 1, 500);
  const r = await buy(ids.alice, alice, "medkit-pack", 2, "buy-aaaa-0001");
  assert.deepEqual([r.ok, r.replayed, r.delta, r.cash, r.ceiling], [true, false, -240, 260, 260]);
  assert.deepEqual(r.inventory, [{ item_id: "medkit-pack", qty: 2 }]);
  assert.deepEqual(await inv(ids.alice, alice), r.inventory);
  assert.equal((await cash(alice)).spent, 240);
  assert.equal(await ceiling(alice), 260);
  // the phone saves its OLD richer record: clamped to the lower ceiling, not stored as sent
  const s = await save(ids.alice, alice, 1, 2, 500);
  assert.deepEqual([s.clamped, s.carried], [true, 260]);
});

test("buy refusals: not enough cash, not for sale, unknown shop/item, bad qty or request id; nothing changes", async () => {
  const { alice, buy, earn, inv, cash } = await setup();
  await earn(alice, 100);
  assert.deepEqual(await buy(ids.alice, alice, "medkit-pack", 1, "buy-aaaa-0002"), { ok: false, error: "insufficient-cash", ceiling: 100 });
  assert.equal((await buy(ids.alice, alice, "hunter-cpu", 1, "buy-aaaa-0003")).error, "not-for-sale", "loot parts are sell-only");
  assert.equal((await buy(ids.alice, alice, "nonesuch", 1, "buy-aaaa-0004")).error, "not-for-sale");
  assert.equal((await buy(ids.alice, alice, "ammo-pack", 1, "buy-aaaa-0005", "no-such-shop")).error, "not-for-sale");
  for (const [n, id] of [[0, "buy-aaaa-0006"], [100, "buy-aaaa-0007"], [-1, "buy-aaaa-0008"], [1, "short"], [1, null]]) assert.equal((await buy(ids.alice, alice, "ammo-pack", n, id)).error, "bad-request", `${n} ${id}`);
  assert.deepEqual(await inv(ids.alice, alice), []);
  assert.equal((await cash(alice)).spent, 0);
  assert.equal((await buy(ids.alice, alice, "ammo-pack", 1, "buy-aaaa-0002")).ok, true, "a refused request id is not burned");
});

test("sell: removes inventory, credits cash as a server-earned credit that raises the ceiling; cannot sell what you do not hold", async () => {
  const { db, alice, sell, kill, inv, ceiling, cash } = await setup();
  await db.exec("update public.arma_loot_table set chance = 1 where enemy = 'boss-warden'");
  await kill(ids.alice, alice, "kill:boss", 30, "boss-warden");
  await kill(ids.alice, alice, "kill:boss", 30, "boss-warden");
  assert.equal(await ceiling(alice), 60);
  assert.equal((await sell(ids.alice, alice, "hunter-cpu", 3, "sel-aaaa-0001")).error, "insufficient-qty");
  const r = await sell(ids.alice, alice, "hunter-cpu", 1, "sel-aaaa-0002");
  assert.deepEqual([r.ok, r.delta, r.replayed], [true, 150, false]);
  assert.deepEqual(r.inventory, [{ item_id: "hunter-cpu", qty: 1 }]);
  assert.equal((await cash(alice)).earned, 210);
  assert.equal(await ceiling(alice), 210);
  assert.equal((await sell(ids.alice, alice, "hunter-cpu", 1, "sel-aaaa-0003")).ok, true);
  assert.deepEqual(await inv(ids.alice, alice), [], "the empty stack is removed");
  assert.equal((await sell(ids.alice, alice, "ammo-pack", 1, "sel-aaaa-0004")).error, "insufficient-qty");
  assert.equal((await sell(ids.alice, alice, "hunter-cpu", 1, "sel-aaaa-0005", "no-such-shop")).error, "not-bought");
});

test("replay: the same request id answers the first answer with replayed true and never moves cash or stock twice", async () => {
  const { alice, buy, sell, earn, inv, cash } = await setup();
  await earn(alice, 1000);
  const first = await buy(ids.alice, alice, "vest-patch", 1, "rep-aaaa-0001");
  const again = await buy(ids.alice, alice, "vest-patch", 1, "rep-aaaa-0001");
  assert.deepEqual(again, { ...first, replayed: true });
  assert.equal(qty(await inv(ids.alice, alice), "vest-patch"), 1);
  assert.equal((await cash(alice)).spent, 250);
  assert.equal((await buy(ids.alice, alice, "vest-patch", 2, "rep-aaaa-0001")).error, "request-conflict", "same id, different request");
  assert.equal((await sell(ids.alice, alice, "vest-patch", 1, "rep-aaaa-0001")).error, "request-conflict", "same id, different op");
  const s1 = await sell(ids.alice, alice, "vest-patch", 1, "rep-aaaa-0002");
  assert.deepEqual(await sell(ids.alice, alice, "vest-patch", 1, "rep-aaaa-0002"), { ...s1, replayed: true });
  assert.equal(qty(await inv(ids.alice, alice), "vest-patch"), 0, "the second sell did not remove anything");
});

test("no cash loop: buy then sell always loses money, a shop row cannot price a sell above any buy, and the ceiling never rises from trading", async () => {
  const { db, alice, buy, sell, earn, ceiling } = await setup();
  await earn(alice, 5000);
  const start = await ceiling(alice);
  for (let i = 0; i < 5; i++) {
    assert.equal((await buy(ids.alice, alice, "ammo-pack", 10, `loop-b-${i}-aaaa`)).ok, true);
    assert.equal((await sell(ids.alice, alice, "ammo-pack", 10, `loop-s-${i}-aaaa`)).ok, true);
  }
  assert.equal(await ceiling(alice), start - 5 * 400);
  assert.match((await failure(db.exec("insert into public.arma_shop_stock (shop_id, item_id, buy_price, sell_price) values ('other', 'ammo-pack', null, 61)")))?.message ?? "NO ERROR", /mint cash/);
  assert.match((await failure(db.exec("insert into public.arma_shop_stock (shop_id, item_id, buy_price, sell_price) values ('other', 'ammo-pack', 10, 20)")))?.message ?? "NO ERROR", /check|violates/);
  const fund = await ceiling(alice);
  assert.equal((await buy(ids.alice, alice, "vest-patch", 99, "loop-big-aaaa")).error, "insufficient-cash");
  assert.equal(await ceiling(alice), fund);
});

test("the stored run record follows: buy takes carried first then bank, sell adds to carried; no run record is fine", async () => {
  const { alice, buy, sell, earn, save } = await setup();
  await earn(alice, 1000);
  await save(ids.alice, alice, 0, 1, 100, 400);
  const b = await buy(ids.alice, alice, "medkit-pack", 2, "run-aaaa-0001");
  assert.deepEqual([b.cash, b.bank], [0, 260]);
  const s = await sell(ids.alice, alice, "medkit-pack", 1, "run-aaaa-0002");
  assert.deepEqual([s.cash, s.bank], [40, 260]);
  const { buy: buy2, earn: earn2, alice: a2 } = await setup(); // a fresh character with earnings but no saved run
  await earn2(a2, 300);
  assert.deepEqual([(await buy2(ids.alice, a2, "ammo-pack", 1, "run-aaaa-0003")).ok], [true]);
});

test("the stock list is the same for two users, follows the UTC day for rotating rows, and is the same on the next call (no depletion)", async () => {
  const { db, alice, bob, stock, buy, earn } = await setup();
  const a = await stock(ids.alice);
  assert.deepEqual(a, await stock(ids.bob));
  assert.deepEqual(a.find((r) => r.item_id === "medkit-pack"), { item_id: "medkit-pack", name: "Medkit Pack", buy_price: 120, sell_price: 40 });
  assert.deepEqual(a.find((r) => r.item_id === "hunter-cpu"), { item_id: "hunter-cpu", name: "Hunter CPU", buy_price: null, sell_price: 150 });
  await earn(alice, 5000);
  await earn(bob, 5000);
  for (let i = 0; i < 20; i++) await buy(ids.alice, alice, "ammo-pack", 1, `dep-a-${i}-aaaaa`);
  await buy(ids.bob, bob, "ammo-pack", 99, "dep-b-aaaaaaa");
  assert.deepEqual(await stock(ids.bob), a, "other buyers never change the list");
  await db.exec("update public.arma_shop_stock set active_day = ((extract(dow from now() at time zone 'utc')::int + 1) % 7) where item_id = 'vest-patch' and shop_id = 'hub-trader'");
  assert.equal((await stock(ids.alice)).some((r) => r.item_id === "vest-patch"), false, "a row for another day is not on today's list");
  assert.deepEqual(await stock(ids.alice, "no-such-shop"), []);
});

test("isolation: inventory is private, nobody writes it directly, and a stranger cannot trade for a character", async () => {
  const { db, alice, bob, buy, earn, inv } = await setup();
  await earn(alice, 500);
  await buy(ids.alice, alice, "ammo-pack", 1, "iso-aaaa-0001");
  assert.deepEqual(await inv(ids.bob, bob), []);
  assert.match((await failure(inv(ids.bob, alice)))?.message ?? "NO ERROR", /not open for this character/);
  assert.match((await failure(buy(ids.bob, alice, "ammo-pack", 1, "iso-aaaa-0002")))?.message ?? "NO ERROR", /not open for this character/);
  // RLS: alice reads her own row, bob reads none of hers; neither can write
  const read = (user) => as(db, "authenticated", user, () => call(db, "select character, item_id, qty from public.arma_inventory"));
  assert.equal((await read(ids.alice)).length, 1);
  assert.equal((await read(ids.bob)).length, 0);
  for (const sql of [
    `insert into public.arma_inventory (character, item_id, qty) values ('${alice}', 'hunter-cpu', 99)`,
    `update public.arma_inventory set qty = 9999`,
    `delete from public.arma_inventory`,
    `update public.arma_items set sell_price = 1`,
    `insert into public.arma_shop_stock (shop_id, item_id, buy_price, sell_price) values ('x', 'ammo-pack', 5, 1)`,
    `select * from public.arma_loot_table`,
    `select * from public.arma_market_requests`,
    `select public.arma_buy_item(auth.uid(), '${alice}', 'hub-trader', 'ammo-pack', 1, 'direct-aaaa-1')`,
    `select public.arma_inventory_add('${alice}', 'hunter-cpu', 50)`,
    `select public.arma_roll_loot('${alice}', 'kill:boss', 'boss-warden')`,
    `select public.arma_claim_pickup(auth.uid(), '${alice}', 'kill:boss', 30, 'boss-warden', null)`,
  ])
    assert.match((await as(db, "authenticated", ids.alice, () => failure(call(db, sql))))?.message ?? "NO ERROR", /permission denied|row-level security/, sql);
  assert.deepEqual(await inv(ids.alice, alice), [{ item_id: "ammo-pack", qty: 1 }], "nothing changed");
});

test("the old four-argument kill credit call still works unchanged for stashes and kills", async () => {
  const { db, alice } = await setup();
  const r = (await call(db, "select public.arma_claim_pickup($1, $2, 'kill:trash', 5) as r", [ids.alice, alice]))[0].r;
  assert.deepEqual([r.credited, r.earned, r.loot], [5, 5, []]);
});
