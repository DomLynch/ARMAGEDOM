import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { clusterIndex, createActorLod, lodOn, validateActorLod } from "../src/engine/actor-lod.js";
import { hostileSceneProblems } from "../src/engine/render-budget.js";

const rules = GAME_DATA.offscreenActors.lod;
// A flat 40 x 40 grid of quads (3200 triangles), 1 cm apart, like a body patch.
const grid = () => {
  const g = new THREE.PlaneGeometry(0.39, 0.39, 39, 39);
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(g.attributes.position.count * 4), 4));
  return g;
};
const tris = (g) => g.index.count / 3;
const actor = (rig = "hollow-scavenger") => {
  const model = new THREE.Group(),
    body = new THREE.Mesh(grid(), new THREE.MeshBasicMaterial()),
    eyes = new THREE.Mesh(grid(), new THREE.MeshBasicMaterial());
  eyes.name = "PhotoEyes";
  model.add(body, eyes);
  const root = new THREE.Group();
  root.add(model);
  return { body, eyes, view: { root, model, motion: {}, entity: { rig, hp: 10 } }, full: body.geometry };
};

test("the lod data validates and bad rows are refused", () => {
  validateActorLod(rules);
  for (const bad of [
    { ...rules, extra: 1 },
    { ...rules, levels: [{ distance: 5, cell: 0.03, hide: [] }, { distance: 3, cell: 0.05, hide: [] }] },
    { ...rules, levels: [{ distance: 5, cell: 0, hide: [] }] },
    { ...rules, enabled: 1 },
    { ...rules, minTriangles: 0 },
  ])
    assert.throws(() => validateActorLod(bad));
});

test("clustering thins the index over the same vertices and never moves a vertex", () => {
  const g = grid(),
    index = clusterIndex(g.attributes.position, g.index, 0.03);
  assert.ok(index.length / 3 < tris(g) / 4, "a 3 cm cell on a 1 cm grid keeps well under a quarter of the triangles");
  assert.ok(index.every((i) => i < g.attributes.position.count));
  assert.equal(clusterIndex(g.attributes.position, g.index, 0.0001), null, "a cell finer than the mesh saves nothing");
});

test("a far actor draws a thinned shared geometry, hides detail parts, and a near one gets full detail back", () => {
  const lod = createActorLod(rules),
    a = actor(),
    b = actor();
  b.body.geometry = a.full; // two actors cloned from one source share the geometry
  b.view.model.children[0].geometry = a.full;
  lod.update(a.view, rules.levels[0].distance + rules.hysteresisMetres + 0.1);
  assert.ok(tris(a.body.geometry) < tris(a.full), "level 1 thins");
  assert.equal(a.body.geometry.attributes.position, a.full.attributes.position, "the vertex buffer is shared");
  lod.update(a.view, rules.levels[1].distance + rules.hysteresisMetres + 0.1);
  const far = a.body.geometry;
  assert.equal(a.eyes.visible, false, "eyes are hidden at the far level");
  lod.update(b.view, 20);
  assert.equal(b.body.geometry, far, "the thinned geometry is built once and shared");
  lod.update(a.view, 1);
  assert.equal(a.body.geometry, a.full);
  assert.equal(a.eyes.visible, true);
});

test("hysteresis: an actor hovering at a switch distance does not flip every frame", () => {
  const lod = createActorLod(rules),
    a = actor(),
    edge = rules.levels[0].distance;
  lod.update(a.view, edge + rules.hysteresisMetres + 0.01);
  assert.equal(a.view.lodLevel, 1);
  for (const d of [edge + 0.2, edge, edge - 0.2, edge + 0.3]) {
    lod.update(a.view, d);
    assert.equal(a.view.lodLevel, 1, `still level 1 at ${d}`);
  }
  lod.update(a.view, edge - rules.hysteresisMetres - 0.01);
  assert.equal(a.view.lodLevel, 0);
});

test("a dead actor is restored to full detail by the sweep, and the restore hook serves finisher preparation", () => {
  const lod = createActorLod(rules),
    a = actor();
  lod.update(a.view, 30);
  assert.notEqual(a.body.geometry, a.full);
  a.view.lodRestore();
  assert.equal(a.body.geometry, a.full);
  lod.update(a.view, 30);
  a.view.entity.hp = 0;
  lod.sweep();
  assert.equal(a.body.geometry, a.full);
  assert.equal(a.eyes.visible, true);
  assert.equal(a.view.lodRestore, null);
});

test("other rigs, a switched-off lod and ?lod=0 leave the actor untouched", () => {
  const lod = createActorLod(rules),
    rat = actor("original-rat");
  lod.update(rat.view, 30);
  assert.equal(rat.body.geometry, rat.full);
  const off = createActorLod({ ...rules, enabled: false }),
    a = actor();
  off.update(a.view, 30);
  assert.equal(a.body.geometry, a.full);
  assert.equal(lodOn(rules, "?lod=0"), false);
  assert.equal(lodOn(rules, "?qa=1"), true);
});

test("the hostile-scene budget is pinned at the measured numbers and fails loudly above them", () => {
  const budget = GAME_DATA.renderBudget.hostileScene;
  // Measured on the Mac M5 (real GPU, 375x812@2, p95 frame) with the LOD on: 174 draw calls and 298022 triangles. Before: 190 and 614158.
  assert.deepEqual(hostileSceneProblems({ hostiles: 10, drawCalls: 174, triangles: 298022 }), []);
  assert.match(hostileSceneProblems({ hostiles: 10, drawCalls: 190, triangles: 614158 })[0], /614158 triangles, budget/);
  assert.match(hostileSceneProblems({ hostiles: 10, drawCalls: budget.maxDrawCalls + 1, triangles: 1 })[0], /draw calls/);
  assert.match(hostileSceneProblems({ hostiles: 3, drawCalls: 1, triangles: 1 })[0], /needs a measurement/);
});
