import test from "node:test";
import assert from "node:assert/strict";
import { createAutoPickup, nearestInteraction, startingPistolCandidate, claimStartingPistol } from "../src/engine/run-views.js";
import { createBossEquipmentView } from "../src/engine/boss-equipment-view.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";
import { fixture } from "./helpers/rifle-fixture.js";

// Dom, 26 Oct 2026: weapons on the floor are picked up by walking into reach. No Collect button, no Tap COLLECT notice.
const spot = { x: 0, z: -6 };

test("the shared pickup step runs a walked-in pickup once and repeats nothing while it is still listed", () => {
  const step = createAutoPickup();
  let runs = 0;
  const pickup = { id: "a", pickup: true, position: { x: 1, z: 0 }, run: () => ++runs };
  assert.equal(step({ x: 0, z: 0 }, []), false, "nothing in reach, nothing claimed");
  assert.equal(step({ x: 0, z: 0 }, [pickup]), true);
  assert.equal(runs, 1);
  for (let frame = 0; frame < 5; frame++) assert.equal(step({ x: 0, z: 0 }, [pickup]), false, "a claim in flight is not repeated");
  assert.equal(runs, 1);
  step({ x: 9, z: 9 }, []);
  assert.equal(step({ x: 0, z: 0 }, [pickup]), true, "once it left the list and came back, it is a fresh pickup");
  assert.equal(runs, 2);
});

test("a claim that did not take (still listed) is retried with a back-off: after 1 s, 2 s, then every 4 s, and stops once claimed", () => {
  const step = createAutoPickup();
  let runs = 0,
    claimed = false;
  const pickup = { id: "a", pickup: true, position: { x: 1, z: 0 }, run: () => ++runs };
  const at = (t) => step({ x: 0, z: 0 }, claimed ? [] : [pickup], t);
  const times = [];
  for (let t = 0; t <= 14; t += 0.1) {
    t = Math.round(t * 10) / 10;
    const before = runs;
    at(t);
    if (runs > before) times.push(t);
  }
  assert.deepEqual(times, [0, 1, 3, 7, 11], "runs at 0, +1, +2, +4, +4: never every frame");
  claimed = true;
  at(15);
  assert.equal(runs, 5, "once the pickup is gone it is not run again");
});

test("the back-off comes from weapons.json autoPickupRetry, is validated, and can be overridden for a test", async () => {
  const fs = await import("node:fs");
  const { GAME_DATA, validateWeapons } = await import("../src/engine/game-data.js");
  assert.deepEqual(GAME_DATA.weapons.autoPickupRetry, { firstSeconds: 1, maxSeconds: 4 });
  const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/weapons.json", import.meta.url))));
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateWeapons(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.autoPickupRetry; }));
  assert.throws(broken((d) => { d.autoPickupRetry.extra = 1; }));
  assert.throws(broken((d) => { d.autoPickupRetry.firstSeconds = 0; }));
  assert.throws(broken((d) => { d.autoPickupRetry.maxSeconds = 0.5; }));
  assert.throws(broken((d) => { d.autoPickupRetry.maxSeconds = 600; }));
  const step = createAutoPickup({ firstSeconds: 2, maxSeconds: 2 });
  let runs = 0;
  const pickup = { id: "a", pickup: true, position: { x: 1, z: 0 }, run: () => ++runs };
  for (const t of [0, 1, 2, 3, 4]) step({ x: 0, z: 0 }, [pickup], t);
  assert.equal(runs, 3, "a 2 s back-off runs at 0, 2 and 4");
});

test("leaving reach resets the back-off: coming back is a fresh, immediate pickup", () => {
  const step = createAutoPickup();
  let runs = 0;
  const pickup = { id: "a", pickup: true, position: { x: 1, z: 0 }, run: () => ++runs };
  step({ x: 0, z: 0 }, [pickup], 10);
  step({ x: 0, z: 0 }, [pickup], 10.5);
  assert.equal(runs, 1);
  step({ x: 9, z: 0 }, [], 11);
  step({ x: 0, z: 0 }, [pickup], 11.2);
  assert.equal(runs, 2);
});

