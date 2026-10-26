import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createArcBolts } from "../src/engine/arc-bolt-view.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// The bolt is camera-facing ribbons in one pooled mesh: the core is coreWidth screen pixels wide, the glow haloWidth, whatever the
// distance, and the whole bolt costs one ribbon draw plus one sparks draw.
const data = GAME_DATA.visual.arcGun,
  width = 375,
  height = 667;

function setup() {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(42, width / height, 0.1, 60);
  camera.position.set(0, 7.5, 5.5);
  camera.lookAt(0, 0.8, -7);
  camera.updateMatrixWorld();
  const bolts = createArcBolts({ scene, data, camera, viewportHeight: () => height, seed: 3 });
  const links = [
    { from: { x: 0.3, y: 1.1, z: -0.2 }, to: { x: 0.2, y: 1, z: -3 }, targetId: 1, damage: 45 },
    { from: { x: 0.2, y: 1, z: -3 }, to: { x: -1.4, y: 1, z: -6 }, targetId: 2, damage: 34 },
    { from: { x: -1.4, y: 1, z: -6 }, to: { x: 1.2, y: 1, z: -8.6 }, targetId: 3, damage: 26 },
  ];
  return { scene, camera, bolts, links, mesh: bolts.root.children[0] };
}
const pixels = (camera, position, a, b) => {
  const project = (i) => new T.Vector3(position.getX(i), position.getY(i), position.getZ(i)).project(camera);
  const p = project(a),
    q = project(b);
  return Math.hypot(((p.x - q.x) * width) / 2, ((p.y - q.y) * height) / 2);
};

test("one ribbon mesh and one sparks object carry the whole chain", () => {
  const { bolts, links } = setup();
  bolts.fire(links, 0);
  bolts.update(0.08, 1 / 60);
  assert.equal(bolts.stats().drawObjects, 2);
  assert(bolts.stats().ribbonTriangles > 0);
  assert(bolts.stats().ribbonTriangles <= bolts.root.children[0].geometry.index.count / 3);
  bolts.dispose();
});

test("core and glow keep their pixel widths at any distance", () => {
  const { camera, bolts, links, mesh } = setup();
  bolts.fire(links.slice(0, 1), 0);
  bolts.update(0.001, 1 / 60);
  const position = mesh.geometry.attributes.position,
    points = data.jagSegments + 1,
    perStrip = points * 3,
    forkPoints = (data.forkSegments + 1) * 3,
    coreStart = perStrip + data.forks * forkPoints,
    mid = Math.floor(points / 2);
  const halo = pixels(camera, position, mid * 3, mid * 3 + 2),
    core = pixels(camera, position, coreStart + mid * 3, coreStart + mid * 3 + 2);
  assert(Math.abs(halo - data.haloWidth) / data.haloWidth < 0.2, `glow ${halo}px`);
  assert(Math.abs(core - data.coreWidth) / data.coreWidth < 0.2, `core ${core}px`);
  bolts.dispose();
});

test("a hop shows only after its delay, the bolt re-jags while it fades, and it is gone after boltSeconds", () => {
  const { bolts, links, mesh } = setup();
  bolts.fire(links, 0);
  bolts.update(data.boltSeconds * 0.1, 1 / 60);
  const one = bolts.stats().ribbonTriangles,
    early = [...mesh.geometry.attributes.position.array.slice(0, 30)];
  bolts.update(data.hopDelay * 2.5, 1 / 60);
  assert(bolts.stats().ribbonTriangles > one, "later hops join");
  bolts.update(data.boltSeconds * 0.9, 1 / 60);
  assert.notDeepEqual([...mesh.geometry.attributes.position.array.slice(0, 30)], early, "shape changed");
  bolts.update(data.boltSeconds + data.hopDelay * 3, 1 / 60);
  assert.equal(bolts.stats().ribbonTriangles, 0);
  for (let i = 0; i < Math.ceil(data.sparkSeconds * 60) + 1; i++) bolts.update(data.boltSeconds + 1 + i / 60, 1 / 60);
  assert.equal(bolts.stats().sparks, 0);
  assert.equal(bolts.root.visible, false);
  bolts.dispose();
});

test("stunned enemies get a crackle ribbon until the stun ends", () => {
  const { bolts } = setup(),
    actor = { pos: { x: 0, z: 3 }, hp: 10 };
  bolts.stun(actor, 0.6, 0);
  bolts.update(0.1, 1 / 60);
  assert(bolts.stats().ribbonTriangles > 0);
  bolts.update(0.7, 1 / 60);
  assert.equal(bolts.stats().ribbonTriangles, 0);
  bolts.stun(actor, 5, 1);
  actor.hp = 0;
  bolts.update(1.1, 1 / 60);
  assert.equal(bolts.stats().ribbonTriangles, 0);
  bolts.dispose();
});

test("disposing removes the group from the scene", () => {
  const { scene, bolts } = setup();
  assert.equal(scene.children.length, 1);
  bolts.dispose();
  assert.equal(scene.children.length, 0);
});
