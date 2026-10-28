import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateWeapons } from "../src/engine/game-data.js";
import { MOBILE_AIM, FLAME_AIM } from "../src/mobile-combat-aim.js";
import { FINISHER_IMPACT_LIMITS, finisherImpactProfile } from "../src/finisher-impact-profile.js";
import { FINISHER_DATA } from "../src/engine/finisher-data.js";
import { WEAPON_CREDIT_DESCRIPTORS, deathWeaponDescriptor } from "../src/engine/weapon-credit-policy.js";
import { ratMeleeDefinition } from "../src/rat-melee-definition.js";
import { selectPistolTarget, selectCombatTarget } from "../src/pistol-targeting.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: the targeting cones, touch/flame aim, finisher impact palette, low-melee rigs and weapon credit policies moved into
// weapons.json and finisher-data.json. tests/fixtures/data-tables-batch2-pre.json is the old in-code values, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/data-tables-batch2-pre.json", import.meta.url)));
const text = (file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const weapons = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/weapons.json", import.meta.url))));

test("the aim, impact and credit tables equal the old in-code tables exactly", () => {
  assert.deepEqual(MOBILE_AIM, old.MOBILE_AIM);
  assert.deepEqual(FLAME_AIM, old.FLAME_AIM);
  assert.deepEqual(FINISHER_IMPACT_LIMITS, old.FINISHER_IMPACT_LIMITS);
  assert.deepEqual(WEAPON_CREDIT_DESCRIPTORS, old.WEAPON_CREDIT_DESCRIPTORS);
  assert.deepEqual(Object.keys(WEAPON_CREDIT_DESCRIPTORS), Object.keys(old.WEAPON_CREDIT_DESCRIPTORS));
  for (const t of [MOBILE_AIM, FLAME_AIM, WEAPON_CREDIT_DESCRIPTORS]) assert(Object.isFrozen(t));
  // Bit-identical radians, not just close.
  for (const [k, v] of Object.entries(old.FLAME_AIM)) assert(Object.is(FLAME_AIM[k], v), `FLAME_AIM.${k}`);
  for (const [k, v] of Object.entries(old.MOBILE_AIM)) assert(Object.is(MOBILE_AIM[k], v), `MOBILE_AIM.${k}`);
  for (const [id, expected] of old.creditLookup) assert.deepEqual(deathWeaponDescriptor(id), expected);
});

test("the targeting cones and the impact palette read the old values from the data", () => {
  assert.deepEqual(GAME_DATA.weapons.targeting.pistol, old.PISTOL_TARGETING);
  assert.equal(GAME_DATA.weapons.targeting.meleeConeDegrees, old.COMBAT_TARGETING.meleeDegrees);
  assert.deepEqual([...FINISHER_DATA.impactPalette], [0x650c1b, 0x831428, 0x430812]);
  assert(Object.isFrozen(FINISHER_DATA.impactPalette));
  const profile = finisherImpactProfile(
    { recipeId: "r", victimId: 1, damageType: "slash", direction: { x: 1, z: 0 } },
    { head: { x: 0, y: 1, z: 0 }, body: { x: 0, y: 1, z: 0 } },
  );
  if (profile) assert.deepEqual([...profile.palette], [0x650c1b, 0x831428, 0x430812]);
});

test("the cones still drive target selection exactly as before", () => {
  const position = { x: 0, z: 0 },
    lineClear = () => true,
    at = (deg, id) => ({
      id,
      hp: 10,
      pos: { x: 5 * Math.sin((deg * Math.PI) / 180), z: 5 * Math.cos((deg * Math.PI) / 180) },
    });
  const input = (deg) => ({ position, aim: { x: 0, z: 1 }, lineClear, targets: [at(deg, 7)] });
  for (const [deg, want] of [
    [11.9, true],
    [12.1, false],
  ])
    assert.equal(!!selectPistolTarget(input(deg)), want, `acquire ${deg}`);
  assert(selectPistolTarget({ ...input(17.9), retainedTargetId: 7 }));
  assert.equal(selectPistolTarget({ ...input(18.1), retainedTargetId: 7 }), null);
  for (const [deg, want] of [
    [44.5, true],
    [45.5, false],
  ])
    assert.equal(!!selectCombatTarget({ ...input(deg), range: 10 }), want, `melee ${deg}`);
});

test("the low melee rigs and clips behave as before for every rig, clip and action", () => {
  assert.deepEqual(GAME_DATA.weapons.lowMelee.rigs, [
    "original-rat",
    "original-dog",
    "original-roach",
    "giant-salamander",
    "original-wolf",
    "original-crow",
    "giant-eel",
  ]);
  assert.deepEqual(GAME_DATA.weapons.lowMelee.clips, ["RatLowSlash", "DogMidSlash"]);
  for (const row of old.rat) {
    const move = { stab: "thrust", heavy: "heavy_overhead", special: "skill_pommel" }[row.action] ?? "light_right";
    const out = ratMeleeDefinition(
      row.action,
      { moveId: move, clip: "Base", path: "p", native: true },
      { clip: row.clip, ratLow: true, windupTicks: 20, activeTicks: 6, recoveryTicks: 28 },
      { rig: row.rig },
    );
    assert.deepEqual(out, row.out, `${row.action} ${row.rig} ${row.clip}`);
  }
});

test("the moved constant tables are gone from the code files", () => {
  for (const file of [
    "pistol-targeting.js",
    "mobile-combat-aim.js",
    "rat-melee-definition.js",
    "engine/weapon-credit-policy.js",
  ])
    assert.equal(countConstantTables(text(file)), 0, file);
  assert.equal(countConstantTables(text("finisher-impact-profile.js")), 1);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.deepEqual(
    baseline.keepInCode["finisher-impact-profile.js"].map((r) => r.name),
    ["FINISHER_IMPACT_LIMITS"],
  );
  assert.equal(baseline.constantTables["finisher-impact-profile.js"], 1);
  for (const file of [
    "pistol-targeting.js",
    "mobile-combat-aim.js",
    "rat-melee-definition.js",
    "engine/weapon-credit-policy.js",
  ])
    assert.equal(baseline.constantTables[file], undefined, file);
  assert.equal(baseline.rigLiterals["rat-melee-definition.js"], undefined);
});

test("the validators reject malformed rows", () => {
  validateWeapons(weapons());
  const bad = (edit, why) => {
    const d = weapons();
    edit(d);
    assert.throws(() => validateWeapons(d), why);
  };
  bad((d) => (d.targeting.pistol.acquireDegrees = 90), /below 90/);
  bad((d) => (d.targeting.pistol.retainDegrees = 5), /retain/);
  bad((d) => delete d.mobileAim.gain, Error);
  bad((d) => (d.mobileAim.near = 7), /near/);
  bad((d) => (d.flameAim.yawLimitDegrees = -1), /finite number/);
  bad((d) => (d.lowMelee.rigs = []), /lowMelee/);
  bad((d) => (d.lowMelee.clips = ["a", "a"]), /lowMelee/);
  bad((d) => (d.creditPolicies[0].creditPolicy = "full"), /creditPolicy/);
  bad((d) => d.creditPolicies.push({ ...d.creditPolicies[0] }), /distinct/);
});
