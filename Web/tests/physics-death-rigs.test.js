// physicsRigs.json: which models ragdoll on death. The rows must match the real files (manifest, GLB bones), and the loader must never take a
// ragdoll from the pool for a model without a live row.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { physicsDeathStep, usePhysicsDeathImpl } from "../src/engine/physics-death.js";

const RIGS = GAME_DATA.physicsRigs,
  CFG = GAME_DATA.physicsDeath,
  manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")).models,
  glbNodes = (url) => {
    const b = readFileSync(new URL(`../public/assets/${url}`, import.meta.url));
    return new Set(JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()).nodes.map((n) => n.name));
  };

test("every row names a manifest model, a rig family and a body, and the part map is the 20 ragdoll parts", () => {
  for (const [name, m] of Object.entries(RIGS.models)) {
    assert.ok(manifest[name], `${name} is a manifest model`);
    const parts = RIGS.rigs[m.rig].parts === "physicsDeath.parts" ? CFG.parts : RIGS.rigs[m.rig].parts;
    assert.deepEqual(Object.keys(parts).sort(), Object.keys(CFG.parts).sort(), `${name} maps the same 20 part ids`);
  }
});

test("every bone a row maps exists in the model's GLB (no ragdoll can die on a missing bone)", () => {
  for (const [name, m] of Object.entries(RIGS.models)) {
    const family = RIGS.rigs[m.rig],
      parts = family.parts === "physicsDeath.parts" ? CFG.parts : family.parts,
      nodes = glbNodes(manifest[name].url);
    for (const [part, joint] of Object.entries(parts))
      assert.ok(nodes.has(family.nodePrefix + joint), `${name} has ${family.nodePrefix + joint} for ${part}`);
  }
});

test("body rows hold the 20 joints and a standing height; the baked scale matches the manifest scale", () => {
  for (const [name, m] of Object.entries(RIGS.models)) {
    if (m.body === "physicsBody") continue;
    const row = RIGS.bodies[m.body];
    assert.equal(Object.keys(row.joints).length, 20);
    assert.ok(row.height_m > 1 && row.height_m < 3, `${m.body} height ${row.height_m}`);
    assert.equal(row.scale_baked, manifest[name].scale, `${name} uses a body baked at its manifest scale`);
  }
});

test("only the marked hunter is live until the impl reads the rig record", () => {
  assert.deepEqual(
    Object.entries(RIGS.models)
      .filter(([, m]) => m.live)
      .map(([n]) => n),
    [CFG.rigRef],
  );
});

test("a model without a live row keeps the baked clip and never reaches the impl", () => {
  const calls = [];
  usePhysicsDeathImpl({ startDeath: (...a) => calls.push(a), stepDeath: () => {} });
  const description = manifest["hollow-scavenger"],
    library = { models: new Map([["hollow-scavenger", { description, gltf: { scene: {} } }]]) },
    view = { description },
    entity = { id: 3, hp: 0, maxHP: 10 };
  for (let i = 0; i < 5; i++) assert.equal(physicsDeathStep(view, entity, library, 1 / 60, true), false);
  assert.equal(calls.length, 0);
  assert.equal(view.physicsDeath, undefined);
  // no description at all
  assert.equal(physicsDeathStep({ physicsDeath: undefined }, { id: 4, hp: 0, maxHP: 10 }, library, 1 / 60, true), false);
});

test("the marked hunter still starts its ragdoll, and the impl gets the rig record", () => {
  const calls = [],
    handle = { frozen: false };
  usePhysicsDeathImpl({ startDeath: (...a) => (calls.push(a), handle), stepDeath: () => {} });
  const scene = {},
    library = { models: new Map([[CFG.rigRef, { gltf: { scene } }]]) },
    view = {},
    entity = { id: 5, markedHunter: true, hp: 0, maxHP: 10 };
  assert.equal(physicsDeathStep(view, entity, library, 1 / 60, true), true);
  assert.equal(calls.length, 1);
  const [v, bind, e, rig] = calls[0];
  assert.equal(v, view);
  assert.equal(bind, scene);
  assert.equal(e, entity);
  assert.equal(rig.model, CFG.rigRef);
  assert.equal(rig.nodePrefix, GAME_DATA.physicsBody.nodePrefix);
  assert.equal(rig.parts, CFG.parts);
  assert.equal(rig.body, GAME_DATA.physicsBody.row);
});

test("a living actor costs the loader nothing", () => {
  usePhysicsDeathImpl({ startDeath: () => assert.fail("a living actor must not start a death"), stepDeath: () => {} });
  assert.equal(physicsDeathStep({}, { id: 6, hp: 5, maxHP: 10 }, {}, 1 / 60, true), false);
});
