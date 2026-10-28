import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { DonorMotion } from "../src/donor-motion.js";
import { createActors } from "../src/actors.js";
import { createGame, enemy } from "../src/combat.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import { slotModelRefs, ensureSlotModels } from "../src/engine/slot-models.js";
import {
  actorModelRef,
  crowdAreaRefs,
  crowdBodyForKey,
  crowdBodyRef,
  crowdOn,
  ensureCrowdModels,
  isCrowdBody,
} from "../src/engine/crowd-bodies.js";

const read = (p) => readFileSync(new URL("../public/assets/" + p, import.meta.url));
const manifest = JSON.parse(read("manifest-hollow.json"));
const POOL = GAME_DATA.crowdBodies;
// The MakeHuman bodies (the native looks, the scavenger and the Pitborn, keep their own rig).
const bodies = POOL.pool.filter((row) => !row.native);
const NATIVE = POOL.pool.filter((row) => row.native);
const activeBodies = bodies.filter((row) => row.active && row.weight > 0);
const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);
const AREAS = ["east", "south"];
const plain = (key, extra = {}) => ({ kind: 0, rig: "hollow-scavenger", placementKey: key, ...extra });
// An east resident key that draws a MakeHuman body.
const bodyKey = () => AREA_MOB_SPAWNS.east.map((row) => row.key).find((k) => isCrowdBody(crowdBodyForKey("east", k)));

test("only the bodies checked clean are shipped: every crowd file is a registered pool row and the print bodies are gone", () => {
  const files = readdirSync(new URL("../public/assets/crowd/", import.meta.url)).sort();
  assert.deepEqual(files, bodies.map((row) => `${row.ref}.glb`).sort(), "no GLB outside the pool");
  for (const gone of ["man-02", "woman-02", "gen-v2-0001", "gen-v2-0009", "gen-v2-0002", "gen-v2-0015", "gen-v2-0043", "brute-01"])
    assert.equal(manifest.models[`mh-${gone}`], undefined, `${gone} is not shipped`);
  assert.equal(bodies.length, 19);
});

test("every area's plain humans draw MakeHuman bodies from the pool, and at least half of them keep an existing look", () => {
  const content = JSON.parse(read("../world/area-content.json")).residents,
    crooked = new Set(GAME_DATA.spawns.crookedResidents),
    plainRows = (area) =>
      (content[area] ?? AREA_MOB_SPAWNS[area] ?? []).filter(
        (row) =>
          (row.foundationRef === undefined || row.foundationRef === "hollow-scavenger") &&
          row.appearanceRef === undefined &&
          (row.recipeRef === undefined || POOL.plainRecipes.includes(row.recipeRef)) &&
          !crooked.has(row.key),
      );
  const areas = Object.keys(JSON.parse(read("../world/manifest.json")).entries).filter((area) => plainRows(area).length > 0);
  for (const area of ["westminster", "east", "south", "east-bridge", "elephant-and-castle", "lambeth", "area7", "area8"])
    assert(areas.includes(area), `${area} has plain humans`);
  for (const area of areas) {
    const looks = plainRows(area).map((row) => crowdBodyForKey(area, row.key)),
      bodies = looks.filter(isCrowdBody),
      existing = looks.length - bodies.length;
    assert(bodies.length >= 1, `${area}: ${bodies.length} MakeHuman bodies among ${looks.length} plain humans`);
    assert(existing * 2 >= looks.length, `${area}: only ${existing} of ${looks.length} keep an existing look`);
    assert(new Set(bodies).size <= POOL.maxBodiesPerArea, `${area} draws within the download cap`);
    assert(crowdAreaRefs({ residentPlacements: content }, area).length <= POOL.maxBodiesPerArea);
  }
  // Out of the pool: gaunt skulkers, animals, crooked residents, bosses (no placementKey row here), hunters and explicit appearances.
  const gaunt = Object.values(content).flat().filter((row) => row.recipeRef === "human-gaunt-skulker");
  assert(gaunt.length > 0);
  assert.deepEqual(crowdAreaRefs({ residentPlacements: { area8: gaunt } }, "area8"), []);
  assert.deepEqual(crowdAreaRefs({ residentPlacements: { lambeth: content.lambeth.filter((row) => row.foundationRef === "original-rat") } }, "lambeth"), []);
});

