import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createGeometry } from "../src/world-geometry.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createWorldPickups } from "../src/engine/world-pickups-view.js";
import { WORLD_PICKUPS, placementsFor, stashCash, stepWorldPickups, worldPickupState } from "../src/engine/world-pickups-core.js";
import { LOCKER_RESOURCE_RULES } from "../src/engine/locker-state.js";
import { lockerInventory } from "../src/engine/locker-core.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../public/world/manifest.json", import.meta.url), "utf8"));
const layoutOf = (id) => JSON.parse(fs.readFileSync(new URL(`../public/world/${id}/layout.json`, import.meta.url), "utf8"));
const areas = Object.keys(WORLD_PICKUPS.placements);
const caps = LOCKER_RESOURCE_RULES;
test("taking a cash stash notes one claim for the server; a medkit notes none", () => {
  const spot = Object.values(WORLD_PICKUPS.placements).flat().find((p) => p.type === "cashStash"),
    kit = Object.values(WORLD_PICKUPS.placements).flat().find((p) => p.type === "medkit");
  const area = Object.keys(WORLD_PICKUPS.placements).find((id) => WORLD_PICKUPS.placements[id].includes(spot)),
    kitArea = Object.keys(WORLD_PICKUPS.placements).find((id) => WORLD_PICKUPS.placements[id].includes(kit));
  const g = run({ x: spot.x, z: spot.z });
  stepWorldPickups(g, area, NEVER, null);
  assert.deepEqual(g.cashClaims, [{ source: `stash:${spot.id}`, amount: stashCash(spot.id) }]);
  const h = run({ x: kit.x, z: kit.z });
  stepWorldPickups(h, kitArea, NEVER, null);
  assert.equal(h.cashClaims, undefined);
});
const NEVER = () => false;
const ALWAYS = () => true;
// A run holding every weapon with empty reserves, hurt, carrying nothing.
function run(at, extra = {}) {
  return {
    time: 100,
    events: [],
    finished: false,
    message: "",
    messageUntil: 0,
    player: { hp: 40, maxHP: 100, pos: { ...at } },
    pistol: { collected: true, equipped: true, reserve: 2 },
    rifle: { status: "owned", selected: false, reserve: 0 },
    flameFuel: { collected: true, fuelUnits: 100 },
    bossEquipment: {
      shotgun: { status: "owned", reserve: 0 },
      rocketLauncher: { status: "owned", reserve: 1 },
      grenade: { status: "owned", magazine: 0 },
      commanderPistol: { status: "owned", reserve: 0 },
    },
    marked: { version: 1, carried: 10, bank: 0, bounty: 0 },
    world: { markedData: { maxMoney: 1000 } },
    ...extra,
  };
}
const spot = (type, area = "east") => placementsFor(area).find((p) => p.type === type);
const stand = (g, p) => (g.player.pos = { x: p.x, z: p.z });

test("data: 3 to 5 pickups in every area except the hub, all three kinds, 33 or more in all", () => {
  assert.ok(!areas.includes("central-hub"));
  let total = 0;
  for (const id of areas) {
    const list = placementsFor(id);
    assert.ok(list.length >= 3 && list.length <= 5, `${id}: ${list.length}`);
    // Westminster (the first zone, nothing fought yet) carries no medkit: Dom's ruling, the old one stood on unreachable bridge steps.
    for (const t of id === "westminster" ? ["ammoBox", "cashStash"] : ["medkit", "ammoBox", "cashStash"]) assert.ok(list.some((p) => p.type === t), `${id} lacks ${t}`);
    total += list.length;
  }
  assert.ok(total >= 32);
  assert.equal(GAME_DATA.worldPickups, WORLD_PICKUPS);
});

test("placements stand on open ground, away from the spawn, and apart from each other", () => {
  for (const id of areas) {
    const g = createGeometry(layoutOf(id)),
      entry = g.ground(manifest.entries[id]),
      list = placementsFor(id);
    for (const p of list) {
      assert.ok(g.clear({ x: p.x, z: p.z }, 0), `${p.id} is not on open ground`);
      assert.ok(Math.hypot(p.x - entry.x, p.z - entry.z) > 3 * WORLD_PICKUPS.pickupRadius, `${p.id} sits on the entry point`);
      for (const q of list) if (q !== p) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 2 * WORLD_PICKUPS.pickupRadius, `${p.id} overlaps ${q.id}`);
    }
  }
});

