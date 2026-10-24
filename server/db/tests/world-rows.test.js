// The loader between Combat's exports and the Backend: it must accept the real shapes (worldSpawnRows / weaponRules from PR #41)
// and refuse anything the database or the referee could not stand behind. Rows are loaded into the real tables on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSpawns, buildWeaponRows, checkWeaponCoverage } from "../../data/world-rows.js";
import { freshDb, call, failure } from "./helpers.js";

const spawnRow = (over = {}) => ({ instance: "east-wolf-1", kind: "wolf", area: "east", maxHp: 40, respawnS: null, lootKind: null, reach: 1.2, ...over });
const weaponRule = (over = {}) => ({ weaponId: "knife", maxDamagePerHit: 10, maxHitsPerS: 4, reachM: 1.5, ...over });

test("spawns: the writer shape, sorted, extra export fields dropped", () => {
  const spawns = buildSpawns([spawnRow({ instance: "b-2", kind: "rat", area: "south", maxHp: 5 }), spawnRow()]);
  assert.deepEqual(Object.keys(spawns), ["b-2", "east-wolf-1"]);
  assert.deepEqual(spawns["east-wolf-1"], { kind: "wolf", area: "east", maxHp: 40 });
  assert.equal(Object.hasOwn(spawns, "constructor"), false);
});

test("spawns: a null, a gap or a name the database would reject stops the load", () => {
  const bad = {
    "null maxHp": spawnRow({ maxHp: null }),
    "zero maxHp": spawnRow({ maxHp: 0 }),
    "string maxHp": spawnRow({ maxHp: "40" }),
    "NaN maxHp": spawnRow({ maxHp: NaN }),
    "null kind": spawnRow({ kind: null }),
    "upper-case kind": spawnRow({ kind: "Wolf" }),
    "null area": spawnRow({ area: null }),
    "area with a space": spawnRow({ area: "Central Hub" }),
    "missing instance": spawnRow({ instance: undefined }),
    "instance with a slash": spawnRow({ instance: "east/wolf" }),
  };
  for (const [why, row] of Object.entries(bad)) assert.throws(() => buildSpawns([spawnRow({ instance: "ok-1" }), row]), Error, why);
  assert.throws(() => buildSpawns([spawnRow(), spawnRow()]), /duplicate/);
  assert.throws(() => buildSpawns([]), /non-empty/);
  assert.throws(() => buildSpawns(null), /non-empty/);
});

test("weapons: rows for the table; a null, a zero or a duplicate stops the load", () => {
  assert.deepEqual(buildWeaponRows([weaponRule(), weaponRule({ weaponId: "teeth", maxDamagePerHit: 3, maxHitsPerS: 1.5 })]), [["knife", 10, 4], ["teeth", 3, 1.5]]);
  const bad = {
    "null damage": weaponRule({ maxDamagePerHit: null }),
    "null rate": weaponRule({ maxHitsPerS: null }),
    "zero rate": weaponRule({ maxHitsPerS: 0 }),
    "negative damage": weaponRule({ maxDamagePerHit: -1 }),
    "Infinity": weaponRule({ maxHitsPerS: Infinity }),
    "bad id": weaponRule({ weaponId: "Bone Saw" }),
  };
  for (const [why, rule] of Object.entries(bad)) assert.throws(() => buildWeaponRows([weaponRule({ weaponId: "ok" }), rule]), Error, why);
  assert.throws(() => buildWeaponRows([weaponRule(), weaponRule()]), /duplicate/);
});

test("weapons: every id a hit can carry needs a rule", () => {
  const rows = buildWeaponRows([weaponRule(), weaponRule({ weaponId: "pistol" })]);
  checkWeaponCoverage(["knife", "pistol"], rows);
  assert.throws(() => checkWeaponCoverage(["knife", "pistol", "bone-saw"], rows), /bone-saw/);
});

test("the built rows load into the real tables and the referee uses them", async () => {
  const db = await freshDb();
  for (const [weapon, damage, rate] of buildWeaponRows([weaponRule(), weaponRule({ weaponId: "teeth", maxDamagePerHit: 3, maxHitsPerS: 1.5 })]))
    await call(db, "insert into public.arma_weapon_rules (weapon, max_damage_per_hit, max_hits_per_s) values ($1, $2, $3)", [weapon, damage, rate]);
  assert.equal((await call(db, "select count(*)::int as n from public.arma_weapon_rules"))[0].n, 2);
  // What the database refuses, the loader refuses first (same predicates).
  assert.ok(await failure(call(db, "insert into public.arma_weapon_rules values ('x', 0, 1)")));
  const spawns = buildSpawns([spawnRow()]);
  for (const [instance, s] of Object.entries(spawns))
    await call(db, "insert into public.arma_spawns (instance, kind, area, max_hp, hp) values ($1, $2, $3, $4, $4)", [instance, s.kind, s.area, s.maxHp]);
  assert.equal((await call(db, "select max_hp::int as m from public.arma_spawns where instance = 'east-wolf-1'"))[0].m, 40);
});
