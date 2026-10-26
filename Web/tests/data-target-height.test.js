import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateWeapons } from "../src/engine/game-data.js";
import { WEAPON_FAMILY_IDS } from "../src/engine/weapon-catalog.js";
import { combatTargetHeight } from "../src/pistol-targeting.js";
import { rigNumber, rigCapability } from "../src/rig-capabilities.js";
import { countRigLiterals } from "../../scripts/as-data-gate.mjs";

// Data move: the per-rig target heights moved from combatTargetHeight (pistol-targeting.js) into rig-capabilities.json, the
// default height into weapons.json "targeting", and WEAPON_FAMILY_IDS into weapons.json "families".
// tests/fixtures/target-height-pre-data.json is the old function's output over every rig x reach x size x time, taken before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/target-height-pre-data.json", import.meta.url)));
const weapons = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/weapons.json", import.meta.url))));

test("combatTargetHeight returns exactly the old height for every rig, reach, size and time", () => {
  assert.equal(old.heights.length, 288);
  for (const r of old.heights) {
    const target = {};
    if (r.rig !== null) target.rig = r.rig;
    if (r.contactGoalReach !== null) target.contactGoalReach = r.contactGoalReach;
    if (r.mobSize !== null) target.mobSize = r.mobSize;
    assert(Object.is(combatTargetHeight(target, r.time), r.h), JSON.stringify(r));
  }
});

test("WEAPON_FAMILY_IDS equals the old list in order and is frozen", () => {
  assert.deepEqual([...WEAPON_FAMILY_IDS], old.families);
  assert(Object.isFrozen(WEAPON_FAMILY_IDS));
  assert.equal(WEAPON_FAMILY_IDS, GAME_DATA.weapons.families);
});

test("rig numbers are read only from rows that carry them", () => {
  assert.equal(rigNumber("original-dog", "targetHeight"), 0.35);
  assert.equal(rigNumber("original-dog", "targetHeightReach"), 0.7);
  assert.equal(rigNumber("original-rat", "targetHeightReach"), undefined);
  assert.equal(rigNumber("original-human", "targetHeight"), undefined);
  assert.equal(rigNumber("original-dog", "lowStrike"), undefined);
  assert.equal(rigCapability("original-dog", "targetHeight"), false);
  assert.equal(rigCapability("low-hover-drone", "hoverTarget"), true);
});

test("pistol-targeting.js no longer names a rig", () => {
  const text = fs.readFileSync(new URL("../src/pistol-targeting.js", import.meta.url), "utf8");
  const rigs = Object.keys(JSON.parse(fs.readFileSync(new URL("../src/rig-capabilities.json", import.meta.url))));
  assert.equal(countRigLiterals(text, rigs), 0);
});

test("the validators reject bad families and a bad default height", () => {
  validateWeapons(weapons());
  const bad = (edit, why) => {
    const d = weapons();
    edit(d);
    assert.throws(() => validateWeapons(d), why);
  };
  bad((d) => d.families.push("blades"), /families/);
  bad((d) => (d.families = []), /families/);
  bad((d) => (d.families[0] = "Blades"), /families/);
  bad((d) => delete d.targeting.defaultHeight, Error);
  bad((d) => (d.targeting.defaultHeight = -1), /finite number/);
});
