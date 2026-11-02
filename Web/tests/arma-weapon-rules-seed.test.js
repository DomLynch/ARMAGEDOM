// The database's seeded weapon rules must be what the game's own tables say. This is the drift guard for the Backend's migrations:
// when a weapon's damage, rate or the progression rows change, this fails until the next seed migration is generated
// (node server/data/generate-weapon-seed.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAYER_WEAPONS, seedWeaponRows } from "../../server/data/world-rows.js";
import { WEAPON_IDS, weaponRules } from "../src/engine/world-events.js";

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const content = JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url), "utf8"));

/** The rows the migrations leave in arma_weapon_rules: every seed migration in file order, a later one overriding an earlier. */
function migratedRules() {
  const rules = new Map();
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(new URL(file, migrations), "utf8");
    if (!/insert into public\.arma_weapon_rules/.test(sql)) continue;
    for (const [, weapon, damage, rate] of sql.matchAll(/\('([a-z0-9._:-]+)',\s*([0-9.eE+-]+),\s*([0-9.eE+-]+)\)/g)) rules.set(weapon, [Number(damage), Number(rate)]);
  }
  return rules;
}

test("the seeded weapon rules equal the game's tables with the progression ceiling", () => {
  const expected = seedWeaponRows(weaponRules(), content.progression);
  const seeded = migratedRules();
  assert.deepEqual([...seeded.keys()].sort(), [...PLAYER_WEAPONS].sort());
  for (const [weapon, damage, rate] of expected) {
    const [seededDamage, seededRate] = seeded.get(weapon);
    assert.ok(Math.abs(seededDamage - damage) < 1e-9 && Math.abs(seededRate - rate) < 1e-9, `${weapon}: seeded ${seededDamage}/${seededRate}, game ${damage}/${rate}; generate the next seed migration`);
  }
});

test("pinned example: the knife is seeded at base 20 x the 1.21 mastery ceiling, the pistol at 25 x 1.21", () => {
  // If the game's knife or pistol damage or the progression rows change, this and the table test above fail together: generate the next seed migration.
  const [knife, pistol] = [migratedRules().get("knife"), migratedRules().get("pistol")];
  assert.ok(Math.abs(knife[0] - 24.2) < 1e-9 && Math.abs(pistol[0] - 30.25) < 1e-9);
});

test("every weapon a hit can carry is either seeded (a player weapon) or a creature attack on purpose", () => {
  const creatureOnly = WEAPON_IDS.filter((id) => !PLAYER_WEAPONS.includes(id)).sort();
  assert.deepEqual(creatureOnly, ["bolt", "teeth"], "a new weapon id must be classified in PLAYER_WEAPONS or here");
});