test("the existing looks stay in the rotation with the real weight: at least half of the draws in every area keep an existing human", () => {
  for (const row of NATIVE) {
    assert.equal(manifest.models[row.ref].rig, "hollow-scavenger", `${row.ref} keeps the scavenger rig, clips and finishers`);
    assert(row.active && row.weight > 0);
  }
  const others = POOL.pool.filter((row) => row.active && row.ref !== POOL.defaultRef).map((row) => row.weight).sort((a, b) => b - a);
  const worstOthers = others.slice(0, POOL.maxBodiesPerArea).reduce((sum, w) => sum + w, 0),
    scavenger = POOL.pool.find((row) => row.ref === POOL.defaultRef).weight;
  assert(scavenger >= worstOthers, "the scavenger alone outweighs the heaviest set an area can draw, whatever it draws");
  for (const area of ["east", "south", "lambeth", "area7", "area8"]) {
    const looks = Array.from({ length: 400 }, (_, i) => crowdBodyForKey(area, `${area}-resident-${i}`));
    const existing = looks.filter((ref) => ref === null || NATIVE.some((row) => row.ref === ref)).length;
    assert(existing / looks.length >= 0.5, `${area}: ${existing} of ${looks.length} keep an existing look`);
  }
});

test("the MakeHuman bodies are registered as deferred crowd appearances that match their files", () => {
  for (const { ref } of bodies) {
    const row = manifest.models[ref];
    assert(row, `${ref} is a manifest model`);
    assert.equal(row.deferred, true, `${ref} must not load at start`);
    assert(row.url.startsWith("crowd/"));
    assert.equal(row.rig, "mixamo-106");
    assert.equal(manifest.files[ref].file, row.url);
    const bytes = read(row.url);
    assert.equal(bytes.length, row.bytes, ref);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256, ref);
    assert.equal(manifest.files[ref].sha256, row.sha256);
    assert.equal(manifest.files[ref].bytes, row.bytes);
    for (const field of ["source", "licence", "assembly"]) assert(row.provenance[field], `${ref} provenance.${field}`);
    assert(row.scale >= 0.8 && row.scale <= 1.1, `${ref} scale ${row.scale}`);
    assert(row.stride > 0.6 && row.stride < 1.4, `${ref} stride ${row.stride}`);
    assert(isCrowdBody(ref));
  }
  assert.equal(isCrowdBody("hollow-scavenger"), false);
});

test("the default active set is eight bodies plus the scavenger look, and every active row is a real model", () => {
  assert.equal(activeBodies.length, 8);
  assert(POOL.pool.find((row) => row.ref === POOL.defaultRef).active);
  assert(manifest.models[POOL.defaultRef]);
  const bytes = activeBodies.reduce((sum, { ref }) => sum + manifest.models[ref].bytes, 0);
  assert(bytes < 5 * 1024 * 1024, "the whole active set stays below 5 MB");
});

test("a resident gets the same body every time, areas draw at most maxBodiesPerArea downloadable bodies, and the mix is real", () => {
  const seen = new Map();
  for (const area of AREAS) {
    const keys = AREA_MOB_SPAWNS[area].map((row) => row.key);
    const first = keys.map((key) => crowdBodyForKey(area, key));
    assert.deepEqual(
      keys.map((key) => crowdBodyForKey(area, key)),
      first,
      "deterministic",
    );
    const distinct = new Set(first.filter((ref) => ref !== null));
    assert(distinct.size <= POOL.maxBodiesPerArea, `${area} draws ${distinct.size} bodies`);
    for (const ref of distinct) assert(POOL.pool.some((row) => row.active && row.ref === ref), `${ref} is active`);
    seen.set(area, first);
  }
  const all = [...seen.values()].flat();
  assert(all.some((ref) => ref !== null), "some residents wear a crowd body");
  assert(all.some((ref) => ref === null), "some keep the scavenger look");
  // Different areas draw different sets, so the mix is not one list everywhere.
  assert.notDeepEqual(new Set(seen.get("east")), new Set(seen.get("south")));
});

test("only plain resident humans are dressed: not the tutorial area, hunters, bosses, animals, gaunt or crooked residents", () => {
  const key = bodyKey();
  assert(key, "an east resident wears a body");
  assert.equal(crowdBodyRef(plain(key), "east"), crowdBodyForKey("east", key));
  assert.equal(crowdBodyRef(plain(key, { markedHunter: true }), "east"), null);
  assert.equal(crowdBodyRef(plain(key, { bossProfile: {} }), "east"), null);
  assert.equal(crowdBodyRef(plain(key, { appearanceRef: "hale-pitborn" }), "east"), null);
  assert.equal(crowdBodyRef(plain(key, { humanBodyRecipe: "human-gaunt-skulker" }), "east"), null);
  assert.equal(crowdBodyRef(plain(key, { rig: "original-rat" }), "east"), null);
  assert.equal(crowdBodyRef(plain(key, { kind: -1 }), "east"), null, "the player is never a crowd body");
  assert.equal(crowdBodyRef({ kind: 0, rig: "hollow-scavenger" }, "east"), null, "an actor without a placement key");
  for (const crooked of GAME_DATA.spawns.crookedResidents) {
    const area = crooked.split("-")[0];
    assert.equal(crowdBodyForKey(area, crooked), null, `${crooked} keeps the crooked scavenger`);
  }
});

