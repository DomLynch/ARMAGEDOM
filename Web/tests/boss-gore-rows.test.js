import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FINISHER_DATA } from "../src/engine/finisher-data.js";

// Every area boss body needs a gore anatomy row keyed on its model, or a lethal hit leaves no wound (createFinisherGore returns null).
const content = JSON.parse(readFileSync(new URL("../public/world/area-content.json", import.meta.url), "utf8"));
const bossModels = [...new Set(Object.values(content.bosses.profiles).map((p) => p.modelRef))];

test("every area boss model has a gore anatomy row naming bones its GLB really has", () => {
  assert.equal(bossModels.length, 7);
  for (const model of bossModels) {
    const row = FINISHER_DATA.gore.rigs.find((r) => r.id === model);
    assert(row, `${model} has no gore row`);
    const glb = readFileSync(new URL(`../public/assets/bosses/${model}.glb`, import.meta.url)),
      gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString().trim()),
      names = new Set(gltf.nodes.map((n) => n.name?.replace(":", "")));
    for (const bone of [...row.bodyBones, ...row.headBones]) assert(names.has(bone), `${model}: ${bone}`);
  }
});
