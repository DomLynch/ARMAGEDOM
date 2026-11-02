// The cut GLB idle prefetch (engine/physics-death.js). Its own file: the once-per-page guard and the chunk's pool are module state.
import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { physicsDeathStep, prefetchCutsOnIdle, usePhysicsDeathImpl, watchCutPrefetch } from "../src/engine/physics-death.js";

const CFG = GAME_DATA.physicsDeath;
const DT = 1 / CFG.stepHz;

const withNavigator = (value, run) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (saved) Object.defineProperty(globalThis, "navigator", saved);
    else delete globalThis.navigator;
  }
};
const withIdleCapture = async (run) => {
  const saved = globalThis.requestIdleCallback,
    queued = [];
  globalThis.requestIdleCallback = (fn, opts) => queued.push({ fn, opts });
  try {
    await run(queued);
  } finally {
    if (saved) globalThis.requestIdleCallback = saved;
    else delete globalThis.requestIdleCallback;
  }
};

test("the cut GLB idle prefetch is skipped when the flag is off, on data saver and on a slow link", async () => {
  const library = { ensureModels: () => assert.fail("must not fetch") };
  await withIdleCapture(async (queued) => {
    prefetchCutsOnIdle(library, false);
    withNavigator({ connection: { saveData: true, effectiveType: "4g" } }, () => prefetchCutsOnIdle(library, true));
    for (const effectiveType of CFG.cutPrefetch.slowTypes)
      withNavigator({ connection: { saveData: false, effectiveType } }, () => prefetchCutsOnIdle(library, true));
    prefetchCutsOnIdle({}, true); // no loader to call
    assert.equal(queued.length, 0);
  });
});

const game = { areaId: "lambeth", world: { areaId: "lambeth" }, player: { pos: { x: 0, z: 0 } } };
const hunter = (x, extra = {}) => ({ markedHunter: true, hp: 10, maxHP: 10, pos: { x, z: 0 }, ...extra });
const step = (entity, library) => physicsDeathStep({}, entity, library, DT, true);

test("no marked hunter alive in range in the current area means no cut GLB fetch", async () => {
  watchCutPrefetch(() => game);
  const library = { ensureModels: () => assert.fail("must not fetch") };
  await withIdleCapture(async (queued) => {
    step({ hp: 10, maxHP: 10, pos: { x: 1, z: 0 } }, library); // a plain enemy next to the player
    step(hunter(CFG.cutPrefetch.range + 1), library); // too far
    step(hunter(1, { areaId: "elephant-and-castle" }), library); // in another area
    step(hunter(1, { hp: 0 }), library); // already dead
    assert.equal(queued.length, 0);
    watchCutPrefetch(() => null); // no game yet
    step(hunter(1), library);
    assert.equal(queued.length, 0);
    watchCutPrefetch(() => game);
  });
});

test("a marked hunter in range queues one idle fetch, and a synchronous throw from ensureModels falls back quietly to the plain ragdoll", async () => {
  usePhysicsDeathImpl(await import("../src/engine/physics-death-impl.js"));
  let calls = 0;
  const library = {
    ensureModels() {
      calls++;
      throw new Error("sync blow-up");
    },
  };
  await withIdleCapture(async (queued) => {
    withNavigator({ connection: { saveData: false, effectiveType: "4g" } }, () => {
      assert.equal(step(hunter(CFG.cutPrefetch.range), library), false); // the hunter is alive: no ragdoll
      for (let i = 0; i < 5; i++) step(hunter(2), library); // frames go by, more hunters come near
    });
    assert.equal(queued.length, 1);
    assert.equal(queued[0].opts.timeout, CFG.cutPrefetch.idleMs);
    assert.equal(calls, 0); // nothing fetched until the browser is idle
    await queued[0].fn(); // does not throw
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    // once per page: a wounded hunter does not ask again, and the step still returns false
    assert.equal(step(hunter(2, { hp: 3 }), library), false);
    assert.equal(queued.length, 1);
    assert.equal(calls, 1);
  });
});
