import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createGame } from "../src/combat.js";
import { createBrowserLoop } from "../src/engine/loop.js";
import { createGameFeel } from "../src/engine/game-feel.js";
import { validateGameFeel } from "../src/engine/game-data-game-feel.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// Hit-stop, trauma-style camera shake and the View zoom preset (data/gameFeel.json, engine/game-feel.js). Presentation only.
const D = GAME_DATA.gameFeel;
const rule = (id) => D.rules.find((r) => r.id === id);
const player = { id: 0, hp: 100, maxHP: 100, pos: { x: 0, z: 0 } };
const grunt = { id: 7, hp: 10, maxHP: 10, pos: { x: 1, z: 1 } };
const boss = { id: 8, bossProfile: {}, hp: 90, maxHP: 100, pos: { x: 2, z: 2 } };
const game = (enemies = [grunt, boss]) => ({ player, enemies });
const blockedStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};
const fixed = (opts = {}) => {
  const store = new Map(),
    win = {
      localStorage: opts.noStorage
        ? blockedStorage
        : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    };
  const state = { mode: opts.mode ?? "high", reduced: !!opts.reduced };
  const feel = createGameFeel({ data: D, doc: opts.doc, win, mode: () => state.mode, reduced: () => state.reduced });
  return { feel, store, state };
};
const frames = (feel, count, dt = 1 / 60, options) => {
  let frozen = 0;
  for (let i = 0; i < count; i++) frozen += dt * (1 - feel.tick(dt, options));
  return frozen;
};
const bossHit = { type: "hit", actor: boss, amount: 5, weapon: "knife" };
const gruntHit = { type: "hit", actor: grunt, amount: 3, weapon: "knife" };
const parry = { type: "parry", actor: player };
const hurt = (amount, extra = {}) => ({ type: "hit", actor: player, amount, ...extra });
const blast = { type: "grenade-blast", id: 1, position: { x: 3, z: 0 } };
const zero = { x: 0, y: 0 };

test("the data validates, is closed, and holds the asked-for numbers", () => {
  assert.throws(() => validateGameFeel({ ...D, extra: 1 }));
  assert.throws(() => validateGameFeel({ ...D, rules: [{ ...D.rules[0], hitStop: 0.5 }] }));
  assert.throws(() => validateGameFeel({ ...D, rules: [{ ...D.rules[0], shake: { magnitude: 9, seconds: 0.4 } }] }));
  assert.throws(() => validateGameFeel({ ...D, rules: [{ ...D.rules[0], shake: { magnitude: 1, seconds: 3 } }] }));
  assert.throws(() => validateGameFeel({ ...D, rules: [D.rules[0], D.rules[0]] }));
  assert.throws(() => validateGameFeel({ ...D, view: { ...D.view, default: "close" } }));
  assert.equal(D.view.default, "standard");
  assert.equal(D.view.presets.find((p) => p.id === "close").multiplier, 1.15);
  for (const r of D.rules.filter((x) => x.hitStop)) assert.ok(r.hitStop >= 0.06 && r.hitStop <= 0.1, r.id);
  assert.equal(rule("parry").hitStop, 0.1);
  assert.equal(rule("guard-break").hitStop, 0.1);
  assert.equal(rule("explosion").shake.magnitude, 2);
  assert.equal(rule("boss-strikes-player").shake.magnitude, 5);
  assert.ok(rule("enemy-hit").shake.magnitude >= 0.5 && rule("player-hurt").shake.magnitude <= 1);
  for (const r of D.rules.filter((x) => x.shake)) assert.ok(r.shake.seconds >= 0.3 && r.shake.seconds <= 0.5, r.id);
});

