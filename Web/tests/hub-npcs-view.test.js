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
