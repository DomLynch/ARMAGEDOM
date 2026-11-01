import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";

const models = JSON.parse(fs.readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")).models;

test("the earned cleaver dresses the Perseus body; the donor warrior stays on its own row for remote players", () => {
  const { equipment, deferred, ...body } = models["vagrant-cleaver"],
    { equipment: knife, ...player } = models.vagrant;
  assert.equal(deferred, true);
  assert.equal(equipment.url, "weapons/pitborn-cleaver-phone.glb");
  assert.equal(equipment.node, knife.node);
  assert.equal(equipment.mount, knife.mount);
  for (const key of ["url", "sha256", "scale", "knifeGripDegrees", "handBone", "clips", "bodyContact"])
    assert.deepEqual(body[key], player[key], key);
  assert.equal(models["donor-warrior-cleaver"].url, "donor/warrior-phone.glb");
  assert.equal(models["donor-warrior-cleaver"].deferred, true);
  const rigs = GAME_DATA.physicsRigs.models;
  assert.deepEqual(rigs["vagrant-cleaver"], rigs.vagrant);
  assert.equal(rigs["donor-warrior-cleaver"].body, "scavenger-65");
});