test("hit-stop starts only on heavy events", () => {
  const heavy = {
    "boss hit taken": [bossHit],
    "kill of a star": [{ type: "death", actor: { ...grunt, star: 1 } }],
    "kill of a marked hunter": [{ type: "death", actor: { ...grunt, markedHunter: true } }],
    "finisher kill": [{ type: "death", actor: { ...grunt, finisher: { cost: 1 } } }],
    "player takes over 20% of max HP": [hurt(21)],
    parry: [parry],
    "guard break": [{ type: "guard-break", actor: player }],
  };
  for (const [name, events] of Object.entries(heavy)) {
    const { feel } = fixed();
    assert.equal(feel.observe(events, game()), true, name);
    assert.ok(feel.hitStopSeconds >= 0.06 && feel.hitStopSeconds <= 0.1, `${name}: ${feel.hitStopSeconds}`);
  }
  const light = {
    "ordinary enemy hit": [gruntHit],
    "plain kill": [{ type: "death", actor: grunt }],
    "player takes exactly 20%": [hurt(20)],
    "player takes a small hit": [hurt(5)],
    "a blocked big hit": [hurt(60, { blocked: true })],
    "flame on a boss": [{ ...bossHit, weapon: "flamethrower" }],
  };
  for (const [name, events] of Object.entries(light)) {
    const { feel } = fixed();
    feel.observe(events, game());
    assert.equal(feel.hitStopSeconds, 0, name);
  }
  const { feel } = fixed();
  feel.observe([parry], game());
  assert.equal(feel.hitStopSeconds, 0.1, "a parry is 100 ms");
});

test("hit-stop never stacks: overlapping events keep the longest, and the freeze lasts exactly that long", () => {
  const { feel } = fixed();
  feel.observe([bossHit], game());
  feel.observe([parry], game());
  assert.equal(feel.hitStopSeconds, 0.1);
  feel.observe([hurt(30)], game()); // 0.08 is shorter than what is left
  assert.equal(feel.hitStopSeconds, 0.1);
  feel.reset();
  feel.observe([hurt(30), bossHit, { type: "death", actor: { ...grunt, star: 1 } }], game());
  assert.equal(feel.hitStopSeconds, 0.08, "three events in one step: the max, not the sum");
  const frozen = frames(feel, 30);
  assert.ok(Math.abs(frozen - 0.08) < 1e-9, `frozen ${frozen}`);
  assert.equal(feel.hitStopSeconds, 0);
  assert.equal(feel.tick(1 / 60), 1);
});

test("a rapid repeat of a rate-limited rule is ignored until its cooldown passes", () => {
  const { feel } = fixed();
  feel.observe([bossHit], game());
  frames(feel, 30);
  feel.observe([bossHit], game());
  assert.ok(feel.hitStopSeconds > 0, "half a second later the cooldown is over");
  feel.reset();
  feel.observe([bossHit], game());
  frames(feel, 6); // 0.1 s: stop over, still inside the 0.3 s cooldown
  feel.observe([bossHit], game());
  assert.equal(feel.hitStopSeconds, 0);
});

test("hit-stop is off under Feedback Off and reduced motion, shorter under Low, and never in a menu or a scripted step", () => {
  for (const [name, opts] of [
    ["off", { mode: "off" }],
    ["reduced motion", { reduced: true }],
  ]) {
    const { feel } = fixed(opts);
    assert.equal(feel.observe([parry], game()), false, name);
    assert.equal(feel.hitStopSeconds, 0, name);
    assert.equal(feel.tick(1 / 60), 1, name);
  }
  const low = fixed({ mode: "low" });
  low.feel.observe([parry], game());
  assert.ok(Math.abs(low.feel.hitStopSeconds - 0.1 * D.modeScale.low) < 1e-9);
  const live = fixed(); // switching the setting mid-freeze ends it at once
  live.feel.observe([parry], game());
  live.state.mode = "off";
  assert.equal(live.feel.tick(1 / 60), 1);
  assert.equal(live.feel.hitStopSeconds, 0);
  const paused = fixed();
  paused.feel.observe([parry], game());
  assert.equal(paused.feel.tick(1 / 60, { paused: true }), 1);
  assert.equal(paused.feel.tick(1 / 60), 1, "a menu clears the freeze; it does not resume afterwards");
  const scripted = fixed();
  scripted.feel.observe([parry], game());
  assert.equal(scripted.feel.tick(1 / 60, { scripted: true }), 1);
  assert.equal(scripted.feel.hitStopSeconds, 0);
  assert.equal(fixed().feel.tick(Number.NaN), 1);
});