test("a refused real claim (storage full) is retried once the player is still in reach and storage frees up", () => {
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => ({}) };
  let storageFull = true,
    attempts = 0;
  const g = {
    time: 1,
    events: [],
    player: { hp: 150, pos: { x: 0, z: 0 }, hurtUntil: 0, dodgeUntil: 0, ready: 0 },
    world: { areaId: "westminster", bossEquipmentData: { emberProjector: profiles.emberProjector }, lineClear: () => true },
    bossEquipment: { emberProjector: { status: "pending", dropPosition: { x: 1, z: 0 } } },
  };
  const s = { game: g, loaded: true, paused: false, actors: { equipmentReady: () => true }, input: { clear() {} } };
  const view = createBossEquipmentView(s, () => {
    attempts++;
    if (storageFull) return { ok: false, events: [] };
    g.bossEquipment.emberProjector.status = "owned";
    return { ok: true, events: [] };
  });
  try {
    const step = createAutoPickup();
    const frame = (time) => step(g.player.pos, view.interaction(), time);
    frame(1);
    for (let t = 1.05; t < 1.9; t += 0.05) frame(t);
    assert.equal(attempts, 1, "refused once, not retried every frame");
    storageFull = false;
    frame(2.1);
    assert.equal(attempts, 2, "retried after the back-off");
    assert.equal(g.bossEquipment.emberProjector.status, "owned");
    for (let t = 2.2; t < 4; t += 0.1) frame(t);
    assert.equal(attempts, 2, "claimed: no more attempts");
  } finally {
    view.dispose();
    globalThis.document = previous;
  }
});

test("only pickups are claimed automatically; doors and contacts wait for the button", () => {
  const step = createAutoPickup();
  let door = 0,
    item = 0;
  const candidates = [
    { id: "safehouse", position: { x: 0.1, z: 0 }, run: () => ++door },
    { id: "gun", pickup: true, position: { x: 0.5, z: 0 }, run: () => ++item },
  ];
  step({ x: 0, z: 0 }, candidates);
  assert.deepEqual([door, item], [0, 1]);
  assert.equal(nearestInteraction({ x: 0, z: 0 }, candidates.filter((c) => !c.pickup)).id, "safehouse");
});

test("two pickups in reach are claimed one per step, nearest first", () => {
  const step = createAutoPickup(),
    order = [];
  const candidates = [
    { id: "far", pickup: true, position: { x: 1, z: 0 }, run: () => order.push("far") },
    { id: "near", pickup: true, position: { x: 0.2, z: 0 }, run: () => order.push("near") },
  ];
  step({ x: 0, z: 0 }, candidates);
  step({ x: 0, z: 0 }, candidates);
  step({ x: 0, z: 0 }, candidates);
  assert.deepEqual(order, ["near", "far"]);
});

test("walking onto the real starting pistol collects and equips it once; a replayed list entry never repeats it", () => {
  const f = fixture({ areaId: "westminster" });
  f.restore();
  const g = f.g;
  g.player.pos = { x: spot.x - 0.85 + 6, z: spot.z };
  assert.equal(g.pistol.collected, false);
  assert.equal(startingPistolCandidate(g, () => true), null, "out of reach: not a candidate");
  g.player.pos = { x: g.pistol.pickupPos.x + 0.5, z: g.pistol.pickupPos.z };
  const step = createAutoPickup();
  let clears = 0;
  const run = () => claimStartingPistol(g, f.p.dispatchPistol, () => clears++);
  const candidate = startingPistolCandidate(g, run);
  assert.equal(candidate.pickup, true);
  assert.equal(step(g.player.pos, [candidate]), true);
  assert.equal(g.pistol.collected, true);
  assert(g.pistol.equipped);
  assert.equal(g.events.filter((e) => e.type === "pickup").length, 1);
  assert.equal(startingPistolCandidate(g, run), null, "collected: no longer offered");
  assert.equal(step(g.player.pos, [candidate]), false, "a stale list entry is not claimed again");
  assert.equal(g.events.filter((e) => e.type === "pickup").length, 1);
  assert.equal(clears, 1);
});

