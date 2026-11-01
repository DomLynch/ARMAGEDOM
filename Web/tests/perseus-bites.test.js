// Animal bites against the ?player=perseus body: the bite receivers are built from the 106-rig body's own bones and skinned meshes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createActors } from "../src/actors.js";
import { createBodyContact } from "../src/body-contact.js";
import { disposeActorSources } from "../src/actor-resources.js";
import { createRatBiteReceiver } from "../src/rat-contact.js";
import { sanitizeBoneName } from "../src/rig-bones.js";
import { createGame, stepGame } from "../src/combat.js";
import { createHollowEncounter } from "../src/hollow-encounter.js";
import { salamanderFixture } from "./helpers/salamander-fixture.js";
import { wolfFixture } from "./helpers/wolf-fixture.js";

const base = new URL("../public/assets/", import.meta.url),
  manifest = JSON.parse(fs.readFileSync(new URL("manifest-hollow.json", base))),
  creatures = JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))),
  swap = { model: "vagrant", use: "vagrant", fields: ["bodyContact"] },
  spec = manifest.models.vagrant.bodyContact,
  read = (description) => loadGeometry(fs.readFileSync(new URL(description.url, base)));

// The manifest as shipped: the player row is the Perseus body.
const swapped = () => structuredClone(manifest);
async function dress(names) {
  const dressed = swapped(),
    models = new Map();
  for (const name of names) {
    const d = dressed.models[name];
    models.set(name, { description: d, gltf: await read(d), equipment: d.equipment ? await read(d.equipment) : null });
  }
  return { dressed, models };
}
const dispose = (models) => disposeActorSources(new Set([...models.values()].flatMap((r) => [r.gltf, r.equipment].filter(Boolean))));
function withDocument(t) {
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
  };
  t.after(() => (old === undefined ? delete globalThis.document : (globalThis.document = old)));
}
function stage(world) {
  const scene = new T.Scene();
  Object.assign(world, { scene, camera: new T.PerspectiveCamera(), toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z) });
  return scene;
}
async function body() {
  const gltf = await read(manifest.models[swap.use]);
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}
function weightOn(mesh, i, names) {
  let sum = 0;
  for (let j = 0; j < 4; j++)
    if (names.has(sanitizeBoneName(mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i, j)].name)))
      sum += mesh.geometry.attributes.skinWeight.getComponent(i, j);
  return sum;
}

test("the Perseus row names its contact bones as data and the hero player row names none", () => {
  assert.ok(swap.fields.includes("bodyContact"));
  assert.equal(manifest.models["remote-survivor"].bodyContact, undefined, "other players keep the hero contact faces");
  assert.deepEqual(swapped().models[swap.model].bodyContact, spec);
  for (const [rig, row] of Object.entries(creatures.rigCapabilities))
    if (row.lowStrike && row.species !== "drone") assert.ok(spec.parts[row.contactPart], rig + " names a part the body has");
});

test("every receiver and goal part builds faces from the real perseus-106.glb, on the named bones", async () => {
  const scene = await body(),
    contact = createBodyContact(scene, spec),
    skinned = [];
  scene.traverse((o) => o.isSkinnedMesh && skinned.push(o.name));
  assert.deepEqual(skinned.sort(), ["Ch42__Eyelashes", "Steel"]);
  for (const part of Object.keys(spec.parts)) {
    const faces = contact.goalFaces(part),
      names = new Set(spec.parts[part].flat().map(sanitizeBoneName));
    assert.ok(faces.length > 0, part);
    for (const f of faces) {
      const mesh = scene.getObjectByName(f.runtimeName);
      assert.ok(f.vertices.every((i) => weightOn(mesh, i, names) >= spec.weightMin), part + " face sits on its own bones");
      assert.deepEqual(f.vertices, [0, 1, 2].map((k) => mesh.geometry.index.getX(f.face * 3 + k)));
    }
  }
  for (const kind of Object.keys(spec.receivers)) {
    const bindings = contact.bindings(kind);
    assert.ok(bindings.length > 0 && bindings.every((b) => b.faceBindings.length > 0), kind);
    assert.ok(createRatBiteReceiver(scene, bindings), kind + " receiver builds (topology and skin weights check out)");
  }
  const count = (kind) => contact.bindings(kind).reduce((n, b) => n + b.faceBindings.length, 0);
  assert.ok(count("dog") > count("foot"), "the dog receiver reaches the thigh as well");
  assert.ok(contact.footPoints(spec.footPart, 0.85).length > 0);
  assert.throws(() => contact.goalFaces("wing"), /no part/);
  assert.throws(() => contact.bindings("giraffe"), /no receiver/);
});

test("a tooth swept through a calf face hits the posed receiver, and one far away does not", async () => {
  const scene = await body(),
    contact = createBodyContact(scene, spec),
    receiver = createRatBiteReceiver(scene, contact.bindings("salamander")),
    [face] = contact.goalFaces("calf"),
    mesh = scene.getObjectByName(face.runtimeName);
  mesh.skeleton.update();
  const [a, b, c] = face.vertices.map((i) => mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld)),
    centre = a.clone().add(b).add(c).multiplyScalar(1 / 3),
    normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(),
    pose = receiver.capture(),
    across = (at) => receiver.sweep(pose, pose, at.clone().addScaledVector(normal, -0.05).toArray(), at.clone().addScaledVector(normal, 0.05).toArray());
  assert.ok(across(centre).hit, "a tooth crossing the face registers");
  assert.ok(!across(centre.clone().add(new T.Vector3(5, 5, 5))).hit, "a tooth far from the body misses");
});

