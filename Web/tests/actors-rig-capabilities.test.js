import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rigCapability, rigNumber, rigText } from "../src/rig-capabilities.js";
import { countRigLiterals } from "../../scripts/as-data-gate.mjs";

// Data move: actors.js no longer names rigs. Each old comparison is now a capability row; these pin that every capability picks
// exactly the rigs the old comparison did.
const RIGS = Object.keys(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))).rigCapabilities);
const only = (rigs, pick) => assert.deepEqual(RIGS.filter(pick), rigs);

test("each capability picks the same rigs as the comparison it replaced", () => {
  only(["low-hover-drone"], (r) => rigCapability(r, "hoverTarget"));
  only(["original-roach", "original-spider"], (r) => rigText(r, "biteMove") === "roach");
  only(["original-dog"], (r) => rigNumber(r, "feralScale") === 2);
  only(["original-rat", "original-crow"], (r) => rigText(r, "appearanceKit") === "rat"); // 28 Oct: the crow wears the rat coat kit
  only(["original-roach"], (r) => rigText(r, "appearanceKit") === "roach");
  only(["giant-salamander", "original-wolf", "giant-eel", "original-elephant"], (r) => rigCapability(r, "nativeSkeleton")); // 28 Oct: the giant eel rides the salamander rig
  only(["giant-salamander"], (r) => rigNumber(r, "materialDim") === 0.75);
  only(["giant-salamander"], (r) => rigCapability(r, "fireBreath"));
  only(["giant-salamander", "giant-eel"], (r) => rigCapability(r, "calfFaceReceiver"));
  only(["original-wolf", "original-elephant"], (r) => rigCapability(r, "bodyReceiver"));
  only(["original-rat", "original-crow"], (r) => rigText(r, "brain") === "rat"); // 28 Oct: the crow bites with the rat brain
  only(["original-dog", "original-roach", "giant-salamander", "original-wolf", "giant-eel", "original-elephant", "original-spider"], (r) => rigText(r, "brain") === "dog");
});

test("actors.js keeps no rig-name literal", () => {
  assert.equal(countRigLiterals(fs.readFileSync(new URL("../src/actors.js", import.meta.url), "utf8"), RIGS), 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.rigLiterals["actors.js"], undefined);
});
