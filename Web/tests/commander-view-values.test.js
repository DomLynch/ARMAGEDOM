import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { COMMANDER_VIEW } from "../src/engine/commander/view-data.js";

// Differential test: the Commander view's lights, rings, colours, opacities, heights, camera crop, pick padding and diagnostics are
// exactly what the inline numbers produced. The expected digest was recorded from the code before the numbers moved to
// commander.json `view` (UPDATE_COMMANDER_VIEW_DIGEST=1 rewrites it; only for an intended presentation change).
const source = fs
    .readFileSync(new URL("../src/engine/commander/view.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "")
    .replace("export async function createCommanderView", "async function createCommanderView"),
  digestPath = new URL("./fixtures/commander-view-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e9) / 1e9;

class FakeRenderer {
  constructor() {
    this.calls = [];
  }
  setPixelRatio(r) {
    this.calls.push(["pixelRatio", r]);
  }
  setSize(...a) {
    this.calls.push(["size", ...a]);
  }
  setAnimationLoop() {}
  render(scene) {
    this.calls.push(["render"]);
    this.scene = scene;
  }
  dispose() {}
}

function describe(object) {
  const material = object.material,
    parameters = object.geometry?.parameters;
  return {
    type: object.type,
    colour: object.color?.getHex?.() ?? material?.color?.getHex?.() ?? null,
    ground: object.groundColor?.getHex?.() ?? null,
    intensity: object.intensity ?? null,
    position: object.position.toArray().map(round),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(round),
    visible: object.visible,
    geometry: parameters ? Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, typeof v === "number" ? round(v) : v])) : null,
    opacity: material?.opacity ?? null,
    transparent: material?.transparent ?? null,
    depthWrite: material?.depthWrite ?? null,
    side: material?.side ?? null,
  };
}

async function snapshot() {
  const created = {};
  const unit = (id, x, z, hp = 10) => ({ id, team: "player", pos: { x, z }, hp });
  const state = (phase, selected, result = null) => ({
    time: 3.5,
    phase,
    result,
    selected,
    bolts: [],
    events: [],
    objective: { pos: { x: 12, z: -8 } },
    units: [unit("a", 10, -5), unit("b", 14, -9), unit("c", 11, -12, 0)],
    opponents: [{ id: "o1", team: "enemy", pos: { x: 20, z: -2 }, hp: 5 }],
  });
  const world = {
    dispose() {},
    calibrated: new THREE.Matrix4().makePerspective(-0.4, 0.4, 0.3, -0.3, 0.1, 100),
    masks: [],
    routeGuidance: { group: { visible: true } },
    geometry: { point: (p) => ({ x: p.x / 30, y: -p.z / 12 }) },
    toRender: (p, y = 0) => new THREE.Vector3(p.x, y, -p.z),
    screenToGround: (x, y) => ({ x, z: y }),
  };
  const views = new Map();
  const context = {
    T: { ...THREE, WebGLRenderer: FakeRenderer },
    createWorld: async () => world,
    loadActors: async () => ({ dispose() {} }),
    applyAreaLighting() {},
    createActors(scene, w, library, options) {
      created.actors = options;
      return {
        views,
        dispose() {},
        reset() {},
        events() {},
        update() {},
        async ensureAreaModels() {},
      };
    },
    createDroneLaserBolts: () => ({ dispose() {}, reset() {}, sync() {} }),
    posedActorBounds: (view) => (view ? view.box.clone() : null),
    COMMANDER_RULES: { captureRadius: 2.8 },
    COMMANDER_VIEW,
    devicePixelRatio: 3,
    innerWidth: 800,
    innerHeight: 450,
  };
  const create = vm.runInNewContext(`${source}\ncreateCommanderView`, context);
  const canvas = { clientWidth: 640, clientHeight: 400 };
  const view = await create({ canvas, baseUrl: "test/" });
  for (const id of ["a", "b", "o1"]) {
    const root = new THREE.Object3D();
    root.name = `view-${id}`;
    views.set(id, { root, box: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1)) });
  }
  const out = { actors: created.actors, routeGuidanceHidden: world.routeGuidance.group.visible === false };
  await view.prepare(state("capture", ["a"]));
  out.afterPrepare = {
    projection: Array.from(view.camera.projectionMatrix.elements, round),
    renderer: view.renderer.calls.filter((c) => c[0] !== "render"),
  };
  const frames = [];
  for (const s of [state("capture", ["a"]), state("defend", ["a", "b"]), state("defend", [], { winner: "player" })]) {
    view.render(s, 0.016);
    frames.push(sceneDigest(view));
  }
  out.frames = frames;
  out.pick = [
    view.pick(state("capture", []), 320, 200),
    view.pick(state("capture", []), 100, 100),
    view.pick(state("capture", []), 500, 300),
  ];
  out.diagnostics = JSON.parse(JSON.stringify(view.diagnostics(state("capture", []))));
  view.pan(0.05, -0.02);
  view.drag(10, 5);
  out.afterPan = Array.from(view.camera.projectionMatrix.elements, round);
  view.recentre(state("capture", []));
  out.afterRecentre = Array.from(view.camera.projectionMatrix.elements, round);
  out.project = [view.project({ x: 12, z: -8 }), view.ground(100, 100)];
  view.dispose();
  return JSON.parse(JSON.stringify(out));
}

// The scene is private to createCommanderView; the fake renderer keeps the one it was last asked to draw.
const sceneDigest = (view) => view.renderer.scene.children.map(describe);

test("Commander view presentation is value-identical to the pre-data code", async () => {
  const got = await snapshot();
  if (process.env.UPDATE_COMMANDER_VIEW_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
});
