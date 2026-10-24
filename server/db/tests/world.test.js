import test from "node:test";
import assert from "node:assert/strict";
import { call, failure, freshDb, ids, openFor } from "./helpers.js";

// A rat with 100 hp: weapon "knife" does at most 10 per hit and 4 hits a second (a 40 hp/s ceiling); "rifle" 30 per hit, 2 a second.
async function world() {
  const db = await freshDb();
  await openFor(db, ids.alice, ids.bob, ids.carol, ids.dave);
  const characters = {};
  for (const [name, account] of [["alice", ids.alice], ["bob", ids.bob], ["carol", ids.carol], ["dave", ids.dave]])
    characters[name] = (await call(db, "select public.arma_create_character($1, $2) as id", [account, name]))[0].id;
  await db.exec(`
    insert into public.arma_weapon_rules values ('knife', 10, 4), ('rifle', 30, 2);
    insert into public.arma_loot_rules values ('rat', 0, 'rat-tail', 1), ('rat', 1, 'rare-fang', 0.000001);`);
  return { db, characters };
}
const TOKEN = { alice: "tokenalice0000000000", bob: "tokenbob000000000000", carol: "tokencarol0000000000", dave: "tokendave0000000000" };
const engage = (db, who, instance = "rat-1", maxHp = 100, area = "westminster", token = TOKEN[who]) =>
  call(db, "select public.arma_spawn_engage($1, $2, $3, $4, 'rat', $5, $6) as r", [ids[who], db.chars[who], token, instance, area, maxHp]).then((r) => r[0].r);