test("shake: magnitude per class, linear decay to exactly 0 over its seconds", () => {
  const { feel } = fixed();
  assert.deepEqual({ ...feel.shake() }, zero);
  feel.observe([{ type: "boss-defeated", actor: boss }], game());
  assert.equal(feel.shakeAmplitude, 5);
  feel.tick(0.25);
  assert.ok(Math.abs(feel.shakeAmplitude - 2.5) < 1e-9, "half way through 0.5 s: half the magnitude");
  feel.tick(0.125);
  assert.ok(Math.abs(feel.shakeAmplitude - 1.25) < 1e-9, "linear, not exponential");
  feel.tick(0.125);
  assert.equal(feel.shakeAmplitude, 0);
  assert.deepEqual({ ...feel.shake() }, zero);
  feel.tick(5);
  assert.equal(feel.shakeAmplitude, 0, "stays at 0");
  const seen = fixed();
  for (const [events, magnitude] of [
    [[gruntHit], 0.5],
    [[hurt(3)], 1],
    [[blast], 2],
    [[hurt(3, { attackerId: boss.id })], 5],
  ]) {
    seen.feel.reset();
    seen.feel.observe(events, game());
    assert.equal(seen.feel.shakeAmplitude, magnitude);
  }
  const far = fixed();
  far.feel.observe([{ type: "trap-crate-blast", position: { x: 80, z: 0 } }], game());
  assert.equal(far.feel.shakeAmplitude, 0, "a blast out of range does not shake the camera");
});

test("shake: overlapping shakes take the maximum, never the sum", () => {
  const { feel } = fixed();
  feel.observe([hurt(3)], game()); // 1
  feel.observe([gruntHit], game()); // 0.5 is below the live 1
  assert.equal(feel.shakeAmplitude, 1);
  feel.observe([blast], game()); // 2 wins
  assert.equal(feel.shakeAmplitude, 2);
  feel.observe([hurt(3), gruntHit, blast], game());
  assert.equal(feel.shakeAmplitude, 2, "three at once: 2, not 3.5");
  feel.tick(0.1);
  feel.observe([hurt(3)], game()); // 1 is below the decayed 1.5
  assert.ok(Math.abs(feel.shakeAmplitude - 1.5) < 1e-9);
  feel.tick(0.3);
  feel.observe([hurt(3)], game()); // 1 beats the decayed 0.5 and takes over with its own length
  assert.equal(feel.shakeAmplitude, 1);
  for (let i = 0; i < 30; i++) {
    feel.tick(0.02);
    const { x, y } = feel.shake();
    assert.ok(Math.hypot(x, y) <= feel.shakeAmplitude * D.shake.pixelsPerUnit * Math.SQRT2 + 1e-9);
  }
});

test("shake offset: pixels scaled by Feedback, zero when Off or reduced, zero while a menu is open", () => {
  const big = [{ type: "boss-defeated", actor: boss }];
  const measure = (opts) => {
    const { feel } = fixed(opts);
    feel.observe(big, game());
    feel.tick(0.01);
    return { ...feel.shake() };
  };
  const peak = (v) => Math.hypot(v.x, v.y),
    high = measure({ mode: "high" });
  assert.ok(peak(high) > 0 && peak(high) <= 5 * D.shake.pixelsPerUnit * Math.SQRT2);
  assert.ok(Math.abs(peak(measure({ mode: "low" })) - peak(high) * D.modeScale.low) < 0.05);
  assert.deepEqual(measure({ mode: "off" }), zero);
  assert.deepEqual(measure({ reduced: true }), zero);
  const live = fixed();
  live.feel.observe(big, game());
  live.feel.tick(0.01);
  live.state.reduced = true;
  assert.deepEqual({ ...live.feel.shake() }, zero, "turning reduced motion on silences a live shake");
  live.state.reduced = false;
  live.feel.tick(0.01, { paused: true });
  assert.equal(live.feel.shakeAmplitude, 0, "a menu drops the shake");
});

test("the View preset: Standard 1, Close 1.15, persisted per device, bad storage never throws", () => {
  const a = fixed();
  assert.equal(a.feel.preset, "standard");
  assert.equal(a.feel.viewZoom(), 1);
  assert.equal(a.feel.setPreset("close"), true);
  assert.equal(a.feel.viewZoom(), 1.15);
  assert.equal(a.store.get(D.view.storageKey), "close");
  assert.equal(a.feel.setPreset("huge"), false, "an unknown id is refused");
  assert.equal(a.feel.viewZoom(), 1.15);
  const again = createGameFeel({
    data: D,
    win: { localStorage: { getItem: (k) => a.store.get(k) ?? null, setItem() {} } },
    mode: () => "high",
    reduced: () => false,
  });
  assert.equal(again.preset, "close", "a new session on the same device starts on the saved preset");
  assert.equal(createGameFeel({ data: D, win: { localStorage: { getItem: () => "{nope" } } }).preset, "standard");
  const blocked = fixed({ noStorage: true });
  assert.equal(blocked.feel.setPreset("close"), true);
  assert.equal(blocked.feel.viewZoom(), 1.15, "works for the session even when storage is blocked");
  assert.equal(createGameFeel({ data: D, win: {} }).viewZoom(), 1);
  for (const p of D.view.presets) assert.ok(p.multiplier >= 1);
  const off = fixed({ mode: "off", reduced: true }); // a view choice, not an effect: Off and reduced motion leave it alone
  off.feel.setPreset("close");
  assert.equal(off.feel.viewZoom(), 1.15);
});

