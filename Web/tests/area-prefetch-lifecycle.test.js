import test from "node:test";
import assert from "node:assert/strict";
import { createAreaLifecycle, PARKED_AREA_LIMIT } from "../src/engine/areas.js";
import { limitParkedAreas } from "../src/engine/parked-view-budget.js";
import { LondonWorld } from "../src/world.js";

const FAST = { startDelayMs: 0, recheckMs: 5, fightQuietMs: 60, bytesPerSecond: 1e9 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Just enough of the engine for start() to queue neighbours and the prefetch to ask for their files.
function session({ prefetchAreas = true, enemies = [] } = {}) {
  const stage = { scene: {}, camera: {} };
  const world = {
    areaId: "westminster",
    registry: {
      links: () => [
        { to: "east", condition: { xMin: 0.9 } },
        { to: "south", condition: { yMin: 0.9 } },
      ],
    },
    manifest: { links: [] },
    geometry: { point: () => ({ x: 0.5, y: 0.5 }), ground: (p) => ({ x: p.x * 100, z: p.y * 100 }) },
    prepareArea: async () => stage,
    isAreaReady: (id) => id === "westminster",
    markAreaReady() {},
    setParkedLimit(limit) {
      this.parkedLimit = limit;
    },
    areaPrefetchUrls: (id) => [`/${id}/layout.json`],
  };
  return {
    prefetchAreas,
    prefetchLimits: FAST,
    loaded: true,
    traveling: false,
    contextLost: false,
    world,
    actors: { areaPrefetchUrls: (id) => [`/${id}/boss.glb`] },
    game: { player: { hp: 100, pos: { x: 50, z: 50 } }, enemies },
  };
}

async function withFetch(impl, run) {
  const real = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    return impl(url, options);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = real;
  }
}
const ok = () => ({ ok: true, body: { getReader: () => ({ read: async () => ({ done: true }) }) } });

test("flag off: nothing is fetched and no parked limit is set", async () => {
  const s = session({ prefetchAreas: false });
  await withFetch(ok, async (calls) => {
    const areas = createAreaLifecycle(s);
    areas.start();
    await sleep(80);
    areas.stop();
    assert.deepEqual(calls, []);
    assert.equal(s.world.parkedLimit, undefined);
  });
});

test("flag on: neighbours' layout and boss files are fetched, nearest first, parked limit is 2 areas / 30 MB", async () => {
  const s = session();
  await withFetch(ok, async (calls) => {
    const areas = createAreaLifecycle(s);
    areas.start();
    await sleep(120);
    areas.stop();
    assert.deepEqual(calls, ["/east/layout.json", "/east/boss.glb", "/south/layout.json", "/south/boss.glb"]);
    assert.deepEqual(s.world.parkedLimit, PARKED_AREA_LIMIT);
    assert.equal(PARKED_AREA_LIMIT.maxAreas, 2);
    assert.equal(PARKED_AREA_LIMIT.maxBytes, 30 * 1024 * 1024);
  });
});

test("no fetch while an enemy is alerted; downloads start after the quiet period", async () => {
  const hostile = { hp: 50, alerted: true },
    s = session({ enemies: [hostile] });
  await withFetch(ok, async (calls) => {
    const areas = createAreaLifecycle(s);
    areas.start();
    await sleep(150);
    assert.deepEqual(calls, [], "fight live");
    hostile.hp = 0;
    await sleep(60 + 150);
    assert.ok(calls.length > 0, "resumes once the fight is over");
    areas.stop();
  });
});

test("a prefetch that fails never throws and leaves the lifecycle usable", async () => {
  const s = session();
  const warn = console.warn;
  console.warn = () => {};
  try {
    await withFetch(
      () => Promise.reject(Error("offline")),
      async (calls) => {
        const areas = createAreaLifecycle(s);
        areas.start();
        await sleep(120);
        assert.equal(calls.length, 4, "each file tried once, none retried in a loop");
        areas.stop();
        areas.start();
        areas.stop();
      },
    );
  } finally {
    console.warn = warn;
  }
});

test("limitParkedAreas drops the oldest parked areas but never the ones kept", () => {
  const parked = ["a", "b", "c", "d"].map((area) => ({ area, count: 1 })),
    dropped = [],
    actors = {
      areaViewStats: () => ({ parked: parked.filter((row) => !dropped.includes(row.area)) }),
      discardArea: (id) => dropped.push(id),
    };
  const evicted = limitParkedAreas(actors, new Set(["current", "d"]), 2);
  assert.deepEqual(evicted, ["a", "b"]);
  assert.deepEqual(dropped, ["a", "b"]);
  // The area just left ("a") survives when it is in keep, even if it is the oldest.
  dropped.length = 0;
  assert.deepEqual(limitParkedAreas(actors, new Set(["a"]), 2), ["b", "c"]);
});

test("trimParkedStages keeps the area just left; evicts least recently used past 2 areas or 30 MB", () => {
  const MB = 1024 * 1024,
    stage = (mb) => ({ textureBytes: () => mb * MB, disposeStage() {} });
  const make = (stages, previousArea, usage) => ({
    areaCache: {
      stages: new Map(Object.entries(stages)),
      pending: new Map(),
      leases: new Map(),
      usage: new Map(Object.entries(usage)),
      activeArea: "now",
      previousArea,
      evictions: 0,
      parkedLimit: PARKED_AREA_LIMIT,
    },
    trimParkedStages: LondonWorld.prototype.trimParkedStages,
  });
  // Three parked areas of 14 MB: past both limits; the oldest (not the previous) goes first.
  const count = make({ now: stage(14), old: stage(14), prev: stage(14), mid: stage(14) }, "prev", {
    old: 1,
    mid: 2,
    prev: 3,
    now: 4,
  });
  count.trimParkedStages();
  assert.deepEqual([...count.areaCache.stages.keys()].sort(), ["mid", "now", "prev"]);
  // Two parked areas but 40 MB: the bytes limit trips first and evicts the older one, not the previous.
  const bytes = make({ now: stage(10), old: stage(20), prev: stage(20) }, "prev", { old: 1, prev: 2, now: 3 });
  bytes.trimParkedStages();
  assert.deepEqual([...bytes.areaCache.stages.keys()].sort(), ["now", "prev"]);
  // The previous area is never evicted even if it alone exceeds the byte limit.
  const alone = make({ now: stage(10), prev: stage(40) }, "prev", { prev: 1, now: 2 });
  alone.trimParkedStages();
  assert.ok(alone.areaCache.stages.has("prev"));
  // No limit set: nothing changes (flag off).
  const off = make({ now: stage(1), a: stage(40), b: stage(40), c: stage(40) }, "a", {});
  off.areaCache.parkedLimit = undefined;
  off.trimParkedStages();
  assert.equal(off.areaCache.stages.size, 4);
});
