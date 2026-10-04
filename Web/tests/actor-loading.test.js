import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadActors } from "../src/actors.js";

function resource() {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  scene.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  const disposed = { geometry: 0, material: 0, texture: 0 };
  for (const [name, item] of Object.entries({ geometry, material, texture })) {
    item.addEventListener("dispose", () => disposed[name]++);
  }
  return { gltf: { scene, animations: [] }, disposed };
}
function manifest(t, models) {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ models }),
  }));
}
const url = "https://example.test/game/";

test("donor selection owns its separate equipment and releases it on failed load", async (t) => {
  const hero = resource(),
    goblin = resource(),
    knife = resource();
  const fetched = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    fetched.push(String(path));
    return {
      ok: true,
      json: async () => ({
        pilot: "donor-knife",
        models: {
          vagrant: { url: "warrior.glb", equipment: { url: "knife.glb" } },
          goblin: { url: "goblin.glb" },
        },
      }),
    };
  });
  t.mock.method(GLTFLoader.prototype, "loadAsync", async (path) =>
    path.endsWith("warrior.glb")
      ? hero.gltf
      : path.endsWith("goblin.glb")
        ? goblin.gltf
        : knife.gltf,
  );
  const library = await loadActors(url, () => {}, "assets/donor/manifest.json");
  assert.equal(fetched[0], url + "assets/donor/manifest.json");
  assert.equal(library.complete, true);
  assert.equal(library.models.get("vagrant").equipment, knife.gltf);
  library.dispose();
  for (const asset of [hero, goblin, knife])
    assert.deepEqual(asset.disposed, { geometry: 1, material: 1, texture: 1 });

  const fresh = resource();
  GLTFLoader.prototype.loadAsync = async (path) => {
    if (path.endsWith("knife.glb")) throw Error("missing knife");
    return fresh.gltf;
  };
  await assert.rejects(
    loadActors(url, () => {}, "assets/donor/manifest.json"),
    /missing knife/,
  );
  assert.deepEqual(fresh.disposed, { geometry: 1, material: 1, texture: 1 });
});

test("library owns shared GLB resources and disposal is idempotent", async (t) => {
  manifest(t, { vagrant: { url: "hero.glb" }, orc: { url: "hero.glb" } });
  const asset = resource();
  const load = t.mock.method(
    GLTFLoader.prototype,
    "loadAsync",
    async () => asset.gltf,
  );
  const library = await loadActors(url);
  assert.equal(load.mock.callCount(), 1);
  assert.equal(typeof library.dispose, "function");
  library.dispose();
  library.dispose();
  assert.deepEqual(asset.disposed, { geometry: 1, material: 1, texture: 1 });
  assert.equal(library.models.size, 0);
});

test("failed load settles late resources, cleans them, and allows a clean retry", async (t) => {
  manifest(t, { vagrant: { url: "hero.glb" }, orc: { url: "enemy.glb" } });
  const late = resource();
  let finished = false;
  t.mock.method(GLTFLoader.prototype, "loadAsync", async (path) => {
    if (path.endsWith("enemy.glb")) throw new Error("missing enemy");
    await new Promise((resolve) => setImmediate(resolve));
    finished = true;
    return late.gltf;
  });
  await assert.rejects(loadActors(url), /missing enemy/);
  assert.equal(finished, true, "failure must wait for the late successful GLB");
  assert.deepEqual(late.disposed, { geometry: 1, material: 1, texture: 1 });
  const fresh = resource();
  GLTFLoader.prototype.loadAsync = async () => fresh.gltf;
  const retry = await loadActors(url);
  assert.equal(retry.models.size, 2);
  assert.deepEqual(fresh.disposed, { geometry: 0, material: 0, texture: 0 });
  retry.dispose();
  assert.deepEqual(fresh.disposed, { geometry: 1, material: 1, texture: 1 });
});