const hit = (db, who, weapon, claimed, hits, respawn = 60) => call(db, "select public.arma_spawn_hit($1, $2, $3, $4, $5, $6) as r", [ids[who], TOKEN[who], weapon, claimed, hits, respawn]).then((r) => r[0].r);
// Pretend `seconds` of real time passed since this token's last accepted report.
const age = (db, who, seconds) => db.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '${seconds} seconds' where token = '${TOKEN[who]}' and used_at is null`);
async function ready() {
  const { db, characters } = await world();
  db.chars = characters;
  return db;
}

test("engage creates the spawn from the world row, is idempotent per account, and refuses a mismatching row", async () => {
  const db = await ready();
  const a = await engage(db, "alice");
  assert.deepEqual([a.hp, a.maxHp, a.generation], [100, 100, 0]);
  assert.equal((await engage(db, "alice")).token, a.token, "re-engaging returns the same token");
  assert.equal((await engage(db, "bob")).token, TOKEN.bob);
  assert.equal((await failure(call(db, "select public.arma_spawn_engage($1,$2,$3,'rat-1','rat','westminster',999)", [ids.carol, db.chars.carol, TOKEN.carol])))?.code, "O0002");
  assert.equal((await failure(call(db, "select public.arma_spawn_engage($1,$2,'tokenx000000000000','rat-9','rat','Bad Area',10)", [ids.carol, db.chars.carol])))?.message.includes("check constraint"), true);
  assert.equal((await failure(call(db, "select public.arma_spawn_engage($1,$2,$3,'rat-1','rat','westminster',100)", [ids.alice, db.chars.bob, "tokenzzzzzzzzzzzzzz"])))?.code, "O0007", "not your character");
  const state = (await call(db, "select public.arma_spawn_state($1, array['rat-1','never']) as r", [ids.alice]))[0].r;
  assert.deepEqual(state.spawns.map((s) => [s.instance, s.hp, s.alive]), [["rat-1", 100, true]]);
  // The read has the same access gate as every other client op: a signed-up account with no access row is refused.
  assert.equal((await failure(call(db, "select public.arma_spawn_state($1, array['rat-1'])", ["00000000-0000-4000-8000-0000000000ee"])))?.code, "O0007");
});

test("one server hp bar: two players' hits both land on the same creature", async () => {
  const db = await ready();
  await engage(db, "alice");
  await engage(db, "bob");
  await age(db, "alice", 1);
  await age(db, "bob", 1);
  assert.equal((await hit(db, "alice", "knife", 30, 3)).hp, 70);
  assert.equal((await hit(db, "bob", "knife", 20, 2)).hp, 50, "bob sees the bar alice already lowered");
  const state = (await call(db, "select public.arma_spawn_state($1, array['rat-1']) as r", [ids.alice]))[0].r.spawns[0];
  assert.equal(state.hp, 50);
});

test("a lying phone is clamped: inflated damage, inflated hit counts, rapid-fire reports and claimed kills change nothing they should not", async () => {
  const db = await ready();
  await engage(db, "alice");
  await age(db, "alice", 1);
  const huge = await hit(db, "alice", "knife", 1e9, 1000);
  assert.equal(huge.killed, false, "claiming a billion damage does not kill a 100 hp rat");
  assert(huge.applied > 39 && huge.applied < 51, `one second of knife: about 4 hits x 10 (plus the 25 percent jitter slack), got ${huge.applied}`);
  // Reports arriving back to back cover no real time, so they apply (almost) nothing, however large the claim.
  let after = huge;
  for (let i = 0; i < 20; i++) after = await hit(db, "alice", "knife", 1e6, 50);
  assert(after.hp >= 100 - huge.applied - 20 * 0.4, `rapid-fire reports should add almost nothing, hp is ${after.hp}`);
  assert.equal(after.killed, false);
  // A long silence does not bank damage: at most max_elapsed_s (5 s) of knife = 200 > hp, so cap by hp but never beyond the 5 s ceiling.
  await age(db, "alice", 3600);
  const banked = await hit(db, "alice", "knife", 1e9, 1e9);
  assert.equal(banked.applied <= 4 * 10 * 5 * 1.25 + 1e-9, true);
  // Unknown weapon is refused outright.
  assert.equal((await hit(db, "alice", "railgun", 5, 1)).refused, "weapon");
  // A negative claim is nothing, not healing.
  await engage(db, "bob", "rat-2");
  await age(db, "bob", 1);
  const neg = await call(db, "select public.arma_spawn_hit($1,$2,'knife',-50,3,60) as r", [ids.bob, TOKEN.bob]).catch(() => null);
  assert(neg === null || neg[0].r.applied === 0 || neg[0].r.refused !== undefined);
});

test("death and settle: shares come from applied damage, loot is minted once, deterministically, to those who earned it", async () => {
  const db = await ready();
  await engage(db, "alice");
  await engage(db, "bob");
  await engage(db, "carol");
  for (const who of ["alice", "bob", "carol"]) await age(db, who, 1);
  assert.equal((await hit(db, "alice", "knife", 40, 4)).hp, 60);
  await age(db, "bob", 1);
  assert.equal((await hit(db, "bob", "rifle", 30, 1)).hp, 30);
  await age(db, "carol", 1);
  assert.equal((await hit(db, "carol", "knife", 10, 1)).hp, 20, "carol did 10 of 100 = 10 percent");
  await age(db, "alice", 1);
  const kill = await hit(db, "alice", "knife", 40, 4);
  assert.deepEqual([kill.killed, kill.hp, kill.applied], [true, 0, 20], "the last hit is capped at the hp that was left");
  const loot = await call(db, "select account, item, mint_key from public.arma_loot order by account, item");
  assert.deepEqual(loot.map((l) => [l.account, l.item]), [[ids.alice, "rat-tail"], [ids.bob, "rat-tail"], [ids.carol, "rat-tail"]], "everyone with 5 percent or more was paid; 100 percent chance item for each");
  assert.deepEqual(loot.map((l) => l.mint_key).sort(), loot.map((l) => `kill:rat-1:0:${l.account}:0`).sort());
  const events = await call(db, "select account, payload->>'sharePct' as pct from public.arma_events where kind = 'kill' order by account");
  assert.deepEqual(events.map((e) => Number(e.pct)), [60, 30, 10]);
  // The settle cannot run twice: the creature is dead and a stale token is refused.
  assert.equal((await failure(call(db, "select public.arma_spawn_hit($1,$2,'knife',5,1,60)", [ids.bob, TOKEN.bob])))?.code, "O0009", "the token is closed after the death");
  assert.equal((await engage(db, "carol")).refused, "dead");
  assert.equal((await call(db, "select count(*)::int as n from public.arma_loot"))[0].n, 3, "no second payout");
});

test("a contributor below the minimum share is not paid, and there is no last-hit bonus", async () => {
  const db = await ready();
  await engage(db, "alice");
  await engage(db, "bob");
  await age(db, "alice", 1);
  await age(db, "bob", 1);
  await hit(db, "alice", "rifle", 60, 2); // 60 of 100... but hits_ok caps at 2 per second -> 60
  await age(db, "alice", 1);
  await hit(db, "alice", "knife", 35, 4);
  await hit(db, "bob", "knife", 2, 1); // 2 percent
  await age(db, "bob", 1);
  const last = await hit(db, "bob", "knife", 3, 1); // bob lands the last 3 hp: 5 hp total (5 percent) is paid; the killer gets nothing extra
  assert.equal(last.killed, true);
  const paid = await call(db, "select account from public.arma_loot where item = 'rat-tail' order by account");
  assert.deepEqual(paid.map((p) => p.account), [ids.alice, ids.bob], "bob reached exactly 5 percent");
});

test("respawn: after the clock passes the creature is alive again at full hp in the next generation, and old tokens do not carry over", async () => {
  const db = await ready();
  await engage(db, "alice");
  await age(db, "alice", 5);
  await hit(db, "alice", "rifle", 1e9, 1e9);
  await age(db, "alice", 5);
  assert.equal((await engage(db, "alice")).refused, "dead");
  await db.exec(`update public.arma_spawns set respawn_at = now() - interval '1 second' where instance = 'rat-1'`);
  const view = (await call(db, "select public.arma_spawn_state($1, array['rat-1']) as r", [ids.alice]))[0].r.spawns[0];
  assert.deepEqual([view.alive, view.hp, view.generation], [true, 100, 1], "the read already shows it alive");
  const again = await engage(db, "alice", "rat-1", 100, "westminster", "tokenalicegen1000000");
  assert.deepEqual([again.generation, again.hp], [1, 100]);
  assert.equal(again.token, "tokenalicegen1000000", "a fresh token for the new incarnation");
  const row = (await call(db, "select alive, hp, generation, respawn_at from public.arma_spawns where instance = 'rat-1'"))[0];
  assert.deepEqual([row.alive, Number(row.hp), row.generation, row.respawn_at], [true, 100, 1, null]);
});

test("per-account caps: too many open engages, and a kill-rate cap stops payout", async () => {
  const db = await ready();
  await db.exec(`update public.arma_world_config set max_open = 2, kills_per_min = 1`);
  await engage(db, "alice", "rat-a");
  await engage(db, "alice", "rat-b", 100, "westminster", "tokenalicesecond000");
  assert.equal((await call(db, "select public.arma_spawn_engage($1,$2,'tokenthird0000000000','rat-c','rat','westminster',100) as r", [ids.alice, db.chars.alice]))[0].r.refused, "too-many");
  // Kill rat-a, then rat-b inside the same minute: only the first pays.
  await age(db, "alice", 5);
  const first = await call(db, "select public.arma_spawn_hit($1,$2,'rifle',1000,10,60) as r", [ids.alice, TOKEN.alice]);
  assert.equal(first[0].r.killed, true, "rat-a (the first token is alice's rat-a engage) died");
  const t2 = (await call(db, "select token from public.arma_spawn_engages where account = $1 and used_at is null", [ids.alice]))[0].token;
  await db.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '5 seconds' where token = '${t2}'`);
  const second = (await call(db, "select public.arma_spawn_hit($1,$2,'rifle',1000,10,60) as r", [ids.alice, t2]))[0].r;
  assert.equal(second.killed, true);
  assert.equal(second.paid, 0, "over the kills-per-minute cap: the death stands, the payout does not");
  assert.equal((await call(db, "select count(*)::int as n from public.arma_loot"))[0].n, 1);
});

