import test from "node:test";
import assert from "node:assert/strict";
import { rigOfSpecies, rigText, RIG_CAPABILITIES } from "../src/rig-capabilities.js";

// Data move: combat.js addressed the drone, rat, roach and dog by rig-name literals (catalogue lookups, foundation checks, the
// per-placement overrides). They are the species rows of rig-capabilities.json. The old literals are the expected answers.
test("each species resolves to the rig id combat.js used to write out", () => {
  assert.equal(rigOfSpecies("drone"), "low-hover-drone");
  assert.equal(rigOfSpecies("rat"), "original-rat");
  assert.equal(rigOfSpecies("roach"), "original-roach");
  assert.equal(rigOfSpecies("dog"), "original-dog");
  assert.equal(rigOfSpecies("salamander"), "giant-salamander");
  assert.equal(rigOfSpecies("wolf"), "original-wolf");
  assert.equal(rigOfSpecies("eel"), "giant-eel");
  assert.equal(rigOfSpecies("centipede"), "giant-centipede");
});

test("every rig has a distinct species and an unknown species is an error", () => {
  const species = Object.keys(RIG_CAPABILITIES).map((rig) => rigText(rig, "species"));
  assert.equal(new Set(species).size, species.length); // one species per rig (a new monster adds a row, not a literal count)
  assert(species.every((s) => typeof s === "string" && s));
  assert.throws(() => rigOfSpecies("human"), /No rig has species human/);
});
