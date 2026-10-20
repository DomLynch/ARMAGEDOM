import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadActors,createActors } from "../src/actors.js";

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

test('separate pistol source settles and is disposed when actor startup fails',async t=>{
 const pistol=resource();t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({models:{vagrant:{url:'missing.glb'}},pistol:{url:'pistol.glb'}})}));
 t.mock.method(GLTFLoader.prototype,'loadAsync',async path=>{if(path.endsWith('pistol.glb'))return pistol.gltf;throw Error('hero decode failed')});
 await assert.rejects(loadActors(url),/hero decode failed/);assert.deepEqual(pistol.disposed,{geometry:1,material:1,texture:1});
});

test('actual selected manifest shares one byte-identical knife source and disposes it once',async t=>{
 const {readFileSync}=await import('node:fs'),{createHash}=await import('node:crypto');const actual=JSON.parse(readFileSync(new URL('../public/assets/manifest-hollow.json',import.meta.url)));
 const heroKnife=actual.models.vagrant.equipment.url,hollowKnife=actual.models['hollow-scavenger'].equipment.url;assert.equal(heroKnife,hollowKnife);
 const originals=['donor/knife.glb','hollow-scavenger/knife.glb'].map(path=>readFileSync(new URL('../public/assets/'+path,import.meta.url)));assert.deepEqual(originals[0],originals[1]);assert.equal(originals[0].length,382956);assert.equal(createHash('sha256').update(originals[0]).digest('hex'),'b2f84216c0e3958391a84d72d174a70e474ee2af0a808632d1ad36b8c061bfec');
 const fetched=[],owned=[];t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>actual}));t.mock.method(GLTFLoader.prototype,'loadAsync',async url=>{fetched.push(url);const r=resource();owned.push(r);return r.gltf;});
 const library=await loadActors(url,()=>{},'assets/manifest-hollow.json');assert.equal(fetched.filter(u=>u.endsWith('/donor/knife.glb')).length,1);assert.equal(library.models.get('vagrant').equipment,library.models.get('hollow-scavenger').equipment);library.dispose();assert(owned.every(r=>Object.values(r.disposed).every(count=>count===1)));
});

test('deferred boss sources do not preload globally; concurrent affected-area requests share one load',async(t)=>{
 const hero=resource(),boss=resource(),other=resource(),fetched=[];
 manifest(t,{vagrant:{url:'hero.glb'},'boss-one':{url:'boss.glb',deferred:true},'boss-two':{url:'other.glb',deferred:true}});
 t.mock.method(GLTFLoader.prototype,'loadAsync',async path=>{fetched.push(path);return path.endsWith('hero.glb')?hero.gltf:path.endsWith('boss.glb')?boss.gltf:other.gltf;});
 const library=await loadActors(url);assert.equal(fetched.length,1);assert(!library.models.has('boss-one'));await Promise.all([library.ensureModels(['boss-one']),library.ensureModels(['boss-one'])]);assert.equal(fetched.filter(p=>p.endsWith('boss.glb')).length,1);assert(library.models.has('boss-one'));assert(!library.models.has('boss-two'));await assert.rejects(library.ensureModels(['unknown']),/Unknown actor model/);library.dispose();assert.deepEqual(boss.disposed,{geometry:1,material:1,texture:1});assert.deepEqual(other.disposed,{geometry:0,material:0,texture:0});
});
test('late deferred completion after disposal is released and cannot publish a stale model',async(t)=>{
 const hero=resource(),boss=resource();let finish;
 manifest(t,{vagrant:{url:'hero.glb'},boss:{url:'boss.glb',deferred:true}});
 t.mock.method(GLTFLoader.prototype,'loadAsync',async path=>path.endsWith('hero.glb')?hero.gltf:new Promise(resolve=>finish=()=>resolve(boss.gltf)));
 const library=await loadActors(url),pending=library.ensureModels(['boss']);await Promise.resolve();library.dispose();finish();await assert.rejects(pending,/disposed/);assert.equal(library.models.size,0);assert.deepEqual(boss.disposed,{geometry:1,material:1,texture:1});await assert.rejects(library.ensureModels(['boss']),/disposed/);
});
test('a transient deferred URL failure evicts only rejection and a shared retry can succeed',async(t)=>{
 const hero=resource(),boss=resource();let attempts=0;
 manifest(t,{vagrant:{url:'hero.glb'},'boss-one':{url:'shared-boss.glb',deferred:true},'boss-two':{url:'shared-boss.glb',deferred:true}});
 t.mock.method(GLTFLoader.prototype,'loadAsync',async path=>{if(path.endsWith('hero.glb'))return hero.gltf;if(++attempts===1)throw Error('temporary transport');return boss.gltf;});
 const library=await loadActors(url),failed=await Promise.allSettled([library.ensureModels(['boss-one']),library.ensureModels(['boss-two'])]);assert(failed.every(row=>row.status==='rejected'));assert.equal(attempts,1);assert(!library.models.has('boss-one'));await Promise.all([library.ensureModels(['boss-one']),library.ensureModels(['boss-two'])]);assert.equal(attempts,2);assert.equal(library.models.get('boss-one').gltf,library.models.get('boss-two').gltf);assert.deepEqual(hero.disposed,{geometry:0,material:0,texture:0});library.dispose();assert.deepEqual(boss.disposed,{geometry:1,material:1,texture:1});
});

