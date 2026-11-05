import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createGame } from "../src/combat.js";
import { createBrowserLoop } from "../src/engine/loop.js";

const boss = { bossProfile: {}, pos: { x: 5, z: 6 } };
const death = [{ type: "death", actor: boss }];

// Drives the real frame() with a fake clock and a recording world.update.
function rig(listen) {
  const camera = new THREE.PerspectiveCamera(),
    calls = [];
  const world = {
    areaId: "westminster",
    camera,
    cameraRight: { x: 1, z: 0 },
    cameraForward: { x: 0, z: 1 },
    move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
    lineClear: () => true,
    toRender: (p, h) => new THREE.Vector3(p.x, h, p.z),
    update: (...args) => calls.push(args),
  };
  const game = createGame(world, { pilot: "donor-knife" });
  const s = {
    world,
    game,
    paused: false,
    traveling: false,
    loaded: true,
    contextLost: false,
    scene: {},
    camera,
    rim: { position: new THREE.Vector3() },
    canvas: { clientHeight: 393, clientWidth: 852 },
    input: { take: () => ({ move: { x: 0, y: 0 }, actions: [], held: [] }), clear() {} },
    effects: { advance() {}, events() {}, update() {}, pistolRecoil: () => 0, render() {} },
    actors: { events() {}, update() {} },
    audio: { play() {} },
    hud: { update() {} },
    areas: { checkExit: () => false },
    persistRun: () => true,
    collectNearbySupplies() {},
    collectNearbyVest() {},
    updateSupplies() {},
    updateVestBag() {},
    emit() {},
    listen,
  };
  return { s, calls, loop: createBrowserLoop(s), world, game };
}
const withScreen = (fn) => {
  const before = { w: globalThis.innerWidth, h: globalThis.innerHeight };
  globalThis.innerWidth = 852;
  globalThis.innerHeight = 393;
  try {
    return fn();
  } finally {
    globalThis.innerWidth = before.w;
    globalThis.innerHeight = before.h;
  }
};
const view = (r) => r.calls.at(-1)[5];
const arm = (r) => {
  r.loop.step(1 / 60); // the first frame records the game and area; arm after it
  r.loop.deathCam.observe(death);
  r.loop.step(1 / 60);
  assert.ok(view(r), "effect active and passed to world.update");
};

test("real frame: a boss death scales simulation time once and feeds the camera; idle frames pass null", () =>
  withScreen(() => {
    const r = rig();
    r.loop.step(1 / 60);
    assert.equal(view(r), null);
    const base = r.game.time;
    arm(r);
    assert.equal(view(r).zoomMul > 1, true);
    assert.deepEqual(view(r).focus, { x: 5, z: 6 });
    for (let i = 0; i < 9; i++) r.loop.step(1 / 60);
    assert.ok(r.game.time - base < (10 / 60) * 0.8, "slowed, not full rate");
    for (let i = 0; i < 90; i++) r.loop.step(1 / 60); // 1.5 s real: window over
    assert.equal(view(r), null);
  }));

test("real frame resets: travel, player death, area change, new game, dt spike, visibility hidden", () =>
  withScreen(() => {
    const hooks = {
      travel: (r) => (r.s.traveling = true),
      "player death": (r) => (r.game.player.hp = 0),
      "area change": (r) => (r.world.areaId = "elsewhere"),
      "new game": (r) => (r.s.game = createGame(r.world, { pilot: "donor-knife" })),
    };
    for (const [name, hit] of Object.entries(hooks)) {
      const r = rig();
      arm(r);
      hit(r);
      r.loop.step(1 / 60);
      r.s.traveling = false;
      r.s.game.player.hp = 100;
      r.loop.step(1 / 60);
      assert.equal(view(r) ?? null, null, name);
      assert.equal(r.loop.deathCam.active(), false, name);
    }
    const spiked = rig();
    arm(spiked);
    spiked.loop.step(2);
    assert.equal(spiked.loop.deathCam.active(), false, "dt spike");
    const listeners = [];
    const before = globalThis.document;
    globalThis.document = { hidden: false };
    try {
      const r = rig((target, type, fn) => listeners.push([type, fn]));
      arm(r);
      globalThis.document.hidden = true;
      for (const [type, fn] of listeners) if (type === "visibilitychange") fn();
      assert.equal(r.loop.deathCam.active(), false, "hidden");
      assert.equal(
        listeners.some(([t]) => t === "visibilitychange"),
        true,
      );
    } finally {
      if (before === undefined) delete globalThis.document;
      else globalThis.document = before;
    }
  }));

test("real frame: chained boss deaths do not restart the effect inside the cooldown", () =>
  withScreen(() => {
    const r = rig();
    let slowFrames = 0;
    r.loop.deathCam.observe(death);
    for (let i = 0; i < 300; i++) {
      r.loop.deathCam.observe(death);
      r.loop.step(1 / 60);
      if (view(r)) slowFrames++;
    }
    assert.ok(slowFrames / 60 <= 1.3, `slow frames ${slowFrames}`);
  }));

test("loop.js calls the resets from every hook (source check)", () => {
  const src = readFileSync(new URL("../src/engine/loop.js", import.meta.url), "utf8");
  assert.match(
    src,
    /s\.traveling \|\| s\.game\.player\.hp <= 0 \|\| s\.game !== seenGame \|\| s\.world\.areaId !== seenArea\) deathCam\.reset\(\)/,
  );
  assert.match(src, /visibilitychange[\s\S]{0,120}deathCam\.reset\(\)/);
  assert.match(src, /reset\(\) \{\s*deathCam\.reset\(\)/);
});

test("the tab-hidden listener goes through the session owner registry: released by dispose, never bound directly", () => {
  const before = globalThis.document,
    bindings = new Map(),
    released = [];
  globalThis.document = {
    hidden: false,
    addEventListener: () => assert.fail("loop must not bind the document itself"),
  };
  try {
    const listen = (target, type, fn) => {
      bindings.set(fn, type);
      released.push(() => bindings.delete(fn));
    };
    withScreen(() => {
      rig(listen);
      assert.equal(bindings.size, 1);
      rig(listen); // a recreated loop registers its own once; the old one is released with its owner
      assert.equal(bindings.size, 2);
    });
    for (const release of released) release(); // what session.dispose() does for every listen() entry
    assert.equal(bindings.size, 0);
    assert.ok(rig().loop); // no registry (unit harness): no binding at all
  } finally {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  }
  const session = readFileSync(new URL("../src/engine/browser-session.js", import.meta.url), "utf8");
  assert.match(session, /\n    listen, \/\/ the session's DOM-owner registry/);
});
