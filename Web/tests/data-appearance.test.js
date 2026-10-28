import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, buildGameData, validateAppearance } from "../src/engine/game-data.js";
import { ANIMAL_APPEARANCES } from "../src/animal-appearance.js";
import { ROACH_APPEARANCES } from "../src/roach-appearance.js";
import { HOLLOW_GARMENTS } from "../src/hollow-palette.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: the appearance tables moved from face-appearance.js, hollow-palette.js, animal-appearance.js and roach-appearance.js
// into Web/src/data/appearance.json. tests/fixtures/appearance-pre-data.json is the old in-code values, dumped before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/appearance-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));
const text = (file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

// 28 Oct: the crow's two recipes are appended rows (art/monster-crow).
old.animals.push(
  { id: "crow-carrion", foundation: "original-crow", name: "Carrion Crow", width: 1, tint: [1.2, 1.02, 0.9], patch: 0 },
  { id: "crow-ragged", foundation: "original-crow", name: "Ragged Crow", width: 1.12, tint: [1.3, 1.05, 0.85], patch: 0.35 },
  { id: "rat-king", foundation: "original-rat", name: "Rat King", width: 1, tint: [1, 1, 1], patch: 0 }, // 28 Oct: art/monster-rat-king
);
test("every exported table equals the old in-code table exactly (values and key order) and is frozen", () => {
  assert.deepEqual(ANIMAL_APPEARANCES, old.animals);
  assert.deepEqual(ROACH_APPEARANCES, old.roaches);
  assert.deepEqual(HOLLOW_GARMENTS, old.hollowGarments);
  for (const [rows, expected] of [[ANIMAL_APPEARANCES, old.animals], [ROACH_APPEARANCES, old.roaches]]) {
    assert.deepEqual(rows.map((r) => Object.keys(r)), expected.map((r) => Object.keys(r)));
    assert(Object.isFrozen(rows) && rows.every((r) => Object.isFrozen(r) && Object.isFrozen(r.tint ?? r.shellTint)));
  }
  assert(Object.isFrozen(HOLLOW_GARMENTS));
  assert.equal(GAME_DATA.appearance.animals, ANIMAL_APPEARANCES);
  assert.equal(GAME_DATA.appearance.roaches, ROACH_APPEARANCES);
});

test("the face mesh constants equal the old private constants, and the module reads them from the data", () => {
  assert.deepEqual(GAME_DATA.appearance.faceMesh.cheek, old.cheek);
  assert.deepEqual(GAME_DATA.appearance.faceMesh.headNames, old.headNames);
  const face = text("face-appearance.js");
  assert.ok(face.includes("GAME_DATA.appearance.faceMesh"));
  assert.ok(!face.includes("0.2961382707983211") && !face.includes('"PhotoEyes"'));
});

test("the loader rejects a broken appearance file", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { delete d.roaches; }));
  assert.throws(broken((d) => { d.faceMesh.cheek = [0.1, 0.2]; }));
  assert.throws(broken((d) => { d.faceMesh.cheek[0] = 2; }));
  assert.throws(broken((d) => { d.faceMesh.headNames = ["Photo", "Photo", "PhotoTeeth"]; }));
  assert.throws(broken((d) => { d.hollowGarments.trousers = d.hollowGarments.jacket; }));
  assert.throws(broken((d) => { d.animals[0].extra = 1; }));
  assert.throws(broken((d) => { delete d.animals[0].foundation; }));
  assert.throws(broken((d) => { d.animals[1].id = d.animals[0].id; }));
  assert.throws(broken((d) => { d.animals[0].width = 0; }));
  assert.throws(broken((d) => { d.animals[0].patch = 2; }));
  assert.throws(broken((d) => { d.animals[0].tint = [1, 1, "x"]; }));
  assert.throws(broken((d) => { d.roaches[0].shellTint = [1, 1]; }));
  assert.throws(() => buildGameData({ appearance: [{ schema_version: 2 }, validateAppearance] }));
});

test("the four modules keep no appearance tables; the two derived clothing views stay in code with a reason", () => {
  for (const [file, tables] of [["face-appearance.js", 0], ["animal-appearance.js", 0], ["roach-appearance.js", 0], ["hollow-palette.js", 1], ["clothing-palettes.js", 1]])
    assert.equal(countConstantTables(text(file)), tables, file);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of ["face-appearance.js", "animal-appearance.js", "roach-appearance.js"]) assert.equal(baseline.constantTables[file], undefined);
  assert.equal(baseline.constantTables["hollow-palette.js"], 1);
  assert.deepEqual(baseline.keepInCode["hollow-palette.js"].map((r) => r.name), ["library"]);
  assert.deepEqual(baseline.keepInCode["clothing-palettes.js"].map((r) => r.name), ["PAIRINGS"]);
});
