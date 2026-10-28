import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { modelGeometry } from "../src/engine/world-pickups-view.js";
import { WORLD_PICKUPS } from "../src/engine/world-pickups-core.js";

const looks = WORLD_PICKUPS.looks.ammoBox;
const names = Object.keys(looks);

test("the ammo pickup has three worn looks and the drawn one is a data field", () => {
  assert.deepEqual(names.sort(), ["bandolier", "carton", "crate"]);
  assert.ok(names.includes(WORLD_PICKUPS.look.ammoBox), "look.ammoBox names one of them");
});

test("every look builds, stays pickup-sized, and its scuffed parts vary in colour", () => {
  for (const name of names) {
    const g = modelGeometry(THREE, looks[name]);
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x <= 0.9 && size.z <= 0.7 && size.y <= 0.5, `${name} is ${size.toArray().map((n) => n.toFixed(2))}`);
    assert.ok(g.boundingBox.min.y >= -0.001, `${name} sits on the ground`);
    const colours = g.attributes.color.array;
    assert.ok(new Set(Array.from(colours.slice(0, 600), (c) => c.toFixed(3))).size > 40, `${name} paint is mottled, not flat`);
  }
});

test("a cartridge is a real-world slim: radius at most 2 cm in every look", () => {
  for (const name of names) for (const p of looks[name].filter((q) => q.shape === "cylinder")) assert.ok(p.size[0] <= 0.02, `${name} round ${p.size[0]}`);
});

test("the ground ring is thin and quiet", () => {
  const s = WORLD_PICKUPS.markers.style;
  assert.ok(s.ringOuter - s.ringInner <= 0.06, "thin ring");
  assert.ok(s.peakOpacity <= 0.4 && s.glowOpacity <= 0.2, "low opacity");
});