test("the View select is filled from data, follows the saved value, and changes the preset", () => {
  const nodes = {},
    handlers = {};
  for (const id of ["view-preset", "view-preset-label"])
    nodes[id] = {
      id,
      value: "",
      textContent: "",
      options: [],
      add(o) {
        this.options.push(o);
      },
      removeEventListener() {},
      addEventListener(type, fn) {
        handlers[id + type] = fn;
      },
    };
  const doc = { getElementById: (id) => nodes[id] ?? null },
    store = new Map([[D.view.storageKey, "close"]]);
  const win = {
    Option: class {
      constructor(text, value) {
        Object.assign(this, { text, value });
      }
    },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
  const feel = createGameFeel({ data: D, doc, win, mode: () => "high", reduced: () => false });
  assert.equal(nodes["view-preset-label"].textContent, D.text.viewLabel);
  assert.deepEqual(
    nodes["view-preset"].options.map((o) => [o.value, o.text]),
    D.view.presets.map((p) => [p.id, D.text.presets[p.id]]),
  );
  assert.equal(nodes["view-preset"].value, "close");
  nodes["view-preset"].value = "standard";
  handlers["view-presetchange"]();
  assert.equal(feel.viewZoom(), 1);
  assert.equal(store.get(D.view.storageKey), "standard");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<select id="view-preset"><\/select>/);
});

