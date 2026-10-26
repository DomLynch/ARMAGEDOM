import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { rigText } from "../src/rig-capabilities.js";

// The material, mesh and node names the code looks things up by in the shipped GLBs are appearance.json `meshNames`. The table is every name
// the modules held as a literal before the move.
const OLD = {
  feralCoat: "Weathered brindle coat",
  feralLimbs: "Worn muzzle ear paw",
  feralFace: "Nose eyes mouth",
  feralTeeth: "Old ivory canine teeth",
  roachShell: "Worn rust-brown chitin",
  donorNeck: "Recovered donor lower neck",
  hair: "Scavenger hair",
  hairMaterial: "Private scavenger hair",
  bodySkin: "Ash-grey affected skin",
  neckSkin: "Photo-matched exposed lower neck",
};
const clone = () => structuredClone(GAME_DATA.appearance);

test("meshNames hold every name the modules used to spell out", () => {
  assert.deepEqual(GAME_DATA.appearance.meshNames, OLD);
});

test("the dog coat name matches the rig row in creatures.json", () => {
  assert.equal(rigText("original-dog", "coatName"), OLD.feralCoat);
});

test("validateAppearance rejects a missing, empty, extra or repeated mesh name", () => {
  assert.doesNotThrow(() => validateAppearance(clone()));
  const missing = clone();
  delete missing.meshNames.hair;
  assert.throws(() => validateAppearance(missing));
  const empty = clone();
  empty.meshNames.hair = " ";
  assert.throws(() => validateAppearance(empty), /hair/);
  const extra = clone();
  extra.meshNames.other = "x";
  assert.throws(() => validateAppearance(extra));
  const repeated = clone();
  repeated.meshNames.hairMaterial = repeated.meshNames.hair;
  assert.throws(() => validateAppearance(repeated), /differ/);
});

test("the modules no longer spell the names out", () => {
  for (const file of [
    "feral-dog",
    "feral-body-shapes",
    "feral-coat-profiles",
    "roach-appearance",
    "face-appearance",
    "finisher-crown",
    "finisher-presentation",
  ]) {
    const text = fs.readFileSync(new URL(`../src/${file}.js`, import.meta.url), "utf8");
    for (const name of Object.values(OLD)) assert(!text.includes(`"${name}"`), `${file}.js still spells "${name}"`);
  }
});
