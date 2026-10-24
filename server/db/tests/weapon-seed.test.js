// The seeded arma_weapon_rules (migration 6), as the database really has them after all migrations: player weapons only, so a claim of a
// creature's attack is refused by arma_spawn_hit before any token is looked at.
import test from "node:test";
import assert from "node:assert/strict";
import { call, failure, freshDb, ids, openFor } from "./helpers.js";
import { PLAYER_WEAPONS } from "../../data/world-rows.js";

test("the seed has exactly the player weapons, with positive caps", async () => {
  const db = await freshDb();
  const rows = await call(db, "select weapon, max_damage_per_hit::float8 as damage, max_hits_per_s::float8 as rate from public.arma_weapon_rules order by weapon");
  assert.deepEqual(rows.map((r) => r.weapon), [...PLAYER_WEAPONS].sort());
  assert.ok(rows.every((r) => r.damage > 0 && r.rate > 0));
  const knife = rows.find((r) => r.weapon === "knife");
  assert.ok(knife.damage > 20, "the knife's cap includes the mastery ceiling, not just its base damage");
});

test("a creature's attack is not a weapon a player can claim; a player weapon with no engage is a token error instead", async () => {
  const db = await freshDb();
  await openFor(db, ids.alice);
  const hit = (weapon) => call(db, "select public.arma_spawn_hit($1, 'tokenxxxxxxxxxxxxxxxxxx', $2, 5, 1, 60) as r", [ids.alice, weapon]);
  for (const creature of ["teeth", "bolt", "constructor", "no-such-weapon"]) assert.deepEqual((await hit(creature))[0].r, { refused: "weapon" }, creature);
  assert.equal((await failure(hit("knife")))?.code, "O0009", "the weapon is accepted; the unknown token is what fails");
});