test("no two pickups of the same kind lie within 5 m of each other (a second box next to the first is refused once the first has filled you up)", () => {
  const apart = 5; // tuning-ok: the closest two same-kind pickups may stand, test-only
  for (const id of areas) {
    const list = placementsFor(id);
    for (const p of list) for (const q of list) if (q !== p && q.type === p.type) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= apart, `${p.id} is next to ${q.id}`);
  }
});

test("every kind has a ground-ring label and colours, and each kind's model reads as itself (parts in its own colours)", () => {
  for (const type of Object.keys(WORLD_PICKUPS.models)) {
    const m = WORLD_PICKUPS.markers[type];
    assert.ok(m.label.length > 0 && /^[0-9a-f]{6}$/.test(m.ringColour) && /^[0-9a-f]{6}$/.test(m.labelColour), type);
  }
  assert.ok(WORLD_PICKUPS.models.ammoBox.filter((p) => p.shape === "cylinder").length >= 3, "ammo box carries cartridges");
  assert.ok(WORLD_PICKUPS.models.cashStash.every((p) => p.shape === "cylinder"), "cash is a coin pile");
});

test("medkit heals half of max HP, shows the toast, and is refused at full health without being used up", () => {
  const p = spot("medkit"),
    g = run(p);
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 90);
  assert.equal(g.message, "Medkit +50 HP");
  assert.equal(g.messageUntil, g.time + WORLD_PICKUPS.noticeSeconds);
  g.player.hp = 100;
  g.time += WORLD_PICKUPS.respawnSeconds + 1;
  stepWorldPickups(g, "east", NEVER); // due and unseen: it is back
  g.player.hp = 100;
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.message, "Health is full");
  assert.equal(worldPickupState(g).until[p.id], undefined, "a refused pickup stays on the ground");
  g.player.hp = 70;
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 100, "heal never passes max HP");
});

test("ammo box refills every owned weapon to its cap, including grenades, flamer fuel and arc, and leaves unowned weapons empty", () => {
  const p = spot("ammoBox"),
    g = run(p);
  stepWorldPickups(g, "east", NEVER);
  const ammo = lockerInventory(g).ammo;
  for (const [key, cap] of Object.entries(caps)) assert.equal(ammo[key], cap.carryCap, key);
  assert.equal(g.message, "Ammo refilled");
  const bare = run(p, { rifle: undefined, flameFuel: undefined, bossEquipment: undefined, pistol: { collected: false, reserve: 0 } });
  stepWorldPickups(bare, "east", NEVER);
  assert.equal(bare.pistol.reserve, 0);
  assert.equal(bare.message, "Ammo is full", "nothing owned means nothing to fill, and the box stays");
});

test("a full ammo box is refused and not used up", () => {
  const p = spot("ammoBox"),
    g = run(p);
  stepWorldPickups(g, "east", NEVER);
  g.time += WORLD_PICKUPS.respawnSeconds + 1;
  stepWorldPickups(g, "east", NEVER);
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.message, "Ammo is full");
  assert.equal(worldPickupState(g).until[p.id], undefined);
});

test("cash stash adds a whole number of steps between min and max to the carried cash, capped by the money limit", () => {
  const p = spot("cashStash"),
    g = run(p),
    rule = WORLD_PICKUPS.items.cashStash;
  stepWorldPickups(g, "east", NEVER);
  const gained = g.marked.carried - 10;
  assert.ok(gained >= rule.min && gained <= rule.max && (gained - rule.min) % rule.step === 0, `gained ${gained}`);
  assert.equal(g.message, `+$${gained}`);
  for (let n = 0; n < 40; n++) assert.ok(stashCash(p.id, n) >= rule.min && stashCash(p.id, n) <= rule.max);
  const full = run(p);
  full.marked.carried = 995;
  stepWorldPickups(full, "east", NEVER);
  assert.equal(full.marked.carried, 1000, "capped at the limit");
  const maxed = run(p);
  maxed.marked.carried = 1000;
  stepWorldPickups(maxed, "east", NEVER);
  assert.equal(maxed.message, "Cannot carry more cash");
});