test("four players hit the wolf in one tick batch: one shared bar, one death, each row reported in its own slot", async () => {
  const db = await ready();
  await db.exec(`insert into public.arma_loot_rules values ('wolf', 0, 'wolf-pelt', 1)`);
  const who = ["alice", "bob", "carol", "dave"];
  for (const name of who)
    await call(db, "select public.arma_spawn_engage($1, $2, $3, 'wolf-1', 'wolf', 'east', 40) as r", [ids[name], db.chars[name], TOKEN[name]]);
  for (const name of who) await age(db, name, 1);
  const batch = (rows) => call(db, "select public.arma_spawn_hit_batch($1::jsonb) as r", [JSON.stringify(rows)]).then((r) => r[0].r);
  const row = (name, applied, extra = {}) => ({ account: ids[name], token: TOKEN[name], weapon: "knife", applied, hits: 1, respawnS: 60, ...extra });
  // Tick 1: all four land 8 each, plus a row with a token that does not exist. The bar goes 40 -> 8 and each row sees the bar the earlier rows already lowered.
  const tick1 = await batch([row("alice", 8), row("bob", 8), row("carol", 8), row("dave", 8), row("alice", 1e9, { token: "nosuchtoken0000000" })]);
  assert.deepEqual(tick1.slice(0, 4).map((r) => r.hp), [32, 24, 16, 8]);
  assert.equal(tick1[4].error, "O0009", "a bad row is reported in its own slot");
  assert(tick1.slice(0, 4).every((r) => r.killed === false));
  // Every result names the creature of the TOKEN's engage row (presence broadcasts that, never what the phone claimed).
  assert.deepEqual(tick1.slice(0, 4).map((r) => [r.instance, r.generation]), Array(4).fill(["wolf-1", 0]));
  assert.deepEqual([tick1[4].instance, tick1[4].generation], [null, null], "a token that does not exist names nothing");
  // Another account's token names nothing either: bob presenting alice's token learns and relabels nothing.
  await age(db, "alice", 1);
  const stolen = (await batch([{ account: ids.bob, token: TOKEN.alice, weapon: "knife", applied: 1, hits: 1 }]))[0];
  assert.deepEqual([stolen.instance, stolen.generation], [null, null]);
  assert.equal(stolen.error, "O0009");
  // Tick 2: dave lands the rest. One death, paid to all four; the others' tokens are closed with it, so they see the same death.
  for (const name of who) await age(db, name, 1);
  const tick2 = await batch([row("dave", 50), row("alice", 50)]);
  assert.deepEqual([tick2[0].killed, tick2[0].hp, tick2[0].paid], [true, 0, 4]);
  assert.equal(tick2[1].error, "O0009");
  const state = (await call(db, "select public.arma_spawn_state($1, array['wolf-1']) as r", [ids.alice]))[0].r.spawns[0];
  assert.deepEqual([state.alive, state.hp], [false, 0]);
  assert.equal((await call(db, "select account from public.arma_loot where item = 'wolf-pelt'")).length, 4);
  assert.equal((await failure(call(db, "select public.arma_spawn_hit_batch('{}'::jsonb)")))?.code, "O0002");
  assert.equal((await failure(call(db, "select public.arma_spawn_hit_batch($1::jsonb)", [JSON.stringify(Array(201).fill(row("alice", 1)))])))?.code, "O0002");
});