test("the off switch gives the plain scavenger back", (t) => {
  const key = bodyKey();
  const prior = globalThis.location;
  t.after(() => {
    if (prior === undefined) delete globalThis.location;
    else globalThis.location = prior;
  });
  assert.equal(crowdOn(""), true);
  assert.equal(crowdOn(`?${POOL.offParam}=${POOL.offValue}`), false);
  globalThis.location = { search: `?${POOL.offParam}=${POOL.offValue}` };
  assert.equal(crowdBodyForKey("east", key), null);
  assert.equal(actorModelRef(plain(key), manifest, undefined, "east"), "hollow-scavenger");
});

test("a pool file is only requested for the residents an area places, never all of them, and never as a required model", async () => {
  for (const area of AREAS) {
    const refs = crowdAreaRefs({}, area);
    assert(refs.length > 0 && refs.length <= POOL.maxBodiesPerArea, `${area}: ${refs.length} pool models`);
    for (const ref of refs) assert.equal(manifest.models[ref].deferred, true);
    assert.deepEqual(slotModelRefs({}, area, manifest).filter((ref) => POOL.pool.some((row) => row.ref === ref)), [], "not in the required list");
  }
  const westminster = crowdAreaRefs({}, "westminster");
  assert(westminster.length > 0 && westminster.length <= POOL.maxBodiesPerArea, "Westminster, the first area, has its pool models prefetched at idle");
  // A placement with its own appearance, foundation or recipe draws no body.
  assert.deepEqual(
    crowdAreaRefs({ residentPlacements: { east: [{ key: "x", appearanceRef: "hale-pitborn" }, { key: "y", foundationRef: "original-wolf" }] } }, "east"),
    [],
  );
  // Best effort: a rejected or throwing download resolves, so one failed body never fails boot, restore or an area entry.
  const failing = { manifest, models: new Map(), dispose() {}, ensureModels: () => Promise.reject(Error("offline")) };
  const throwing = { manifest, models: new Map(), dispose() {}, ensureModels: () => { throw Error("boom"); } };
  for (const area of AREAS) {
    assert.equal(await ensureCrowdModels(failing, {}, area), undefined);
    assert.equal(await ensureCrowdModels(throwing, {}, area), undefined);
    assert.equal(await ensureSlotModels(failing, {}, area), undefined);
  }
});

test("a failed crowd body download never fails boot, restore or an area entry, and the bodies are still asked for", async (t) => {
  shim(t);
  const calls = [];
  const offline = {
    manifest,
    models: new Map(),
    dispose() {},
    ensureModels(names) {
      calls.push(names);
      return names.some((name) => POOL.pool.some((row) => row.ref === name)) ? Promise.reject(Error("offline")) : Promise.resolve();
    },
  };
  const actors = createActors(new THREE.Scene(), world, offline);
  await actors.ensureAreaModels({ enemies: [] }, "east", { fresh: true });
  await actors.ensureAreaModels({ enemies: [plain(bodyKey(), { id: 5 })] }, "east");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(calls.some((names) => names.some(isCrowdBody)), "the pool models were requested");
  actors.dispose();
});

test("an area entry never waits for the crowd downloads: they start after it resolved, and a download that never ends changes nothing", async (t) => {
  shim(t);
  const calls = [];
  let entered = false;
  const stuck = {
    manifest,
    models: new Map(),
    dispose() {},
    ensureModels(names) {
      calls.push({ names, afterEntry: entered });
      return names.some((name) => POOL.pool.some((row) => row.ref === name)) ? new Promise(() => {}) : Promise.resolve();
    },
  };
  const actors = createActors(new THREE.Scene(), world, stuck);
  await actors.ensureAreaModels({ enemies: [] }, "east", { fresh: true }); // would hang here if the entry waited for the bodies
  entered = true;
  assert(!calls.some((c) => c.names.some(isCrowdBody)), "no pool download had started before the entry resolved");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(calls.some((c) => c.names.some(isCrowdBody) && c.afterEntry), "the pool downloads start after it");
  actors.dispose();
});

const shim = (t) => {
  const prior = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
        drawImage() {},
        getImageData: () => ({ data: new Uint8Array([255, 255, 255, 255]) }),
      }),
    }),
  };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
};
const world = { areaId: "east", layout: { characterScale: 1.265 }, toRender: ({ x, z }) => new THREE.Vector3(x, 0, -z) };

async function library(refs) {
  const load = (name) => loadGeometry(read(manifest.models[name].url));
  const equip = (name) => loadGeometry(read(manifest.models[name].equipment.url));
  const models = new Map([
    ["vagrant", { description: manifest.models.vagrant, gltf: await load("vagrant"), equipment: await equip("vagrant") }],
    ["hollow-scavenger", { description: manifest.models["hollow-scavenger"], gltf: await load("hollow-scavenger"), equipment: await equip("hollow-scavenger") }],
  ]);
  for (const ref of refs) models.set(ref, { description: manifest.models[ref], gltf: await load(ref) });
  return { manifest, models, dispose() {} };
}