test("a salamander bites the Perseus player in Westminster, and the knife hurts it back", async (t) => {
  withDocument(t);
  const { dressed, models } = await dress(["vagrant", "giant-salamander"]);
  t.after(() => dispose(models));
  const { g, world } = salamanderFixture(),
    e = g.enemies.find((x) => x.rig === "giant-salamander");
  g.enemies = [e];
  g.player.pos = { x: e.home.x + 0.1273, z: e.home.z - 2.6 };
  g.player.facing = { x: 0, z: 1 };
  e.facing = { x: 0, z: -1 };
  e.alerted = true;
  const actors = createActors(stage(world), world, { manifest: dressed, models, dispose() {} }, { visualScale: 1.3225 });
  t.after(() => actors.dispose());
  actors.update(g, 0);
  g.ratContact = actors.ratContact();
  assert.ok(g.ratContact, "a swapped body gets a contact object, not null");
  const hp = g.player.hp;
  for (let i = 0; i < 900 && g.player.hp === hp; i++) {
    stepGame(g, {}, 1 / 60, { bossFlameSource: (x) => actors.flameSource(x.id) });
    actors.update(g, 1 / 60);
  }
  assert.ok(g.player.hp < hp, "the salamander's attack lands on the Perseus body");
  const goal = g.ratContact.calf(g, e);
  assert.ok(goal && [goal.x, goal.y, goal.z].every(Number.isFinite), "it reaches for a goal on the Perseus calf");
  assert.ok(goal.y > 0 && goal.y < 1, "at calf height in metres above the floor");
  assert.ok(actors.views.get(0).salamanderReceiver);
  const hpE = e.hp;
  for (let i = 0; i < 600 && e.hp === hpE; i++) {
    const d = { x: e.pos.x - g.player.pos.x, z: e.pos.z - g.player.pos.z };
    stepGame(g, { actions: ["slash"], aim: d, move: Math.hypot(d.x, d.z) > 1 ? d : { x: 0, z: 0 } }, 1 / 60, {
      bossFlameSource: (x) => actors.flameSource(x.id),
    });
    actors.update(g, 1 / 60);
  }
  assert.ok(e.hp < hpE, "the Perseus knife reaches the salamander through the same receivers");
});

test("a wolf bites the Perseus player through the torso receiver", async (t) => {
  withDocument(t);
  const { dressed, models } = await dress(["vagrant", "original-wolf"]);
  t.after(() => dispose(models));
  const f = wolfFixture();
  f.restore();
  const g = f.g,
    e = g.enemies.find((x) => x.rig === "original-wolf");
  g.enemies = [e];
  g.player.pos = { x: e.home.x, z: e.home.z + 3.8 };
  g.player.facing = { x: 0, z: -1 };
  e.facing = { x: 0, z: 1 };
  const actors = createActors(stage(f.world), f.world, { manifest: dressed, models, dispose() {} }, { visualScale: 1.3225 });
  t.after(() => actors.dispose());
  actors.update(g, 0);
  g.ratContact = actors.ratContact();
  const hp = g.player.hp;
  for (let i = 0; i < 480 && g.player.hp === hp; i++) {
    stepGame(g, {}, 1 / 60);
    actors.update(g, 1 / 60);
  }
  assert.ok(g.player.hp < hp, "the wolf bite lands on the Perseus body");
  assert.ok(actors.views.get(0).wolfReceiver);
});

test("a rat bites the Perseus player's foot", async (t) => {
  withDocument(t);
  const { dressed, models } = await dress(["vagrant", "original-rat"]),
    world = {
      areaId: "east",
      layout: { characterScale: 1.265 },
      spawn: { x: 0, z: 0 },
      move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
      lineClear: () => true,
      geometry: { clear: () => true, lineClear: () => true },
      toRender: (p, h = 0) => new T.Vector3(p.x, h, -p.z),
    },
    encounter = createHollowEncounter({ rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 });
  t.after(() => dispose(models));
  const g = createGame(world, {
      pilot: "donor-knife",
      encounter,
      rat: true,
      pistol: true,
      supplies: true,
      finishers: true,
      areaResidents: true,
      openingGroup: false,
    }),
    rat = g.enemies.find((x) => x.rig === "original-rat");
  g.enemies = [rat];
  g.player.pos = { x: 0, z: 0 };
  g.player.facing = { x: 1, z: 0 };
  Object.assign(rat, { pos: { x: 0.8, z: 0 }, facing: { x: -1, z: 0 }, home: null, alerted: true, ready: 0 });
  const actors = createActors(new T.Scene(), world, { manifest: dressed, models, dispose() {} }, { visualScale: 1.3225 });
  t.after(() => actors.dispose());
  actors.update(g, 0);
  g.ratContact = actors.ratContact();
  const hp = g.player.hp;
  for (let i = 0; i < 400 && g.player.hp === hp; i++) {
    stepGame(g, {}, 1 / 60);
    actors.events(g);
    actors.update(g, 1 / 60, 0, { presentationDt: 1 / 60 });
  }
  assert.ok(g.player.hp < hp, "the rat bite lands on the Perseus body");
});
