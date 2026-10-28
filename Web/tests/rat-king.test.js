import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { GAME_DATA } from "../src/engine/game-data.js";
import { appearanceRefOn, residentEncounterHealth } from "../src/area-mob-spawns.js";
import { creatureCatalogue } from "../src/engine/creature-catalogue.js";
import { populationPlacements } from "../src/engine/area-population.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../public/assets/manifest-hollow.json").models;
const content = read("../public/world/area-content.json");
const KEY = "area7-station-rat-v1";
const slotA = content.population.areas.area7.creatureSlot.cycles.A;
const build = (cycle, search) =>
  populationPlacements(content.population, "area7", cycle, content.residents.area7, search).find((r) => r.key === KEY);

test("the Rat King model reuses the rat rig, motion and clips, at an enlarged scale, and its file matches the pinned bytes", () => {
  const king = manifest["rat-king"],
    rat = manifest["original-rat"];
  assert.equal(king.rig, rat.rig);
  assert.equal(king.motion, rat.motion);
  assert.deepEqual(king.clips, rat.clips);
  assert.deepEqual(king.contact, rat.contact);
  assert.equal(king.deferred, true);
  assert.ok(king.scale > rat.scale && king.scale <= rat.scale * 3.5, "an enlarged rat, not a new scale class");
  const bytes = fs.readFileSync(new URL("../public/assets/" + king.url, import.meta.url));
  assert.equal(bytes.length, king.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), king.sha256);
  assert.ok(king.bytes < 600 * 1024, "phone budget: GLB under about 600 KB");
});

test("the rat-king recipe dresses the rat foundation; the Area 7 slot holds the king in cycle A only, cycle B is untouched", () => {
  assert.equal(creatureCatalogue.forRecipe("rat-king").id, "original-rat");
  assert.ok(GAME_DATA.appearance.animals.some((row) => row.id === "rat-king" && row.foundation === "original-rat"));
  assert.equal(slotA.foundationRef, "original-rat");
  assert.equal(slotA.recipeRef, "rat-king");
  assert.equal(slotA.appearanceRef, GAME_DATA.ratKing.appearanceRef);
  assert.equal(manifest[slotA.appearanceRef].rig, slotA.foundationRef, "same rig, so the actor accepts the appearance");
  assert.equal(content.population.areas.area7.creatureSlot.cycles.B.appearanceRef, undefined);
  assert.equal(build("B").appearanceRef, undefined, "cycle B keeps its own creature");
});

test("the king keeps the rat's health (20): no health override, so the writer's spawn row is unchanged", () => {
  const row = build("A");
  assert.equal(row.encounter, undefined);
  assert.equal(slotA.encounter, undefined);
  assert.equal(residentEncounterHealth(row, 20), 20);
  const spawns = read("../../server/data/spawns.json");
  assert.equal(spawns["area7:area7-station-rat-v1"].maxHp, 20);
});

test("default ON with an OFF switch: ?noratking=1 turns the king back into the plain slot rat", () => {
  assert.equal(GAME_DATA.ratKing.enabled, true);
  assert.equal(appearanceRefOn("rat-king", ""), true);
  assert.equal(appearanceRefOn("rat-king", "?noratking=1"), false);
  assert.equal(appearanceRefOn("rat-king", "?noratking=0"), true);
  assert.equal(appearanceRefOn("hale-pitborn", "?noratking=1"), true, "other appearance models are untouched");
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    delete globalThis.location;
    const on = build("A");
    assert.equal(on.appearanceRef, "rat-king");
    assert.equal(on.key, KEY);
    globalThis.location = { search: "?noratking=1" };
    const off = build("A");
    assert.equal(off.appearanceRef, undefined);
    assert.equal(off.encounter, undefined);
    assert.equal(off.foundationRef, "original-rat");
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete globalThis.location;
  }
});
