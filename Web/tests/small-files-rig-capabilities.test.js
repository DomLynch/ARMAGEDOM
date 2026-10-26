import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rigCapability, rigText } from "../src/rig-capabilities.js";
import { countRigLiterals } from "../../scripts/as-data-gate.mjs";

// Data move: the six small rig-literal files read rig-capabilities rows. These pin each row to the rigs the old literal named.
const RIGS = Object.keys(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))).rigCapabilities);
const only = (rigs, pick) => assert.deepEqual(RIGS.filter(pick), rigs);
const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));

test("each row picks the same rigs as the literal it replaced", () => {
  assert.equal(rigText("original-rat", "coatName"), "Ash and soot worn fur");
  assert.equal(rigText("original-dog", "coatName"), "Weathered brindle coat");
  only(["original-rat", "original-dog"], (r) => rigText(r, "coatName") !== undefined);
  only(["giant-salamander", "original-wolf"], (r) => rigCapability(r, "nativeSkeleton"));
  only(["low-hover-drone"], (r) => rigText(r, "species") === "drone");
  only(["original-roach"], (r) => rigText(r, "species") === "roach");
  only(["giant-salamander"], (r) => rigText(r, "species") === "salamander");
});

test("the six files keep no rig-name literal and their baseline entries are gone", () => {
  for (const file of ["animal-appearance", "animal-role-bindings", "engine/creature-catalogue", "roach-territory", "salamander-native", "wolf-native"]) {
    const source = fs.readFileSync(new URL(`../src/${file}.js`, import.meta.url), "utf8");
    assert.equal(countRigLiterals(source, RIGS), 0, file);
    assert.equal(baseline.rigLiterals[`${file}.js`], undefined, file);
  }
});