test("a taken pickup returns 180 s later, and only once its spot is off screen", () => {
  const p = spot("medkit"),
    g = run(p);
  stepWorldPickups(g, "east", ALWAYS);
  const taken = g.time;
  assert.equal(worldPickupState(g).until[p.id], taken + 180);
  g.player.hp = 10;
  g.time = taken + 179;
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 10, "still gone at 179 s");
  g.time = taken + 181;
  stepWorldPickups(g, "east", ALWAYS);
  assert.equal(g.player.hp, 10, "due but on screen: stays gone");
  assert.notEqual(worldPickupState(g).until[p.id], undefined);
  stepWorldPickups(g, "east", NEVER);
  assert.equal(worldPickupState(g).until[p.id], undefined, "off screen: it is back");
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 60, "and can be taken again");
});

test("a pickup is not taken when out of reach, when dead, or in another area; and respawn state survives leaving the area", () => {
  const p = spot("medkit"),
    g = run({ x: p.x + 3 * WORLD_PICKUPS.pickupRadius, z: p.z });
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 40);
  stand(g, p);
  g.player.hp = 0;
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 0);
  g.player.hp = 40;
  stepWorldPickups(g, "south", NEVER);
  stepWorldPickups(g, "central-hub", NEVER);
  assert.equal(g.player.hp, 40);
  stepWorldPickups(g, "east", NEVER);
  assert.equal(g.player.hp, 90);
  stepWorldPickups(g, "south", NEVER);
  assert.notEqual(worldPickupState(g).until[p.id], undefined, "timer is on the run, not the area");
});

test("Westminster tutorial: walking the spawn and the start path takes nothing", () => {
  const g = createGeometry(layoutOf("westminster")),
    entry = g.ground(manifest.entries.westminster),
    run1 = run(entry);
  run1.player.hp = 100;
  stepWorldPickups(run1, "westminster", NEVER);
  assert.deepEqual(worldPickupState(run1).until, {});
  assert.equal(run1.message, "");
  assert.equal(run1.marked.carried, 10);
});

function fakeWorld(areaId) {
  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 500);
  camera.position.set(0, 6, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    THREE,
    areaId,
    group: new THREE.Group(),
    camera,
    toRender: (p, y = 0) => new THREE.Vector3(p.x, y, -p.z),
  };
}

test("view: one instanced mesh per kind, taken pickups vanish and come back, dispose is clean", () => {
  const world = fakeWorld("east"),
    view = createWorldPickups(world),
    meshes = view.group.children.filter((c) => c.isInstancedMesh);
  assert.equal(meshes.length, 3);
  assert.equal(meshes.reduce((n, m) => n + m.count, 0), placementsFor("east").length);
  const g = run(spot("medkit"));
  view.sync(g);
  const medkitMesh = meshes.find((m) => m.userData.pickupType === "medkit"),
    scaleOf = () => {
      const e = medkitMesh.instanceMatrix.array;
      return Math.hypot(e[0], e[1], e[2]) / WORLD_PICKUPS.displayScale;
    };
  assert.ok(scaleOf() > 0.9, "shown");
  view.collect(g, world.camera);
  view.sync(g);
  assert.equal(scaleOf(), 0, "hidden after it is taken");
  g.time += WORLD_PICKUPS.respawnSeconds + 1;
  const p = spot("medkit");
  world.camera.position.set(p.x, 6, -p.z + 12);
  world.camera.lookAt(p.x, 0, -p.z);
  world.camera.updateMatrixWorld(true);
  assert.ok(view.inView(p, world.camera), "camera is on the spot");
  view.collect(g, world.camera);
  view.sync(g);
  assert.equal(scaleOf(), 0, "due but in view: still hidden");
  world.camera.lookAt(p.x, 0, -p.z + 100);
  world.camera.updateMatrixWorld(true);
  assert.ok(!view.inView(p, world.camera), "camera looks away");
  view.collect(g, world.camera);
  view.sync(g);
  assert.ok(scaleOf() > 0.9, "off screen: back");
  view.dispose();
  assert.equal(world.group.children.length, 0);
});

test("view: the hub has no pickups and builds nothing", () => {
  const view = createWorldPickups(fakeWorld("central-hub"));
  assert.equal(view.group.children.length, 0);
  view.sync(run({ x: 0, z: 0 }));
  view.dispose();
});
