import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createFlameEffect } from "../src/engine/flame-effect.js";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import { FLAME_VISUAL_DATA as DATA } from "../src/engine/flame-data.js";

test("flame-effect.js numbers live in visual.json and equal the old inline ones (19 to 0)", () => {
  assert.deepEqual(GAME_DATA.visual.flameEffect, {
    texture: { falloffPower: 1.6, peakAlpha: 240 },
    alphaTest: 0.01,
    renderOrder: 2,
    cyclesPerSecond: 4,
    floorClearance: 0.02,
    spread: { radiusShare: 0.55, jitterRate: 19.3 },
    phaseClamp: [0.03, 0.97],
    corpseDeathFallbackSeconds: 2.4,
    burnSurface: { maxOffset: 0.8, defaultRadius: 0.4, margin: 0.05 },
    burnWisp: { spacing: 0.24, baseHeight: 0.13, wobbleRate: 14, wobbleHeight: 0.08 },
  });
});

test("the emitter puffs sit exactly where the old inline formula put them, and the falloff texture is unchanged", () => {
  const scene = new THREE.Scene(),
    world = { areaId: "area8", camera: new THREE.PerspectiveCamera(), lineClear: () => true },
    range = 3,
    coneDegrees = 40,
    source = { position: { x: 1, y: 1.2, z: 0.6 }, direction: { x: 0, y: 0, z: 1 } },
    game = {
      world: { flameData: { contact: { range, coneDegrees } } },
      player: { hp: 100, pos: { x: 0, z: 0 } },
      flame: { equipped: true, active: true },
      time: 0.37,
      enemies: [],
      corpses: [],
      finished: false,
    },
    effect = createFlameEffect({ THREE, scene, world, getSource: () => source, cosmeticBurn: false }),
    mesh = scene.children.find((c) => c.isInstancedMesh);
  effect.update(game);
  assert.ok(effect.snapshot().emitterParticles > 0);
  // The old formula, with its literals.
  const direction = new THREE.Vector3(0, 0, 1),
    up = new THREE.Vector3(0, 1, 0),
    u = new THREE.Vector3().crossVectors(direction, up).normalize(),
    v = new THREE.Vector3().crossVectors(u, direction).normalize();
  let compared = 0;
  for (let i = 0; i < DATA.emitterCount; i++) {
    const phase = (game.time * 4 + i / DATA.emitterCount) % 1,
      distance = range * phase,
      theta = i * 2.399963229728653,
      radius = Math.tan((coneDegrees * Math.PI) / 360) * distance * 0.55,
      radial = Math.sin(i * 19.3) * radius,
      x = source.position.x + direction.x * distance + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * radial,
      y = source.position.y + direction.y * distance + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * radial,
      z = source.position.z + direction.z * distance + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * radial,
      m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    const at = new THREE.Vector3().setFromMatrixPosition(m),
      scale = new THREE.Vector3().setFromMatrixScale(m);
    if (scale.x === 0) continue;
    // The instance matrices are Float32, so compare to single precision.
    assert.ok(Math.abs(at.x - x) < 1e-5 && Math.abs(at.y - y) < 1e-5 && Math.abs(at.z + z) < 1e-5, `puff ${i}`);
    const width =
      (DATA.emitterWidth[0] + DATA.emitterWidth[1] * phase) * Math.sin(Math.PI * Math.max(0.03, Math.min(0.97, phase)));
    assert.ok(width > 0 && scale.x <= width + 1e-5);
    compared++;
  }
  assert.ok(compared >= 8, "enough puffs compared");
  const texture = mesh.material.map.image.data,
    size = DATA.textureSize;
  for (const [x, y] of [[0, 0], [16, 16], [8, 20], [31, 5]]) {
    const r = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2));
    assert.equal(texture[(y * size + x) * 4 + 3], Math.round(Math.max(0, 1 - r) ** 1.6 * 240));
  }
  assert.equal(mesh.material.alphaTest, 0.01);
  effect.dispose();
});

test("the flameEffect validator rejects bad rows", () => {
  const raw = () => JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url)));
  assert.doesNotThrow(() => validateVisual(raw()));
  for (const mutate of [
    (f) => (f.extra = 1),
    (f) => (f.texture.peakAlpha = 300),
    (f) => (f.alphaTest = 1),
    (f) => (f.phaseClamp = [0.9, 0.1]),
    (f) => (f.phaseClamp = [0.03]),
    (f) => delete f.burnWisp,
    (f) => (f.corpseDeathFallbackSeconds = 0),
  ]) {
    const d = raw();
    mutate(d.flameEffect);
    assert.throws(() => validateVisual(d));
  }
});