// The real frame loop with a fake clock. A real frame freezes the simulation; a scripted loop.step never does.
function rig() {
  const camera = new THREE.PerspectiveCamera(),
    updates = [],
    renders = [];
  const world = {
    areaId: "westminster",
    camera,
    cameraRight: { x: 1, z: 0 },
    cameraForward: { x: 0, z: 1 },
    viewZoomMultiplier: 1,
    move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
    lineClear: () => true,
    toRender: (p, h) => new THREE.Vector3(p.x, h, p.z),
    update: (...args) => updates.push([world.viewZoomMultiplier, ...args]),
  };
  const g = createGame(world, { pilot: "donor-knife" });
  const s = {
    world,
    game: g,
    paused: false,
    traveling: false,
    loaded: true,
    contextLost: false,
    scene: {},
    camera,
    rim: { position: new THREE.Vector3() },
    canvas: { clientHeight: 393, clientWidth: 852 },
    input: { take: () => ({ move: { x: 0, y: 0 }, actions: [], held: [] }), clear() {} },
    effects: { advance() {}, events() {}, update() {}, pistolRecoil: () => 0, render: (...args) => renders.push(args) },
    actors: { events() {}, update() {} },
    audio: { play() {} },
    hud: { update() {} },
    areas: { checkExit: () => false },
    persistRun: () => true,
    collectNearbySupplies() {},
    collectNearbyVest() {},
    updateSupplies() {},
    updateVestBag() {},
    updateHeatTally() {},
    emit() {},
  };
  return { s, world, game: g, updates, renders, loop: createBrowserLoop(s) };
}
const screen = (fn) => {
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
const frameMs = 1000 / 60;

test("real frames: a heavy event freezes simulation time for its length; the render and the shake keep running", () =>
  screen(() => {
    const r = rig();
    let ms = 1000;
    const run = (count) => {
      for (let i = 0; i < count; i++) r.loop.frame((ms += frameMs));
    };
    run(3);
    const before = r.game.time;
    run(6);
    assert.ok(r.game.time - before > 5 / 60 - 1e-9, "unfrozen: the simulation advances every frame");
    r.loop.feel.observe([{ type: "parry", actor: r.game.player }], r.game); // 0.1 s
    const frozenAt = r.game.time,
      rendersBefore = r.renders.length;
    run(5); // 5 frames = 0.083 s, all inside the 0.1 s stop
    assert.equal(r.game.time, frozenAt, "no simulation step ran while frozen");
    assert.equal(r.renders.length - rendersBefore, 5, "every frame still renders");
    assert.ok(r.renders.at(-1)[5], "the render receives the shake object");
    run(30);
    const resumed = r.game.time - frozenAt;
    assert.ok(Math.abs(resumed - (30 / 60 - (0.1 - 5 / 60))) < 2 / 60, `35 frames minus a 0.1 s freeze: ${resumed}`);
  }));

test("scripted steps are never frozen, so the deterministic harness is unchanged", () =>
  screen(() => {
    const frozen = rig(),
      plain = rig();
    frozen.loop.step(1 / 60);
    plain.loop.step(1 / 60);
    frozen.loop.feel.observe([{ type: "parry", actor: frozen.game.player }], frozen.game);
    for (let i = 0; i < 30; i++) {
      frozen.loop.step(1 / 60);
      plain.loop.step(1 / 60);
    }
    assert.equal(frozen.game.time, plain.game.time);
    assert.equal(frozen.loop.feel.hitStopSeconds, 0);
  }));

test("the loop applies the View preset to world.viewZoomMultiplier before world.update; Standard leaves it exactly 1", () =>
  screen(() => {
    const r = rig();
    r.loop.step(1 / 60);
    assert.equal(r.updates.at(-1)[0], 1);
    r.loop.feel.setPreset("close");
    r.loop.step(1 / 60);
    assert.equal(r.updates.at(-1)[0], 1.15);
    r.loop.feel.setPreset("standard");
    r.loop.step(1 / 60);
    assert.equal(r.updates.at(-1)[0], 1);
  }));

test("a menu or travel frame is never frozen", () =>
  screen(() => {
    const r = rig();
    r.loop.step(1 / 60);
    r.loop.feel.observe([{ type: "parry", actor: r.game.player }], r.game);
    r.s.paused = true;
    r.loop.frame(5000);
    r.loop.frame(5000 + frameMs);
    r.s.paused = false;
    assert.equal(r.loop.feel.hitStopSeconds, 0);
  }));

// A real world: Close only ever zooms in, so the crop still covers the screen and the view centre stays inside the painting.
const layout = JSON.parse(readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL("../public/world/manifest.json", import.meta.url)));
const { LondonWorld } = await import("../src/world.js");
function realWorld(multiplier) {
  const camera = new THREE.PerspectiveCamera(),
    texture = new THREE.Texture(),
    scene = new THREE.Scene();
  return { camera, world: new LondonWorld({ THREE, scene, camera, layout, texture, manifest, viewZoomMultiplier: multiplier }) };
}

test("Close keeps the crop clamped and covering the viewport; Standard's matrix is bit-identical to the unscaled world", () => {
  const sizes = [
      [1280, 720],
      [390, 844],
      [844, 390],
    ],
    spots = [
      { x: 0.52, y: 0.78 },
      { x: 0.03, y: 0.03 },
      { x: 0.97, y: 0.97 },
      { x: 0.03, y: 0.97 },
    ];
  for (const [width, height] of sizes)
    for (const q of spots) {
      const standard = realWorld(1),
        close = realWorld(1);
      const p = standard.world.geometry.ground(q);
      standard.world.update(p, 1, width, height, true);
      close.world.update(p, 1, width, height, true);
      assert.deepEqual(close.camera.projectionMatrix.toArray(), standard.camera.projectionMatrix.toArray());
      close.world.viewZoomMultiplier = 1.15; // what the loop writes under Close
      close.world.update(p, 1, width, height, true);
      assert.ok(close.world.crop.elements[0] >= standard.world.crop.elements[0], "Close is never wider than Standard");
      const image = close.world.backdrop.geometry.attributes.position,
        bottomLeft = new THREE.Vector3().fromBufferAttribute(image, 0).project(close.camera),
        topRight = new THREE.Vector3().fromBufferAttribute(image, 2).project(close.camera);
      assert.ok(bottomLeft.x <= -1 + 1e-4 && bottomLeft.y <= -1 + 1e-4, "the painting still covers the bottom left");
      assert.ok(topRight.x >= 1 - 1e-4 && topRight.y >= 1 - 1e-4, "the painting still covers the top right");
      const { center } = close.world;
      assert.ok(center.x >= 0 && center.x <= 1 && center.y >= 0 && center.y <= 1);
      standard.world.dispose();
      close.world.dispose();
    }
});