test("missing survivor and progress callback failures release completed models", async (t) => {
  const asset = resource();
  manifest(t, { orc: { url: "enemy.glb" } });
  t.mock.method(GLTFLoader.prototype, "loadAsync", async () => asset.gltf);
  await assert.rejects(loadActors(url), /Survivor export missing/);
  assert.deepEqual(asset.disposed, { geometry: 1, material: 1, texture: 1 });
  const next = resource();
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ models: { vagrant: { url: "hero.glb" } } }),
  });
  GLTFLoader.prototype.loadAsync = async () => next.gltf;
  await assert.rejects(
    loadActors(url, () => {
      throw new Error("progress failure");
    }),
    /progress failure/,
  );
  assert.deepEqual(next.disposed, { geometry: 1, material: 1, texture: 1 });
});

test("actor reset retains the library; disposal frees source resources", async (t) => {
  const { createActors } = await import("../src/actors.js");
  const gradient = { addColorStop() {} };
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => gradient,
        fillRect() {},
      }),
    }),
  };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  manifest(t, { vagrant: { url: "hero.glb", clips: {} } });
  const asset = resource();
  t.mock.method(GLTFLoader.prototype, "loadAsync", async () => asset.gltf);
  const library = await loadActors(url);
  const scene = new THREE.Scene();
  const world = {
    layout: {},
    toRender: ({ x, z }) => new THREE.Vector3(x, 0, -z),
  };
  const actors = createActors(scene, world, library);
  const player = {
    id: 0,
    kind: -1,
    pos: { x: 0, z: 0 },
    facing: { x: 0, z: 1 },
  };
  const game = { player, enemies: [], time: 0 };
  actors.update(game, 0);
  actors.reset();
  assert.equal(scene.children.length, 0);
  assert.equal(library.models.size, 1);
  assert.deepEqual(asset.disposed, { geometry: 0, material: 0, texture: 0 });
  actors.update(game, 0);
  actors.reset();
  delete library.models.get("vagrant").description.clips;
  asset.gltf.animations.push(new THREE.AnimationClip("Idle", 1, []));
  assert.throws(() => actors.update(game, 0));
  assert.equal(
    scene.children.length,
    0,
    "failed actor construction must leave no orphan meshes",
  );
  actors.dispose();
  assert.equal(scene.children.length, 0);
  assert.deepEqual(asset.disposed, { geometry: 1, material: 1, texture: 1 });
});

 test("equipment download starts before the body finishes decoding", async (t) => {
  manifest(t, { vagrant: { url: "hero.glb", equipment: { url: "knife.glb" } }, goblin: { url: "goblin.glb" } });
  let resolveHero; const pendingHero = new Promise(resolve => { resolveHero = resolve; });
  const calls = []; const asset = resource();
  t.mock.method(GLTFLoader.prototype, "loadAsync", path => { calls.push(path); return path.endsWith("hero.glb") ? pendingHero : Promise.resolve(asset.gltf); });
  const pending = loadActors(url);
  await new Promise(resolve => setImmediate(resolve));
  const equipmentStarted = calls.some(path => path.endsWith("knife.glb"));
  resolveHero(asset.gltf); const library = await pending; library.dispose();
  assert.equal(equipmentStarted, true, "equipment must not wait for body network/decode");
 });
test('Hollow selection loads both source-relative native knives and is complete without Goblin',async t=>{const hero=resource(),body=resource(),knife=resource(),urls=[];t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({pilot:'donor-knife',encounter:'hollow-scavengers',models:{vagrant:{url:'donor/warrior.glb',equipment:{url:'donor/knife.glb'}},'hollow-scavenger':{url:'hollow-scavenger/hollow-scavenger.glb',equipment:{url:'hollow-scavenger/knife.glb'}}}})}));t.mock.method(GLTFLoader.prototype,'loadAsync',async path=>{urls.push(path);return path.endsWith('warrior.glb')?hero.gltf:path.endsWith('hollow-scavenger.glb')?body.gltf:knife.gltf});const library=await loadActors(url,()=>{},'assets/manifest-hollow.json');assert.equal(library.complete,true);assert.equal(library.models.get('hollow-scavenger').equipment,knife.gltf);assert.deepEqual(urls.sort(),['assets/donor/knife.glb','assets/donor/warrior.glb','assets/hollow-scavenger/hollow-scavenger.glb','assets/hollow-scavenger/knife.glb'].map(p=>url+p).sort());library.dispose();});
