// A boss that dies by ragdoll lies ON the floor, not in it. The capsules of a body row cannot be as thick as plate armour, a cape or a skirt (the
// role table caps a radius at a fraction of its bone), so the skinned mesh of warden, veteran and knight used to end 0.15 to 0.26 m (unscaled) below
// the floor with the capsules resting on it. The corpse is seated on the floor from data/physicsFloor.json: the lowest points of the skin per bone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { loadGeometryOnly } from "../tools/glb-geometry-only.js";
import { bossSettle } from "./helpers/boss-floor-trace.js";

const FLOOR = GAME_DATA.physicsFloor,
  BOSSES = ["boss-warden", "boss-area8-veteran", "boss-area7-knight", "boss-butcher"],
  SEEN_SINK_M = 0.03, // 3 cm of world space: a boot sole or a plate edge may touch the ground, a hand's width of armour in it is the bug
  manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")).models;

for (const model of BOSSES)
  test(`${model}: the skin lies on the floor after the ragdoll settles, and stays there once the body is freed`, async () => {
    const { rest, settled, later, scale } = await bossSettle(model, { afterSeconds: GAME_DATA.physicsDeath.removeSeconds });
    assert.ok(rest.y > -SEEN_SINK_M, `${model} stands on the floor before it falls (${rest.y.toFixed(3)} m)`);
    assert.ok(settled.y > -SEEN_SINK_M, `${model} settled ${(-settled.y / scale).toFixed(3)} m (unscaled) in the floor, at ${settled.mesh}`);
    assert.ok(later.y > -SEEN_SINK_M, `${model} freed: ${(-later.y / scale).toFixed(3)} m (unscaled) in the floor, at ${later.mesh}`);
  });

test("a corpse is never lifted off the floor: the skin touches it", async () => {
  for (const model of BOSSES) {
    const { settled } = await bossSettle(model);
    assert.ok(settled.y < SEEN_SINK_M, `${model} hovers ${settled.y.toFixed(3)} m above the floor`);
  }
});

test("the floor table names only models that ragdoll live, bones the GLB has, and points that are numbers", async () => {
  assert.deepEqual(Object.keys(FLOOR.models).sort(), [...BOSSES].sort());
  for (const [model, bones] of Object.entries(FLOOR.models)) {
    assert.equal(GAME_DATA.physicsRigs.models[model].live, true, model);
    const gltf = await loadGeometryOnly(new URL(`../public/assets/${manifest[model].url}`, import.meta.url)),
      have = new Set();
    gltf.scene.traverse((o) => o.isBone && have.add(o.name));
    for (const [bone, points] of Object.entries(bones)) {
      assert.ok(have.has(bone), `${model} has bone ${bone}`);
      assert.ok(points.length > 0 && points.every((p) => p.length === 3 && p.every(Number.isFinite)), `${model}.${bone} points`);
    }
  }
});
