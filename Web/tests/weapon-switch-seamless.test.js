// Switching weapons must never stop the walk or the next attack (the "freeze" after holstering a gun for the knife).
// These tests drive the real browser loop (engine/loop.js) with the real InputState, the real stepGame and the real run persistence.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { InputState } from "../src/input.js";
import { createBrowserLoop } from "../src/engine/loop.js";
import { createGame } from "../src/combat.js";
import { createRunPersistence } from "../src/engine/run-core.js";
import { armed as armedRifle } from "./helpers/rifle-fixture.js";
import { armedBossEquipment } from "./helpers/boss-equipment-fixture.js";

const STEP = 1 / 60;
// loop.js reads the window size; set it for this file's tests only.
const saved = { innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
globalThis.innerWidth = 852;
globalThis.innerHeight = 393;
after(() => {
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
});
function harness({ g: owner, persistence, world }) {
  const camera = new THREE.PerspectiveCamera(),
    state = new InputState(),
    clears = [];
  Object.assign(world, {
    camera,
    cameraRight: { x: 1, z: 0 },
    cameraForward: { x: 0, z: 1 },
    toRender: (p, h) => new THREE.Vector3(p.x, h, p.z),
    update() {},
  });
  const s = {
    world,
    get game() {
      return owner.g ?? owner;
    },
    paused: false,
    traveling: false,
    loaded: true,
    contextLost: false,
    scene: {},
    camera,
    rim: { position: new THREE.Vector3() },
    canvas: { clientHeight: 393, clientWidth: 852 },
    input: {
      take: () => state.take({ actionEdges: true }),
      clear: (options) => (clears.push(options ?? {}), state.clear(options)),
    },
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
    updateHeatTally() {},
    emit() {},
  };
  for (const name of ["dispatchPistol", "dispatchRifle", "dispatchBossEquipment", "dispatchMarshalPistol", "dispatchFlame"])
    s[name] = persistence[name];
  const loop = createBrowserLoop(s);
  const frame = () => {
    const before = { ...s.game.player.pos };
    loop.step(STEP);
    return Math.hypot(s.game.player.pos.x - before.x, s.game.player.pos.z - before.z);
  };
  return { s, state, clears, frame };
}

// Clear a walking lane east of the player so only the switch can stop the walk.
function openGround(g) {
  g.enemies = [];
  g.encounterActive = false;
  g.player.hp = g.player.maxHp ?? g.player.hp;
}

// Hold "move right", get up to speed, press the weapon's holster action and report every frame after it.
function holsterWhileWalking(h, g, expectWeapon) {
  openGround(g);
  const lanes = { moveRight: [1, 0], moveLeft: [-1, 0], moveUp: [0, 1], moveDown: [0, -1] },
    at = g.player.pos,
    key = Object.keys(lanes).find((name) => g.world.lineClear(at, { x: at.x + lanes[name][0] * 8, z: at.z + lanes[name][1] * 8 }));
  assert.ok(key, "the fixture has a clear lane to walk down");
  h.walk = key;
  h.state.keys.add(key);
  for (let i = 0; i < 30; i++) h.frame();
  assert.equal(g.player.weapon, expectWeapon, "the gun is in hand while walking");
  const speed = h.frame();
  assert.ok(speed > 0, "the fixture walks freely before the switch");
  h.state.down("holster", "heavy", { x: 0, y: 0 });
  const frames = [h.frame()];
  assert.equal(g.player.weapon, "knife", "the holster action puts the knife in hand within one step");
  for (let i = 0; i < 12; i++) frames.push(h.frame());
  return { speed, frames };
}

function assertSeamless({ speed, frames }, h, g) {
  frames.forEach((moved, index) => assert.ok(moved > speed * 0.9, `frame ${index} after the switch moves ${moved} of ${speed}`));
  assert.ok(h.state.keys.has(h.walk), "the held walk key survives the weapon switch");
  assert.ok(!h.clears.some((o) => o.keepMovement !== true), "no switch clears the held movement");
  // The knife attack starts on the very next step and is not locked out by the switch.
  h.state.down("attack", "slash", { x: 0, y: 0 });
  h.frame();
  assert.ok(g.player.swing, "a melee attack starts within one step of the switch");
}

function pistolRun(options = {}) {
  const world = {
    areaId: "westminster",
    spawn: { x: -0.85, z: -6.15 },
    layout: { characterScale: 1.265 },
    move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
    lineClear: () => true,
  };
  const fresh = () => createGame(world, { pilot: "donor-knife", pistol: true, supplies: true, vest: true, ...options });
  const owner = { g: fresh() };
  const persistence = createRunPersistence({
    getRun: () => owner.g,
    setRun: (next) => (owner.g = next),
    createFreshRun: fresh,
    storage: { getItem: () => null, setItem() {} },
  });
  return { owner, h: harness({ g: owner, persistence, world }) };
}

test("pistol to knife: the held walk keeps moving every frame and a knife attack starts at once", () => {
  const { owner, h } = pistolRun();
  h.state.down("pickup", "pickup", { x: 0, y: 0 });
  h.frame();
  assertSeamless(holsterWhileWalking(h, owner.g, "pistol"), h, owner.g);
});

test("pistol to knife with a scripted input step keeps its move", () => {
  const { owner, h } = pistolRun();
  const loop = createBrowserLoop(h.s);
  h.s.input.take = () => assert.fail("the switch dropped the scripted input");
  loop.input({ move: { x: 1, y: 0 }, actions: ["pickup"] });
  loop.step(STEP);
  assert.equal(owner.g.player.weapon, "pistol");
  loop.input({ move: { x: 1, y: 0 }, actions: ["heavy"] });
  loop.step(STEP);
  assert.equal(owner.g.player.weapon, "knife");
  const before = owner.g.player.pos.x;
  loop.step(STEP);
  assert.ok(owner.g.player.pos.x > before, "the scripted move is not dropped by the switch");
});

test("pistol to knife on the touch pad: the held stick keeps its speed through the switch", () => {
  const { owner, h } = pistolRun({ mobileControls: true });
  const take = h.s.input.take;
  h.s.input.take = () => ({ ...take(), mobile: true });
  h.state.down("pickup", "pickup", { x: 0, y: 0 });
  h.frame();
  h.state.down("stick", "move", { x: 0, y: 0 });
  h.state.move("stick", { x: 60, y: 0 });
  for (let i = 0; i < 30; i++) h.frame();
  const speed = h.frame();
  assert.ok(speed > 0 && owner.g.player.weapon === "pistol");
  h.state.down("holster", "heavy", { x: 0, y: 0 });
  const frames = [h.frame(), h.frame(), h.frame()];
  assert.equal(owner.g.player.weapon, "knife");
  frames.forEach((moved, index) => assert.ok(moved > speed * 0.9, `touch frame ${index} moves ${moved} of ${speed}`));
  assert.equal(h.state.take().moveHeld, true, "the thumb stays on the pad");
});

test("rifle to knife keeps the walk", () => {
  const f = armedRifle();
  const h = harness({ g: f, persistence: f.p, world: f.world });
  assert.equal(f.g.player.weapon, "rifle");
  assertSeamless(holsterWhileWalking(h, f.g, "rifle"), h, f.g);
});

for (const field of ["shotgun", "commanderPistol", "rocketLauncher"])
  test(`${field} to knife keeps the walk`, () => {
    const f = armedBossEquipment(field);
    assert.ok(f.p.dispatchBossEquipment(f.g, { type: "equip", itemId: f.world.bossEquipmentData[field].itemId, equipped: true }, true).ok);
    const h = harness({ g: f, persistence: f.p, world: f.world });
    assertSeamless(holsterWhileWalking(h, f.g, f.g.player.weapon), h, f.g);
  });

