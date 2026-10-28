import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaContent } from "../src/engine/area-content.js";
import { createGame } from "../src/combat.js";
import { createHollowEncounter } from "../src/hollow-encounter.js";
import { creatureCatalogue } from "../src/engine/creature-catalogue.js";
import { rigCapability, rigText, rigOfSpecies } from "../src/rig-capabilities.js";
import { populationPlacements } from "../src/engine/area-population.js";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const manifest = read("../public/world/manifest.json");
const registry = createAreaRegistry({ manifest });
const layouts = Object.fromEntries(
  registry.ids.map((id) => [registry.get(id).layoutRef, read("../public/" + registry.asset(registry.get(id).layoutRef).path)]),
);
const hollow = read("../public/assets/manifest-hollow.json");

test("the centipede is a reviewed foundation on the roach clips, with its own species and a default-on switch", () => {
  const row = creatureCatalogue.get("giant-centipede");
  assert.equal(row.rig, "giant-centipede");
  assert.deepEqual(row.clips, creatureCatalogue.get("original-roach").clips);
  assert.equal(creatureCatalogue.forRecipe("centipede-lurker").id, "giant-centipede");
  assert.equal(rigOfSpecies("centipede"), "giant-centipede");
  assert.equal(rigCapability("giant-centipede", "enabled"), true);
  assert.equal(rigText("giant-centipede", "offParam"), "nocentipede");
});

test("the model entry reuses the roach motion kind and clip names, and pins the file it ships", () => {
  const model = hollow.models["giant-centipede"];
  assert.equal(model.motion, "roach");
  assert.deepEqual(model.clips, hollow.models["original-roach"].clips);
  const bytes = fs.readFileSync(new URL("../public/assets/" + model.url, import.meta.url));
  assert.equal(bytes.length, model.bytes);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), model.sha256);
});

test("the centipede is an optional monster: default on, dropped by ?nocentipede=1", () => {
  assert.equal(rigCapability("giant-centipede", "optionalMonster"), true);
  const data = validateAreaContent(read("../public/world/area-content.json"), registry, layouts);
  const rows = data.residents.area8;
  const pick = (search) =>
    populationPlacements(data.populationData, "area8", "B", rows, search).find((r) => r.key === "area8-resident-4").foundationRef;
  assert.equal(pick(""), "giant-centipede");
  assert.equal(pick("?nocentipede=0"), "giant-centipede");
  assert.equal(pick("?qa=1&nocentipede=1"), "original-roach");
});

test("Area 8 fields the centipede in the cycle B creature slot, and ?nocentipede=1 puts the cycle A roach back", () => {
  const data = validateAreaContent(read("../public/world/area-content.json"), registry, layouts);
  const slot = data.populationData.areas.area8.creatureSlot;
  assert.equal(slot.placementKey, "area8-resident-4");
  assert.deepEqual(slot.cycles.B, { foundationRef: "giant-centipede", recipeRef: "centipede-lurker" });
  assert.equal(slot.cycles.A.foundationRef, "original-roach");
  const build = (animalCycle) =>
    createGame(
      {
        bossData: data.bossData,
        populationData: data.populationData,
        areaId: "area8",
        layout: { characterScale: 1.265 },
        spawn: { x: 0, z: -6 },
        move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
        lineClear: () => true,
      },
      {
        pilot: "donor-knife",
        areaResidents: true,
        animalVariants: true,
        openingGroup: false,
        animalCycle,
        residentPlacements: data.residents,
        encounter: createHollowEncounter({ rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 }),
      },
    );
  assert.equal(build("A").enemies.some((e) => e.rig === "giant-centipede"), false);
  const on = build("B").enemies;
  const found = on.find((e) => e.rig === "giant-centipede");
  assert.ok(found);
  assert.equal(found.placementKey, "area8-resident-4");
  assert.deepEqual([found.hp, found.radius, found.moveSpeed], [60, 1.7, 2.3]);
  globalThis.location = { search: "?nocentipede=1" };
  try {
    const off = build("B").enemies;
    assert.equal(off.some((e) => e.rig === "giant-centipede"), false);
    assert.equal(off.length, on.length);
    assert.equal(off.find((e) => e.placementKey === "area8-resident-4").rig, "original-roach");
  } finally {
    delete globalThis.location;
  }
});
