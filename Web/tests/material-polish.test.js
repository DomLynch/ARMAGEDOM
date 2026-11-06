import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateQualityTier } from "../src/engine/game-data-quality.js";
import { createQualityTier } from "../src/engine/quality-tier.js";
import { createMaterialPolish } from "../src/engine/material-polish.js";

const rules = GAME_DATA.qualityTier;
const polishRule = rules.materialPolish;
const desktop = { cores: 16, memoryGb: 16, textureSize: 16384, touchPoints: 0 };
const iphone = { cores: 6, textureSize: 16384, touchPoints: 5 };
const tablet = { cores: 8, memoryGb: 8, textureSize: 16384, touchPoints: 5 };

function source() {
  const map = new THREE.Texture();
  map.anisotropy = 1;
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.05, metalness: 1 });
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  return { gltf: { scene }, material, map };
}

test("the polish data validates and bad rows are refused", () => {
  validateQualityTier(rules);
  const tiers = rules.tiers;
  for (const bad of [
    { ...rules, materialPolish: { ...polishRule, extra: 1 } },
    { ...rules, materialPolish: { ...polishRule, anisotropy: 0 } },
    { ...rules, materialPolish: { ...polishRule, anisotropy: 32 } },
    { ...rules, materialPolish: { ...polishRule, roughnessMin: 2 } },
    { ...rules, materialPolish: { ...polishRule, param: rules.param } },
    { ...rules, materialPolish: { ...polishRule, needs: [{ name: "cores", whenMissing: false }] } },
    { ...rules, tiers: [tiers[0], { ...tiers[1], materialPolish: true }, tiers[2]] },
    { ...rules, tiers: [{ ...tiers[0], materialPolish: "yes" }, tiers[1], tiers[2]] },
  ])
    assert.throws(() => validateQualityTier(bad));
});

test("only the top tier carries the polish and a phone-class tier never does", () => {
  assert.deepEqual(
    rules.tiers.map((t) => t.materialPolish),
    [true, false, false],
  );
});

test("a desktop on the full tier gets the rule once the probe lands; phones and tablets never do", () => {
  const q = createQualityTier(rules, "");
  assert.equal(q.materialPolish(), null, "nothing before the probe");
  q.probe(desktop);
  assert.equal(q.materialPolish(), polishRule);
  for (const device of [
    iphone,
    tablet,
    { ...desktop, touchPoints: 1 },
    { ...desktop, textureSize: 4096 },
    { ...desktop, cores: 4 },
  ]) {
    const p = createQualityTier(rules, "");
    p.probe(device);
    assert.equal(p.materialPolish(), null, JSON.stringify(device));
  }
});

test("?nopolish=1 turns it off and a forced mid or low tier never has it", () => {
  const off = createQualityTier(rules, `?${polishRule.param}=${polishRule.offValue}`);
  off.probe(desktop);
  assert.equal(off.materialPolish(), null);
  for (const name of ["mid", "low"]) {
    const q = createQualityTier(rules, `?${rules.param}=${name}`);
    q.probe(desktop);
    assert.equal(q.materialPolish(), null, name);
  }
});

test("polish raises anisotropy and clamps roughness and metalness only while the rule holds", () => {
  const q = createQualityTier(rules, "");
  const polish = createMaterialPolish(q);
  const { gltf, material, map } = source();
  polish.track(gltf);
  assert.equal(material.roughness, 0.05, "untouched before the probe");
  assert.equal(map.anisotropy, 1);
  q.probe(desktop);
  assert.equal(polish.active(), true);
  assert.equal(material.roughness, polishRule.roughnessMin);
  assert.equal(material.metalness, polishRule.metalnessMax);
  assert.equal(map.anisotropy, polishRule.anisotropy);
  const later = source();
  polish.track(later.gltf);
  assert.equal(later.material.roughness, polishRule.roughnessMin, "a file loaded after the probe is polished too");
});

test("a phone leaves every material and texture exactly as shipped", () => {
  const q = createQualityTier(rules, "");
  const polish = createMaterialPolish(q);
  const { gltf, material, map } = source();
  polish.track(gltf);
  q.probe(iphone);
  polish.track(gltf);
  assert.equal(polish.active(), false);
  assert.equal(material.roughness, 0.05);
  assert.equal(material.metalness, 1);
  assert.equal(map.anisotropy, 1);
});

test("a roughness already above the floor and an anisotropy already higher are kept", () => {
  const q = createQualityTier(rules, "");
  const polish = createMaterialPolish(q);
  const { gltf, material, map } = source();
  material.roughness = 0.7;
  material.metalness = 0.1;
  map.anisotropy = polishRule.anisotropy * 2;
  polish.track(gltf);
  q.probe(desktop);
  assert.equal(material.roughness, 0.7);
  assert.equal(material.metalness, 0.1);
  assert.equal(map.anisotropy, polishRule.anisotropy * 2);
});

test("a tier drop after the probe puts the original values back", () => {
  const q = createQualityTier(rules, "");
  const polish = createMaterialPolish(q);
  const { gltf, material, map } = source();
  polish.track(gltf);
  q.probe(desktop);
  assert.equal(map.anisotropy, polishRule.anisotropy);
  // a weak frame sample after the probe: two weak signals drop the tier to mid
  const weak = createQualityTier(rules, "");
  const weakPolish = createMaterialPolish(weak);
  const second = source();
  weakPolish.track(second.gltf);
  weak.probe({ ...desktop, memoryGb: 2, cores: 16 });
  assert.equal(weakPolish.active(), true);
  let ms = 0;
  weak.frame((ms += 1));
  for (let i = 0; i < rules.probe.warmupFrames + rules.probe.sampleFrames; i++)
    weak.frame((ms += rules.signals.find((s) => s.name === "frameMs").limit + 1));
  assert.equal(weak.row().name, rules.tiers[1].name);
  assert.equal(weakPolish.active(), false);
  assert.equal(second.material.roughness, 0.05);
  assert.equal(second.map.anisotropy, 1);
  assert.equal(material.metalness, polishRule.metalnessMax, "the first desktop is untouched by the second");
});
