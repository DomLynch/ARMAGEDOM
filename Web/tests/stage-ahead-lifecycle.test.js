import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { indexOfToken } from "./helpers/source-slice.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { relieveGeometryBudget, protectedAreas, limitParkedAreas } from "../src/engine/parked-view-budget.js";

// Runs the preparation section of engine/areas.js (cut out by token, like preparation-priority.test.js) with a
// stub world: south's exit is 1 m from the player, east's 10 m.
function setup({ gateOpen = true, range = 30, parked = [] } = {}) {
  const source = readFileSync(new URL("../src/engine/areas.js", import.meta.url), "utf8"),
    start = indexOfToken(source, "let areaPreparation = null;"),
    end = indexOfToken(source, "function checkExit()", start);
  assert(start >= 0 && end > start);
  let clock = 0;
  const log = {
    starts: [],
    closed: [],
    discards: [],
    outcomes: [],
    graphics: 0,
    warmed: 0,
    ready: [],
    leases: [],
    released: [],
  };
  const task = (areaId) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    promise.catch(() => {});
    return [areaId, { areaId, status: "queued", promise, resolve, reject }];
  };
  const game = { world: { areaId: "westminster" }, player: { pos: { x: 0, z: 0 } }, finishers: {} };
  const state = {
    game,
    cancelled: false,
    tasks: new Map(["south", "east"].map(task)),
    running: false,
    iterator: null,
    urgent: null,
    stats: { steps: 0, cpuMilliseconds: 0, maxStepMs: 0, areas: {} },
  };
  const gate = {
    limits: { exitRangeMeters: range, sliceMs: 2, recheckMs: 250 },
    due: () => true,
    open: () => gateOpen,
    begin() {},
    end: (outcome) => log.outcomes.push(outcome),
  };
  const links = [
    { from: "westminster", to: "south", condition: { xMin: 1, yMin: 0 } },
    { from: "westminster", to: "east", condition: { xMin: 10, yMin: 0 } },
  ];
  const world = {
    areaId: "westminster",
    registry: { links: () => links },
    manifest: { links },
    geometry: { point: (p) => ({ x: p.x, y: p.z }), ground: (p) => ({ x: p.x, z: p.y }) },
    isAreaReady: (area) => log.ready.includes(area),
    markAreaReady: (area) => log.ready.push(area),
    leaseArea(area) {
      log.leases.push(area);
      return () => log.released.push(area);
    },
    prepareArea: async (area) => ({ areaId: area, scene: { add() {} }, camera: {} }),
    unmarkAreaReady() {},
  };
  const actors = {
    bindPreparedArea() {},
    *prepareAreaSteps(area) {
      log.starts.push(area);
      let done = false;
      try {
        for (let i = 0; i < 10; i++) {
          if (i === 3 && state.midRun) state.midRun();
          yield "actor-part";
        }
        done = true;
      } finally {
        if (!done) log.closed.push(area);
      }
    },
    areaViewStats: () => ({ parked, ownedFinisherGeometryBytes: 0, finisherGeometryBudgetBytes: 1 }),
    discardArea: (area) => log.discards.push(area),
  };
  state.actors = actors;
  const s = {
    traveling: false,
    resetting: false,
    loaded: true,
    contextLost: false,
    game,
    world,
    actors,
    scene: { children: [] },
    stageAhead: gate,
    renderer: {
      compileAsync() {
        log.graphics++;
        return Promise.resolve();
      },
      getContext: () => ({
        SYNC_GPU_COMMANDS_COMPLETE: 1,
        ALREADY_SIGNALED: 2,
        CONDITION_SATISFIED: 3,
        fenceSync: () => ({}),
        flush() {},
        clientWaitSync: () => 2,
        deleteSync() {},
      }),
    },
  };
  s.stageAhead.limits.warmGroupObjects = 4;
  const context = vm.createContext({
    TRAVEL: GAME_DATA.areaRuntime.travel,
    s,
    testState: state,
    console: { warn() {}, info() {}, error() {} },
    performance: { now: () => clock++ },
    setTimeout: (fn) => setTimeout(fn, 1),
    requestIdleCallback: (f) => queueMicrotask(() => f({ timeRemaining: () => 50 })),
    prepareParkedResidents: () => ({}),
    relieveGeometryBudget,
    protectedAreas,
    limitParkedAreas,
    PARKED_AREA_LIMIT: { maxAreas: 2 },
    initializeAreaResidents() {},
    applyAreaLighting() {},
    warmFramebuffer() {},
    *warmFramebufferSteps() {
      for (let i = 0; i < 3; i++) {
        if (i === 1 && state.midWarm) state.midWarm();
        log.warmed++;
        yield 1;
      }
    },
  });
  vm.runInContext(`${source.slice(start, end)}\nareaPreparation = testState;`, context);
  state.midRun = null;
  return { context, state, s, log, run: (code) => vm.runInContext(code, context) };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("near the exit and quiet, the nearest neighbour is prepared and warmed without travelling, then marked ready", async () => {
  const r = setup();
  r.run("maybeStageAhead()");
  assert.equal(r.state.ahead, "south", "nearest exit first");
  await settle();
  assert.deepEqual(r.log.starts, ["south"]);
  assert.equal(r.state.tasks.get("south").status, "ready");
  assert.equal(r.state.tasks.get("east").status, "queued");
  assert.equal(r.state.ahead, null);
  assert.deepEqual(r.log.outcomes, ["completed"]);
  assert.equal(r.log.graphics, 1, "shaders compiled once");
  assert.equal(r.log.warmed, 3, "warmed in steps, not in one render");
  assert.deepEqual(r.log.ready, ["south"]);
  assert.deepEqual(r.log.released, ["south", "south"], "the stage leases are given back");
});

