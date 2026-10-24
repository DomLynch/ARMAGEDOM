import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createAreaLifecycle } from "../src/engine/areas.js";
import { createGame } from "../src/combat.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";

const FAST = { startDelayMs: 0, recheckMs: 5, fightQuietMs: 60, bytesPerSecond: 1e9 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url)));

test("travel still completes when every prefetch request fails", async () => {
  let ready = false;
  const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
  let geometry = createGeometry(read("world/westminster/layout.json"));
  const world = {
    areaId: "westminster",
    registry,
    manifest: read("world/manifest.json"),
    spawn: { x: 0, z: -6 },
    layout: { characterScale: 1.265 },
    geometry,
    lineClear: (a, b) => world.geometry.lineClear(a, b),
    move: (p, d, r) => world.geometry.move(p, d, r),
    travelAt: () => null,
    // Neighbours count as not ready while the prefetch runs; the crossing then finds them ready.
    isAreaReady: (id) => ready || id === world.areaId,
    markAreaReady() {},
    setParkedLimit() {},
    leaseArea: () => () => {},
    prepareArea: async () => ({ scene: {}, camera: {} }),
    areaPrefetchUrls: (id) => [`/${id}/layout.json`, `/${id}/backdrop.webp`],
    update() {},
    async loadArea(id, entry) {
      this.areaId = id;
      this.geometry = geometry = createGeometry(read(`world/${id}/layout.json`));
      return geometry.ground(entry ?? registry.get(id).entry);
    },
  };
  const game = createGame(world, { pilot: "donor-knife" });
  const parked = [];
  const s = {
    prefetchAreas: true,
    prefetchLimits: FAST,
    loaded: true,
    traveling: false,
    contextLost: false,
    resetting: false,
    game,
    world,
    actors: {
      areaPrefetchUrls: (id) => [`/${id}/boss.glb`],
      areaViewStats: () => ({ parked: [] }),
      parkArea: (id) => parked.push(id),
      activateArea() {},
      update() {},
      ratContact: () => false,
    },
    scene: { children: [] },
    camera: {},
    renderer: { render() {} },
    hud: { update() {} },
    input: { clear() {} },
    effects: { reset() {} },
    cancelPistol() {},
    resetClock() {},
    persistRun: () => true,
  };
  const realFetch = globalThis.fetch,
    realRaf = globalThis.requestAnimationFrame,
    warn = console.warn,
    info = console.info,
    calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    throw Error("offline");
  };
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  console.warn = () => {};
  console.info = () => {};
  try {
    const life = createAreaLifecycle(s);
    life.start();
    await sleep(100);
    assert.ok(calls.length > 0, "the prefetch tried and failed");
    ready = true;
    assert.equal(await life.activate({ areaId: "south" }), true);
    assert.equal(world.areaId, "south");
    assert.equal(s.traveling, false);
    assert.deepEqual(parked, ["westminster"]);
    life.stop();
  } finally {
    globalThis.fetch = realFetch;
    globalThis.requestAnimationFrame = realRaf;
    console.warn = warn;
    console.info = info;
  }
});