test('placement appearance readiness selects registered visual source without changing gameplay rig',async t=>{
 const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const calls=[],library={manifest:{pilot:'donor-knife',models:{look:{rig:'hollow-scavenger'},wrong:{rig:'boss-warden'}}},models:new Map(),ensureModels:async refs=>calls.push(refs),dispose(){}},actors=createActors(new THREE.Scene(),{layout:{},toRender:p=>new THREE.Vector3(p.x,0,-p.z)},library);t.after(()=>actors.dispose());
 const entity={kind:0,rig:'hollow-scavenger',appearanceRef:'look'};await actors.ensureAreaModels({enemies:[entity],corpses:[{...entity}]});assert.deepEqual(calls,[['look']]);assert.equal(entity.rig,'hollow-scavenger');
 for(const appearanceRef of ['unknown','wrong',null,'../look'])assert.throws(()=>actors.ensureAreaModels({enemies:[{...entity,appearanceRef}]}),/Invalid actor appearance reference/);assert.deepEqual(calls,[['look']]);
 await actors.ensureAreaModels({enemies:[{kind:0,rig:'hollow-scavenger'}]});assert.deepEqual(calls[1],[],'ordinary residents keep existing ready foundation');
});
test('authored face and head descriptors reject invalid inputs and release owned sources',async t=>{
 const hero=resource(),look=resource();manifest(t,{vagrant:{url:'hero.glb'},look:{url:'look.glb',faceRecipeId:'face-original',headParts:['Photo','PhotoEyes','PhotoTeeth']}});
 t.mock.method(GLTFLoader.prototype,'loadAsync',async path=>path.endsWith('hero.glb')?hero.gltf:look.gltf);
 await assert.rejects(loadActors(url),/Appearance head part missing: look\/Photo/);
 for(const source of [hero,look])assert.deepEqual(source.disposed,{geometry:1,material:1,texture:1});
});
test('fresh Retry readiness includes declared dead bosses and appearances from only the current area',async t=>{
 const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const calls=[],library={manifest:{pilot:'donor-knife',models:{}},models:new Map(),ensureModels:async refs=>calls.push(refs),dispose(){}},world={areaId:'westminster',layout:{},toRender:p=>new THREE.Vector3(p.x,0,-p.z),residentPlacements:{westminster:[{appearanceRef:'west-look'}],south:[{appearanceRef:'south-look'}]},bossData:{profiles:{witch:{modelRef:'boss-westminster-witch'},south:{modelRef:'boss-south'}},placements:[{areaId:'westminster',profileRef:'witch'},{areaId:'south',profileRef:'south'}]}},actors=createActors(new THREE.Scene(),world,library);t.after(()=>actors.dispose());
 await actors.ensureAreaModels({enemies:[]});assert.deepEqual(calls[0],[],'dead boss remains deferred for ordinary saved entry');await actors.ensureAreaModels({enemies:[]},'westminster',{fresh:true});assert.deepEqual(calls[1],['west-look','boss-westminster-witch'],'Retry prepares fresh residents even though old run has no live actors');
});

test('procedural Surgeon saw does not request an unregistered downloadable model during area readiness',async t=>{
 const prior=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/manifest-hollow.json',import.meta.url))),content=JSON.parse(readFileSync(new URL('../public/world/area-content.json',import.meta.url))),calls=[],library={manifest,models:new Map(),ensureModels:async refs=>{calls.push(refs);for(const ref of refs)assert(Object.hasOwn(manifest.models,ref),'Unknown actor model: '+ref);},dispose(){}},world={areaId:'westminster',layout:{},toRender:p=>new THREE.Vector3(p.x,0,-p.z),bossData:content.bosses},actors=createActors(new THREE.Scene(),world,library);t.after(()=>actors.dispose());
 assert.equal(content.bosses.profiles.surgeon.weapon.kind,'saw');assert(!Object.hasOwn(manifest.models,'bone-saw'));
 await actors.ensureAreaModels({enemies:[]},'lambeth');assert.deepEqual(calls.at(-1),[],'dead Surgeon needs no external saw asset');
 const rig=content.bosses.profiles.surgeon.modelRef;await actors.ensureAreaModels({enemies:[{kind:0,rig,bossProfile:content.bosses.profiles.surgeon}]},'lambeth');assert.deepEqual(calls.at(-1),[rig],'living Surgeon still loads its registered actor body');
 await actors.ensureAreaModels({enemies:[]},'westminster');assert(calls.at(-1).includes(content.bosses.profiles.witch.weapon.modelRef),'downloaded boss Flame asset remains required');
 world.bossData={profiles:{unsupported:{weapon:{kind:'flame',modelRef:'unregistered-download'}}},placements:[{areaId:'lambeth',profileRef:'unsupported'}]};await assert.rejects(actors.ensureAreaModels({enemies:[]},'lambeth'),/Unknown actor model: unregistered-download/,'unsupported external models still reject');
});
