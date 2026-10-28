import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { populationPlacements } from "../src/engine/area-population.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { CREATURE_MOVES } from "../src/creature-moves.js";
import { rigCapability, rigNumber } from "../src/rig-capabilities.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const place = (cycle, search = "") =>
  populationPlacements(content.populationData, "elephant-and-castle", cycle, content.residents["elephant-and-castle"], search).find(
    (row) => row.key === "elephant-and-castle-resident-2",
  );

test("the elephant is the Elephant and Castle creature slot in both cycles, on by default", () => {
  for (const cycle of ["A", "B"]) {
    const row = place(cycle);
    assert.equal(row.foundationRef, "original-elephant");
    assert.equal(row.recipeRef, "elephant-ashen-bull");
  }
  assert.equal(rigCapability("original-elephant", "nativeSkeleton"), true);
  assert.equal(rigNumber("original-elephant", "mouthOffset"), 0);
});

test("?noelephant=1 gives the slot back to the original dog (A) or roach (B)", () => {
  assert.equal(place("A", "?noelephant=1").foundationRef, "original-dog");
  assert.equal(place("B", "?noelephant=1").foundationRef, "original-roach");
  assert.equal(place("B", "?nocrow=1").foundationRef, "original-elephant");
});

test("the elephant bite is its own heavier row; the model file matches its manifest pin", () => {
  assert.equal(CREATURE_MOVES.elephant_attack.damage, 16);
  assert.equal(CREATURE_MOVES.elephant_attack.clip, "Bite");
  const manifest = read("assets/manifest-hollow.json").models["original-elephant"];
  const bytes = fs.readFileSync(new URL("../public/assets/" + manifest.url, import.meta.url));
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
  assert(bytes.length < 600 * 1024, "phone budget: under about 600 KB");
});