test("a boss drop (the Ember Projector) is claimed on walking in exactly like any floor weapon, and not out of reach or while blocked", () => {
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => ({}) };
  const calls = [];
  const g = {
    time: 1,
    events: [],
    player: { hp: 150, pos: { x: 0, z: 0 }, hurtUntil: 0, dodgeUntil: 0, ready: 0 },
    world: { areaId: "westminster", bossEquipmentData: { emberProjector: profiles.emberProjector }, lineClear: () => true },
    bossEquipment: { emberProjector: { status: "pending", dropPosition: { x: 1, z: 0 } } },
  };
  const s = { game: g, loaded: true, paused: false, actors: { equipmentReady: () => true }, input: { clear() {} } };
  const view = createBossEquipmentView(s, (run, command) => {
    calls.push(command);
    g.bossEquipment.emberProjector.status = "owned";
    return { ok: true, events: [] };
  });
  try {
    const step = createAutoPickup();
    g.player.pos.x = 4;
    assert.deepEqual(view.interaction(), [], "out of reach");
    step(g.player.pos, view.interaction());
    assert.equal(calls.length, 0);
    g.player.pos.x = 0;
    const [candidate] = view.interaction();
    assert.equal(candidate.pickup, true);
    step(g.player.pos, [candidate]);
    assert.deepEqual(calls, [{ type: "claimPickup", pickupId: "ember-flamethrower-v1" }]);
    step(g.player.pos, [candidate]);
    step(g.player.pos, view.interaction());
    assert.equal(calls.length, 1, "no second claim");
  } finally {
    view.dispose();
    globalThis.document = previous;
  }
});

test("a claim keeps the held move pad: the input is cleared with keepMovement (the walk-on must not drop the thumb)", () => {
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => ({}) };
  const clears = [];
  const g = {
    time: 1,
    events: [],
    player: { hp: 150, pos: { x: 0, z: 0 }, hurtUntil: 0, dodgeUntil: 0, ready: 0 },
    world: { areaId: "westminster", bossEquipmentData: { emberProjector: profiles.emberProjector }, lineClear: () => true },
    bossEquipment: { emberProjector: { status: "pending", dropPosition: { x: 1, z: 0 } } },
  };
  const s = { game: g, loaded: true, paused: false, actors: { equipmentReady: () => true }, input: { clear: (options) => clears.push(options) } };
  const view = createBossEquipmentView(s, () => ({ ok: true, events: [] }));
  try {
    view.interaction()[0].run();
    assert.deepEqual(clears, [{ keepMovement: true }]);
  } finally {
    view.dispose();
    globalThis.document = previous;
  }
});

test("every weapon claim and equip clears with keepMovement, never a bare input.clear()", async () => {
  const fs = await import("node:fs");
  for (const file of ["engine/boss-equipment-view.js", "engine/rifle-view.js", "unique-reward-view.js", "engine/flame-view.js", "engine/run-views.js"])
    assert.doesNotMatch(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), /input\??\.clear\(\)/, file);
});

test("every pickup producer marks its candidate, and no Collect button or Tap COLLECT notice is left in the source", async () => {
  const fs = await import("node:fs");
  const read = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  for (const file of ["engine/flame-view.js", "unique-reward-view.js", "engine/rifle-view.js", "engine/boss-equipment-view.js"])
    assert.match(read(file), /label: [^\n]*Collect[^\n]*\n\s*pickup: true,/, file);
  assert.doesNotMatch(read("first-time-hints.json"), /COLLECT/i);
  assert.match(read("engine/run-views.js"), /filter\(\(c\) => !c\.pickup\)/, "the shared button only offers non-pickups");
});