test("a travel to another area during the warm stops it before the area is marked ready", async () => {
  const r = setup();
  r.state.midWarm = () => r.run("abortStageAhead('east')");
  r.run("maybeStageAhead()");
  await settle();
  assert.deepEqual(r.log.ready, [], "never marked ready");
  assert.deepEqual(r.log.outcomes, ["aborted"]);
  assert.equal(r.state.ahead, null);
  assert.equal(r.state.abortArea, null);
  assert.equal(r.run("aheadFailed.size"), 0);
  assert.ok(r.log.warmed < 3, "the remaining steps did not run");
  assert.deepEqual(r.log.released, ["south", "south"]);
});

test("a travel to the same area during the warm finishes the rest without waiting", async () => {
  const r = setup();
  r.state.midWarm = () => {
    r.s.traveling = true;
  };
  r.run("maybeStageAhead()");
  await settle();
  assert.equal(r.log.warmed, 3);
  assert.deepEqual(r.log.ready, ["south"]);
});

test("nothing starts while the gate is closed, out of range, or once the area is prepared", async () => {
  for (const options of [{ gateOpen: false }, { range: 0.5 }]) {
    const r = setup(options);
    r.run("maybeStageAhead()");
    await settle();
    assert.equal(r.state.ahead ?? null, null);
    assert.deepEqual(r.log.starts, []);
  }
  const r = setup();
  r.run("maybeStageAhead()");
  await settle();
  r.run("maybeStageAhead()");
  await settle();
  assert.deepEqual(r.log.starts, ["south"], "a prepared neighbour is not prepared again");
});

test("no second run starts while one is going", async () => {
  const r = setup();
  r.run("maybeStageAhead()");
  r.run("maybeStageAhead()");
  await settle();
  assert.deepEqual(r.log.starts, ["south"]);
});

test("a travel to another area stops the run, closes the half-built views and does not count as a failure", async () => {
  const r = setup();
  r.state.midRun = () => r.run("abortStageAhead('east')");
  r.run("maybeStageAhead()");
  await settle();
  assert.deepEqual(r.log.closed, ["south"], "partial views are released");
  assert.equal(r.state.tasks.get("south").status, "failed");
  assert.equal(r.state.ahead, null);
  assert.equal(r.state.abortArea, null);
  assert.deepEqual(r.log.outcomes, ["aborted"]);
  assert.equal(r.run("aheadFailed.size"), 0, "an abort is not remembered as a failure");
});

test("a travel to the same area keeps the run going", async () => {
  const r = setup();
  r.state.midRun = () => r.run("abortStageAhead('south')");
  r.run("maybeStageAhead()");
  await settle();
  assert.equal(r.state.tasks.get("south").status, "ready");
  assert.deepEqual(r.log.outcomes, ["completed"]);
});

test("a failing run is remembered so the same exit is not retried every check", async () => {
  const r = setup();
  r.s.world.prepareArea = async () => {
    throw Error("boom");
  };
  r.run("maybeStageAhead()");
  await settle();
  assert.equal(r.state.tasks.get("south").status, "failed");
  r.state.tasks.delete("south");
  r.run("maybeStageAhead()");
  await settle();
  assert.equal(r.run("aheadFailed.size"), 1);
  assert.deepEqual(r.log.outcomes, ["aborted"]);
  assert.deepEqual(r.log.starts, []);
});

test("an older parked area makes room first: the area just left plus the one being prepared", async () => {
  const r = setup({
    parked: [
      { area: "lambeth", count: 3 },
      { area: "area8", count: 2 },
    ],
  });
  r.run("maybeStageAhead()");
  await settle();
  assert.deepEqual(r.log.discards, ["lambeth"], "least recently parked goes; the current area and target stay");
});

test("a hold waits for the gate and a travel never waits", async () => {
  const r = setup();
  let held = true;
  r.state.hold = () => held;
  r.state.holdMs = 1;
  let granted = false;
  r.run("preparationTurn(testState)").then(() => (granted = true));
  await settle();
  assert.equal(granted, false, "held while the gate is shut");
  held = false;
  await settle();
  assert.equal(granted, true);
  r.state.urgent = "east";
  held = true;
  assert.ok((await r.run("preparationTurn(testState)")) > 0, "a travel is never held");
});
