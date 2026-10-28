// physicsRigs.json: which models ragdoll on death. The rows must match the real files (manifest, GLB bones), and the loader must never take a
// ragdoll from the pool for a model without a live row.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { physicsDeathStep, usePhysicsDeathImpl } from "../src/engine/physics-death.js";
import { liveBodies, rigOf } from "../src/engine/physics-rigs.js";

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

test("body rows hold the 20 joints and a standing height, UNSCALED (the actor root already applies the manifest scale)", () => {
  for (const [name, m] of Object.entries(RIGS.models)) {
    if (m.body === "physicsBody") continue;
    const row = RIGS.bodies[m.body];
    assert.equal(Object.keys(row.joints).length, 20);
    assert.ok(row.height_m > 1 && row.height_m < 3, `${m.body} height ${row.height_m}`);
    assert.equal(row.scale_baked, 1, `${name} uses a body measured at x1: a scaled row is scaled twice by the root`);
    assert.ok(row.source.endsWith(", x1"), `${name} row source says x1`);
  }
});

test("a body row's hip height above the toes equals the GLB's own bind pose at x1, not at the manifest scale", () => {
  const mul = (a, b) => Array.from({ length: 16 }, (_, k) => [0, 1, 2, 3].reduce((s, j) => s + a[j * 4 + (k % 4)] * b[(k >> 2) * 4 + j], 0)),
    local = (n) => {
      const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
      return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy,
        (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz,
        (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
    },
    up = (nodes, name) => { // bind-pose world height of a named node: the node matrices multiplied up the parent chain
      const parent = new Map(nodes.flatMap((n, i) => (n.children ?? []).map((c) => [c, i])));
      let i = nodes.findIndex((n) => n.name === name), m = local(nodes[i]);
      for (i = parent.get(i); i !== undefined; i = parent.get(i)) m = mul(local(nodes[i]), m);
      return m[13];
    };
  for (const [name, m] of Object.entries(RIGS.models)) {
    if (m.body === "physicsBody") continue;
    const b = readFileSync(new URL(`../public/assets/${manifest[name].url}`, import.meta.url)),
      nodes = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()).nodes,
      p = RIGS.rigs[m.rig].parts,
      hips = up(nodes, p.hips) - up(nodes, p.toeLeft);
    assert.ok(Math.abs(hips - RIGS.bodies[m.body].joints.Hips[1]) < 0.01, `${name} hips ${hips} vs row ${RIGS.bodies[m.body].joints.Hips[1]}`);
  }
});

test("the hunter and the crowd humans are live; no animal or drone has a row", () => {
  const live = Object.keys(RIGS.models).filter((n) => RIGS.models[n].live);
  for (const n of [CFG.rigRef, "hollow-scavenger", "hale-pitborn"]) assert.ok(live.includes(n), n);
  assert.equal(live.filter((n) => n.startsWith("boss-")).length, 7); // every humanoid boss
  for (const n of live) assert.ok(!manifest[n].rig.includes("original-") && !manifest[n].rig.startsWith("giant-"), n);
});

test("every live body row can be handed to the impl as its own record", () => {
  for (const n of Object.keys(RIGS.models).filter((n) => RIGS.models[n].live)) {
    const rig = rigOf(n);
    assert.equal(rig.model, n);
    assert.equal(Object.keys(rig.parts).length, 20);
    assert.equal(Object.keys(rig.body.joints).length, 20);
  }
  assert.deepEqual(liveBodies()[0].model, CFG.rigRef); // the hunter's pool is warmed first
  assert.equal(new Set(liveBodies().map((r) => r.key)).size, liveBodies().length);
});

test("a crowd human starts its ragdoll with its own bone map and body row", () => {
  const calls = [];
  usePhysicsDeathImpl({ startDeath: (...a) => (calls.push(a), { frozen: false }), stepDeath: () => {} });
  const description = manifest["hollow-scavenger"],
    scene = {},
    library = { models: new Map([["hollow-scavenger", { description, gltf: { scene } }]]) },
    view = { description };
  assert.equal(physicsDeathStep(view, { id: 8, hp: 0, maxHP: 10 }, library, 1 / 60, true), true);
  assert.equal(calls[0][1], scene);
  assert.equal(calls[0][3].nodePrefix, "");
  assert.equal(calls[0][3].parts.hips, "pelvis");
  assert.equal(calls[0][3].body, RIGS.bodies["scavenger-65"]);
});

test("a model without a live row keeps the baked clip and never reaches the impl", () => {
  const calls = [];
  usePhysicsDeathImpl({ startDeath: (...a) => calls.push(a), stepDeath: () => {} });
  const description = manifest["giant-salamander"],
    library = { models: new Map([["giant-salamander", { description, gltf: { scene: {} } }]]) },
    view = { description },
    entity = { id: 3, hp: 0, maxHP: 10 };
  for (let i = 0; i < 5; i++) assert.equal(physicsDeathStep(view, entity, library, 1 / 60, true), false);
  assert.equal(calls.length, 0);
  assert.equal(view.physicsDeath, undefined);
  // no description at all
  assert.equal(
    physicsDeathStep({ physicsDeath: undefined }, { id: 4, hp: 0, maxHP: 10 }, library, 1 / 60, true),
    false,
  );
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
