import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { populationPlacements } from "../src/engine/area-population.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import { rigCapability, rigText, rigOfSpecies } from "../src/rig-capabilities.js";
import { creatureCatalogue } from "../src/engine/creature-catalogue.js";

// The giant eel (art/monster-eel): the giant-salamander rig and motion kind re-meshed as a slick, scarred river eel. It takes the cycle B
// creature of the East population slot (the riverside roamer), is on by default, and ?noeel=1 (or `enabled: false` in its creatures.json
// row) puts the cycle A creature back.
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const slotOf = (area, cycle, search) => {
  const rows = populationPlacements(content.populationData, area, cycle, AREA_MOB_SPAWNS[area] ?? content.residents[area], search);
  const key = content.populationData.areas[area].creatureSlot.placementKey;
  const row = rows.find((r) => r.key === key);
  return [row.foundationRef, row.recipeRef];
};

test("the eel is the cycle B creature of the East slot; cycle A and every other area are unchanged", () => {
  assert.deepEqual(slotOf("east", "B", ""), ["giant-eel", "eel-river-ambusher"]);
  assert.deepEqual(slotOf("east", "A", ""), ["original-dog", "dog-street-mongrel"]);
  const eelAreas = Object.entries(content.populationData.areas)
    .filter(([, a]) => Object.values(a.creatureSlot.cycles).some((c) => c.foundationRef === "giant-eel"))
    .map(([id]) => id);
  assert.deepEqual(eelAreas, ["east"]);
  assert.equal(content.populationData.areas.westminster.creatureSlot.cycles.B.foundationRef, "giant-salamander");
});

test("the eel is on by default and ?noeel=1 puts the cycle A creature back", () => {
  assert.equal(rigCapability("giant-eel", "optionalMonster"), true);
  assert.equal(rigCapability("giant-eel", "enabled"), true);
  assert.equal(rigText("giant-eel", "offParam"), "noeel");
  assert.deepEqual(slotOf("east", "B", "?noeel=1"), ["original-dog", "dog-street-mongrel"]);
  assert.deepEqual(slotOf("east", "B", "?x=2&noeel=1"), ["original-dog", "dog-street-mongrel"]);
  assert.deepEqual(slotOf("east", "B", "?noeel=0"), ["giant-eel", "eel-river-ambusher"]);
  assert.deepEqual(slotOf("east", "B", "?qa=1&world=0"), ["giant-eel", "eel-river-ambusher"]);
});

test("the eel is a native-skeleton salamander-rig animal with an ambush recipe", () => {
  assert.equal(rigOfSpecies("eel"), "giant-eel");
  assert.equal(rigText("giant-eel", "brain"), "dog");
  assert.equal(rigText("giant-eel", "biteMove"), "salamander");
  assert.equal(rigCapability("giant-eel", "nativeSkeleton"), true);
  assert.equal(rigCapability("giant-eel", "fireBreath"), false, "no breath: the eel only bites");
  assert.equal(rigCapability("giant-eel", "tutorialHunt"), false, "never the tutorial's route target");
  const found = creatureCatalogue.forRecipe("eel-river-ambusher");
  assert.equal(found.runtimeIdentity, "giant-eel");
  assert.equal(found.stats.weapon, "teeth");
});

function glb(file) {
  const d = fs.readFileSync(file);
  const len = d.readUInt32LE(12);
  return { json: JSON.parse(d.subarray(20, 20 + len).toString("utf8")), bytes: d };
}
const joints = (j) => j.skins[0].joints.map((i) => j.nodes[i].name).sort();
const clips = (j) => Object.fromEntries(j.animations.map((a) => [a.name, Math.max(...a.samplers.map((s) => j.accessors[s.input].max[0]))]));

test("the eel GLB is the salamander rig: same joints and clip durations, one skinned mesh, phone budget", () => {
  const manifest = read("assets/manifest-hollow.json");
  const row = manifest.models["giant-eel"];
  const eel = glb(new URL("../public/assets/" + row.url, import.meta.url)),
    sal = glb(new URL("../public/assets/" + manifest.models["giant-salamander"].url, import.meta.url));
  assert.equal(row.bytes, eel.bytes.length);
  assert.equal(row.sha256, createHash("sha256").update(eel.bytes).digest("hex"));
  assert(row.bytes < 600 * 1024, "GLB under 600 KB");
  assert.deepEqual(joints(eel.json), joints(sal.json));
  assert.deepEqual(clips(eel.json), clips(sal.json));
  assert.deepEqual(row.clips, manifest.models["giant-salamander"].clips);
  assert.equal(row.motion, "salamander");
  assert.equal(eel.json.meshes.length, 1);
  assert.equal(eel.json.nodes.find((n) => n.mesh === 0).name, "world-raw", "the bite contact reads the mesh named world-raw");
  const tris = eel.json.meshes[0].primitives.reduce((n, p) => n + eel.json.accessors[p.indices].count / 3, 0);
  assert(tris < 8000, `triangles ${tris}`);
  assert(eel.json.images.every((i) => i.mimeType === "image/webp"));
  assert(eel.json.images.length <= 3, "albedo, ORM and normal only");
  // Every contact vertex the bite uses must exist in the mesh.
  const count = eel.json.accessors[eel.json.meshes[0].primitives[0].attributes.POSITION].count;
  for (const { mesh, vertex } of row.contact.canines) {
    assert.equal(mesh, "world-raw");
    assert(Number.isInteger(vertex) && vertex >= 0 && vertex < count, `canine vertex ${vertex}`);
  }
});
