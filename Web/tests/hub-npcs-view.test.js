import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createHubNpcs, hubNpcRefs, hubNpcsOn } from "../src/engine/hub-npcs.js";

const DATA = GAME_DATA.hubNpcs;
const manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8"));
const models = new Map();
for (const npc of DATA.npcs)
  models.set(npc.ref, {
    gltf: await loadGeometry(readFileSync(new URL(`../public/assets/${manifest.models[npc.ref].url}`, import.meta.url))),
    description: manifest.models[npc.ref],
  });
const makeWorld = (areaId) => ({
  areaId,
  layout: { characterScale: 1 },
  geometry: { ground: (p) => ({ x: p.x * 10, z: p.y * 10 }) },
  toRender: (p) => new THREE.Vector3(p.x, 0, -p.z),
  group: new THREE.Group(),
});

test("the NPCs are drawn in the hub only, one holder each, and removed on leaving", () => {
  const library = { models, ensureModels: () => Promise.resolve() };
  const npcs = createHubNpcs({ library });
  const hub = makeWorld(DATA.area),
    elsewhere = makeWorld("east");
  npcs.sync(elsewhere, 0.1);
  assert.equal(npcs.shown, false);
  npcs.sync(hub, 0.1);
  assert.equal(npcs.shown, true);
  assert.deepEqual(hub.group.getObjectByName("hub-npcs").children.map((c) => c.name), DATA.npcs.map((n) => n.ref));
  npcs.sync(hub, 0.5); // idles without error
  npcs.sync(elsewhere, 0.1);
  assert.equal(npcs.shown, false);
  assert.equal(hub.group.getObjectByName("hub-npcs"), undefined);
});

test("a model that has not arrived leaves the NPCs out and asks once; the off switch and other areas ask for nothing", () => {
  let asks = 0;
  const npcs = createHubNpcs({ library: { models: new Map(), ensureModels: () => (asks++, Promise.reject(Error("offline"))) } });
  const hub = makeWorld(DATA.area);
  npcs.sync(hub, 0.1);
  npcs.sync(hub, 0.1);
  assert.equal(npcs.shown, false);
  assert.equal(asks, 1);
  assert.deepEqual(hubNpcRefs("east"), []);
  assert.deepEqual(hubNpcRefs(DATA.area), DATA.npcs.map((n) => n.ref));
  assert.equal(hubNpcsOn(`?${DATA.offParam}=${DATA.offValue}`), false);
  assert.equal(hubNpcsOn(""), true);
});

test("the idle clock advances: each NPC's pose differs between two clock times, and the NPCs are offset from each other", () => {
  const npcs = createHubNpcs({ library: { models, ensureModels: () => Promise.resolve() } });
  const hub = makeWorld(DATA.area);
  const snapshot = () =>
    npcs.views.map(({ motion }) => {
      const spine = motion.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName("mixamorig:Spine2"));
      const hand = motion.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName("mixamorig:RightHand"));
      return [motion.currentPhase, ...spine.matrixWorld.elements, ...hand.matrixWorld.elements];
    });
  npcs.sync(hub, 0.1); // builds at clock 0
  const first = snapshot();
  npcs.sync(hub, 1.7);
  const later = snapshot();
  assert.equal(npcs.clock, 1.7);
  assert.equal(first.length, DATA.npcs.length);
  first.forEach((pose, i) => {
    assert.notEqual(later[i][0], pose[0], `${DATA.npcs[i].ref} idle phase advances`);
    const moved = pose.slice(1).reduce((sum, v, k) => sum + Math.abs(v - later[i][k + 1]), 0);
    assert(moved > 0.001, `${DATA.npcs[i].ref} pose changes between clock times (${moved})`);
  });
  assert.equal(new Set(first.map((p) => p[0].toFixed(4))).size, DATA.npcs.length, "idle phases are offset per NPC");
  for (const view of npcs.views) assert.equal(view.motion.currentClip, models.get(view.ref).description.clips.idle);
});