test("a crowd resident is built from its body, keeps its rig and stats, and falls back to the scavenger while the file is missing", async (t) => {
  shim(t);
  const key = bodyKey();
  const ref = crowdBodyForKey("east", key);
  const g = createGame(world, { pilot: "donor-knife" });
  const resident = Object.assign(enemy(0, { x: 1, z: 1 }), { rig: "hollow-scavenger", placementKey: key });
  const before = JSON.stringify({ ...resident, id: 0 });
  g.enemies = [resident];
  const loaded = createActors(new THREE.Scene(), world, await library([ref]));
  loaded.update(g, 0);
  const view = loaded.views.get(resident.id);
  assert.equal(view.root.name, ref);
  assert.equal(resident.rig, "hollow-scavenger", "mechanics keep the scavenger rig");
  assert.equal(view.palette, null, "the body brings its own clothes");
  assert.equal(view.appearance, null, "no scavenger face kit on a MakeHuman face");
  assert.equal(resident.finisherSupport, undefined, "no hero-rig finisher on a 106 body");
  assert.equal(JSON.stringify({ ...resident, id: 0 }), before, "the entity is untouched");
  loaded.dispose();

  const lib = await library([]),
    fallback = createActors(new THREE.Scene(), world, lib);
  assert.doesNotThrow(() => fallback.update(g, 0));
  assert.equal(fallback.views.get(resident.id).root.name, "hollow-scavenger");
  // The body arrives later (the fire-and-forget download): a fighting resident keeps its look, a calm one is rebuilt with the body.
  lib.models.set(ref, { description: manifest.models[ref], gltf: await loadGeometry(read(manifest.models[ref].url)) });
  resident.alerted = true;
  fallback.update(g, 0);
  assert.equal(fallback.views.get(resident.id).root.name, "hollow-scavenger", "no swap while it fights");
  resident.alerted = false;
  fallback.update(g, 0);
  assert.equal(fallback.views.get(resident.id).root.name, ref, "swapped once calm");
  assert.equal(fallback.views.get(resident.id).entity, resident, "same entity, nothing else changed");
  fallback.dispose();
});

// Mixamo clips play upright on these bodies: the Hips rotation track is in the 106 rig's own frame, exactly as the Pitborn hunter's.
test("every active body stays upright through its locomotion, fight and hit clips and goes down in Death", async () => {
  for (const { ref } of activeBodies) {
    const row = manifest.models[ref];
    const gltf = await loadGeometry(read(row.url));
    const clips = new Set(gltf.animations.map((clip) => clip.name));
    for (const role of Object.values(row.clips)) assert(clips.has(role), `${ref}: clip ${role}`);
    const model = gltf.scene,
      root = new THREE.Group();
    root.add(model);
    const motion = new DonorMotion(root, model, gltf.animations, row);
    const bone = (name) => new THREE.Vector3().setFromMatrixPosition(model.getObjectByName(sanitize(name)).matrixWorld);
    for (const role of ["idle", "walk", "run", "slash", "stab", "heavy", "guard", "hit"]) {
      for (const phase of [0, 0.25, 0.5, 0.75, 0.99]) {
        motion.sample(row.clips[role], phase);
        const [head, hips, foot] = [row.headBone, "mixamorig:Hips", "mixamorig:LeftFoot"].map(bone);
        assert(head.y > hips.y + 0.15 && hips.y > foot.y + 0.15, `${ref} ${role} ${phase}: head ${head.y.toFixed(2)} hips ${hips.y.toFixed(2)} foot ${foot.y.toFixed(2)}`);
        model.traverse((node) => assert(node.matrixWorld.elements.every(Number.isFinite)));
      }
    }
    for (const alias of ["Return", "Riposte", "Skill_Pommel", "Parry", "BlockImpact", "Deflected"]) {
      motion.sample(alias, 0.5);
      assert(motion.currentClip, `${ref}: ${alias} resolves to a clip`);
    }
    motion.sample(row.clips.idle, 0);
    const feet = ["mixamorig:LeftFoot", "mixamorig:RightFoot"].map(bone);
    for (const foot of feet) assert(foot.y < 0.25 && foot.y > -0.05, `${ref} idle ankle ${foot.y.toFixed(3)}`);
    motion.sample(row.clips.death, 0.99);
    assert(bone(row.headBone).y < 0.5, `${ref} lies on the ground at the end of Death, head ${bone(row.headBone).y.toFixed(2)}`);
    motion.dispose();
  }
});
