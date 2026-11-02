import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { populationPlacements } from "../src/engine/area-population.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import { rigCapability, rigText } from "../src/rig-capabilities.js";
import { creatureCatalogue } from "../src/engine/creature-catalogue.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// The crow (art/monster-crow): the rat rig and motion kind re-meshed as a big, ragged carrion crow. It takes the cycle B creature of two
// population slots, is on by default, and ?nocrow=1 (or `enabled: false` in its creatures.json row) puts the cycle A creature back.
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const slotOf = (area, cycle, search) => {
  const rows = populationPlacements(content.populationData, area, cycle, AREA_MOB_SPAWNS[area] ?? content.residents[area], search);
  const key = content.populationData.areas[area].creatureSlot.placementKey;
  const row = rows.find((r) => r.key === key);
  return [row.foundationRef, row.recipeRef];
};

test("the crow is the cycle B creature of the east-bridge and lambeth slots; cycle A and every other area are unchanged", () => {
  assert.deepEqual(slotOf("east-bridge", "B", ""), ["original-crow", "crow-carrion"]);
  assert.deepEqual(slotOf("lambeth", "B", ""), ["original-crow", "crow-ragged"]);
  assert.deepEqual(slotOf("east-bridge", "A", ""), ["original-rat", "rat-soot"]);
  assert.deepEqual(slotOf("lambeth", "A", ""), ["original-roach", "roach-ash"]);
  const crowAreas = Object.entries(content.populationData.areas)
    .filter(([, a]) => Object.values(a.creatureSlot.cycles).some((c) => c.foundationRef === "original-crow"))
    .map(([id]) => id)
    .sort();
  assert.deepEqual(crowAreas, ["east-bridge", "lambeth"]);
  assert.equal(content.populationData.areas.westminster.creatureSlot.cycles.B.foundationRef, "giant-salamander");
});

test("the crow is on by default and ?nocrow=1 puts the cycle A creature back", () => {
  assert.equal(rigCapability("original-crow", "enabled"), true);
  assert.equal(rigText("original-crow", "offParam"), "nocrow");
  assert.deepEqual(slotOf("east-bridge", "B", "?nocrow=1"), ["original-rat", "rat-soot"]);
  assert.deepEqual(slotOf("lambeth", "B", "?x=2&nocrow=1"), ["original-roach", "roach-ash"]);
  assert.deepEqual(slotOf("lambeth", "B", "?nocrow=0"), ["original-crow", "crow-ragged"]);
  assert.deepEqual(slotOf("lambeth", "B", "?qa=1&world=0"), ["original-crow", "crow-ragged"]);
});

test("the crow is a rat-brain rig with its own coat and recipes", () => {
  assert.equal(rigText("original-crow", "brain"), "rat");
  assert.equal(rigText("original-crow", "species"), "crow");
  assert.equal(creatureCatalogue.forRecipe("crow-carrion").runtimeIdentity, "original-crow");
  assert.equal(creatureCatalogue.forRecipe("crow-ragged").runtimeIdentity, "original-crow");
  for (const id of ["crow-carrion", "crow-ragged"]) {
    const row = GAME_DATA.appearance.animals.find((r) => r.id === id);
    assert.equal(row.foundation, "original-crow");
    assert(row.tint.every((c) => c > 0.5 && c < 2));
  }
});

function glb(file) {
  const d = fs.readFileSync(file);
  const len = d.readUInt32LE(12);
  return { json: JSON.parse(d.subarray(20, 20 + len).toString("utf8")), bytes: d };
}
const joints = (j) => j.skins[0].joints.map((i) => j.nodes[i].name).sort();
const clips = (j) => Object.fromEntries(j.animations.map((a) => [a.name, Math.max(...a.samplers.map((s) => j.accessors[s.input].max[0]))]));

test("the crow GLB is the rat rig: same joints and clip durations, rat mesh layout, phone budget", () => {
  const manifest = read("assets/manifest-hollow.json");
  const row = manifest.models["original-crow"];
  const crow = glb(new URL("../public/assets/" + row.url, import.meta.url)),
    rat = glb(new URL("../public/assets/" + manifest.models["original-rat"].url, import.meta.url));
  assert.equal(row.bytes, crow.bytes.length);
  assert.equal(row.sha256, createHash("sha256").update(crow.bytes).digest("hex"));
  assert(row.bytes < 600 * 1024, "GLB under 600 KB");
  assert.deepEqual(joints(crow.json), joints(rat.json));
  assert.deepEqual(clips(crow.json), clips(rat.json));
  assert.deepEqual(row.clips, manifest.models["original-rat"].clips);
  assert.equal(row.motion, "rat");
  // The bite sweep reads vertex 80 of the fourth primitive (actors.js tooth(); appearance.json toothVertex), so it must exist and sit on the bill.
  const mesh = crow.json.meshes[0];
  assert.equal(mesh.name, "Original ARM rat surface");
  assert.equal(mesh.primitives.length, 4);
  assert(crow.json.accessors[mesh.primitives[3].attributes.POSITION].count > GAME_DATA.appearance.actorView.toothVertex);
  const tris = mesh.primitives.reduce((n, p) => n + crow.json.accessors[p.indices].count / 3, 0);
  assert(tris < 8000, `triangles ${tris}`);
  assert.deepEqual(
    crow.json.materials.map((m) => m.name),
    ["Glossy black carrion feathers", "Scaled ash-grey legs and feet", "Dark glossy eyes", "Dark horn beak"],
  );
  assert.equal(rigText("original-crow", "coatName"), crow.json.materials[0].name);
  const sizes = crow.json.images.map((i) => i.mimeType);
  assert(sizes.every((m) => m === "image/webp"));
});
