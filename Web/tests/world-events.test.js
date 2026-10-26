// W0 of the multiplayer proof: three scripted runs through the REAL game (the browser loop, stepGame, the run
// persistence and its dispatchers; Node only, no renderer) are recorded as world events, then replayed through the
// pure reducer. Each run must replay to the digest of the live end state, with gapless seq, only closed-set types and
// the move rate cap respected. A mutated event must change the digest.
//
// KNOWN LIMIT: layers not yet on the central path (flame, locker, marked, story, railgun, hub, reaper, expedition,
// progression) only enter through the legacy-event mapping until 2a PR3-5. See the header of world-events.js.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { fixture } from "./helpers/rifle-fixture.js";
import { wolfFixture } from "./helpers/wolf-fixture.js";
import { nearBossEnemy } from "./helpers/boss-equipment-fixture.js";
import { createBrowserLoop } from "../src/engine/loop.js";
import { travelTo } from "../src/travel.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { RIFLE_ITEM_ID } from "../src/engine/weapon-catalog.js";
import { PISTOL_ITEM_ID } from "../src/core/pistol-operation.js";
import { createGame, stepGame } from "../src/combat.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import {
  ATTACK_CLASSES,
  DROP_MODES,
  MOVE_FLAGS,
  MOVE_STATES,
  TICK_HZ,
  WEAPON_CODES,
  WEAPON_IDS,
  WORLD_EVENT_CODES,
  instanceKey,
  isLocalActorKey,
  weaponRules,
  worldSpawnRows,
} from "../src/engine/world-events.js";
import {
  WORLD_EVENT_RULES,
  WORLD_EVENT_TYPES,
  applyWorldEvent,
  createJournal,
  projectWorld,
  replayWorld,
  validateWorldEvent,
  withWorldJournal,
  worldDigest,
} from "../src/engine/world-events.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const before = { innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
globalThis.innerWidth = 852;
globalThis.innerHeight = 393;
after(() => {
  for (const [key, value] of Object.entries(before))
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
});

// A fixture world that can travel: the area geometry is swapped by loadArea, as the browser session does.
function travellingWorld(world) {
  Object.assign(world, {
    lineClear: (a, b) => world.geometry.lineClear(a, b),
    move: (p, d, r) => world.geometry.move(p, d, r),
    async loadArea(id, entry) {
      world.areaId = id;
      world.geometry = createGeometry(read("world/" + id + "/layout.json"));
      return world.geometry.ground(entry ?? registry.get(id).entry);
    },
  });
}

// The real browser loop around a fixture run, with the presentation parts stubbed (as engine-loop.test.js does) and
// the session's journal wiring: the loop ingests each step, the persistence dispatchers report their results.
function harness(f) {
  travellingWorld(f.world);
  const journal = createJournal({ retain: Infinity }),
    persistence = withWorldJournal(f.p, { worldJournal: journal }),
    // A camera that sees the whole area, so every creature counts as on screen for the pistol's targeting.
    camera = new THREE.OrthographicCamera(-1e4, 1e4, 1e4, -1e4, -1e4, 1e4);
  Object.assign(f.world, {
    camera,
    cameraRight: { x: 1, z: 0 },
    cameraForward: { x: 0, z: 1 },
    toRender: (p, h) => new THREE.Vector3(p.x, h, p.z),
    update() {},
  });
  const s = {
    world: f.world,
    get game() {
      return f.g;
    },
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
    persistRun: (g) => f.p.persistRun(g),
    collectNearbySupplies: (g, intent) => f.p.collectNearbySupplies(g, intent),
    collectNearbyVest: (g) => f.p.collectNearbyVest(g),
    updateSupplies() {},
    updateVestBag() {},
    emit() {},
    worldJournal: journal,
    dispatchPistol: persistence.dispatchPistol,
    dispatchRifle: persistence.dispatchRifle,
    dispatchBossEquipment: persistence.dispatchBossEquipment,
    dispatchMarshalPistol: persistence.dispatchMarshalPistol,
    dispatchFlame: persistence.dispatchFlame,
  };
  const loop = createBrowserLoop(s);
  // Screen space to domain space is (x, -y) with this camera, so these take domain directions.
  const screen = (v) => (v ? { x: v.x, y: -v.z } : undefined);
  const h = {
    f,
    journal,
    persistence,
    tick(raw = {}) {
      const { move, aim, ...rest } = raw;
      loop.input({ move: screen(move) ?? { x: 0, y: 0 }, fireAim: screen(aim), actions: [], held: [], ...rest });
      loop.step(1 / 60);
    },
    // Put the player on clear ground `gap` metres from the target with a clear line to it (a setup step, not a move).
    jumpNear(target, gap) {
      for (let i = 0; i < 72; i++) {
        const a = (i * Math.PI) / 36,
          spot = { x: target.pos.x + Math.cos(a) * gap, z: target.pos.z + Math.sin(a) * gap };
        if (f.world.geometry.clear(spot, f.g.player.radius) && f.world.lineClear(spot, target.pos)) {
          f.g.player.pos = spot;
          return;
        }
      }
      assert.fail("no clear spot near the target");
    },
    // Walk until `done()` holds, at most `limit` ticks.
    walk(toward, done, limit = 900) {
      for (let i = 0; i < limit && !done(); i++) {
        const p = f.g.player.pos,
          d = { x: toward().x - p.x, z: toward().z - p.z },
          n = Math.hypot(d.x, d.z) || 1;
        h.tick({ move: { x: d.x / n, z: d.z / n } });
      }
      assert(done(), "walk did not arrive");
    },
    // Fire (or reload) the pistol at the target until it is dead, at most `limit` ticks.
    shoot(target, limit = 1500, move = () => undefined) {
      for (let i = 0; i < limit && target.hp > 0; i++) {
        const p = f.g.player.pos,
          aim = { x: target.pos.x - p.x, z: target.pos.z - p.z };
        h.tick({ aim, move: move(i), actions: [f.g.pistol.magazine > 0 ? "fire" : "stab"] });
      }
      const { player, pistol, finished } = f.g;
      assert.equal(target.hp, 0, `target not killed ${JSON.stringify({ hp: player.hp, pistol, finished })}`);
    },
    // Stop every creature, then tick until no move is waiting for the rate cap.
    settle() {
      for (const e of f.g.enemies) Object.assign(e, { moveSpeed: 0, ready: 1e6, swing: null });
      for (let i = 0; i < 12 && journal.pending(f.g) > 0; i++) h.tick();
      assert.equal(journal.pending(f.g), 0, "moves still pending");
    },
  };
  return h;
}

const armPistol = (g) => {
  Object.assign(g.pistol, { collected: true, equipped: true, magazine: 6, reserve: 12 });
  g.player.weapon = "pistol";
};
const countByType = (events) =>
  Object.fromEntries(WORLD_EVENT_TYPES.map((type) => [type, events.filter((e) => e.type === type).length]));
const only = (g, key) => (g.enemies = g.enemies.filter((e) => e.placementKey === key))[0];

// The checks every recorded run must pass.
function proveReplay(t, name, h) {
  const { journal, f } = h,
    events = journal.events;
  assert(events.length > 0);
  events.forEach((e, i) => {
    assert.equal(e.seq, i + 1, "seq is gapless from 1");
    assert(WORLD_EVENT_TYPES.includes(e.type), "closed set: " + e.type);
    assert(validateWorldEvent(e), "exact payload: " + e.type);
  });
  const lastMove = new Map();
  for (const e of events.filter((e) => e.type === "move")) {
    const last = lastMove.get(e.actorKey);
    if (last !== undefined)
      assert(e.tick - last >= WORLD_EVENT_RULES.moveEveryTicks, "move rate cap for " + e.actorKey);
    lastMove.set(e.actorKey, e.tick);
  }
  const live = worldDigest(projectWorld(f.g)),
    replayed = worldDigest(replayWorld(structuredClone(events)));
  assert.deepEqual(replayWorld(events), projectWorld(f.g));
  assert.equal(replayed, live, name + ": replayed digest equals live digest");
  assert.equal(journal.digest(), live);
  t?.diagnostic(`${name}: ${events.length} events ${JSON.stringify(countByType(events))} digest ${live}`);
  return events;
}

// Run A: collect the starting pistol, walk to a dog, shoot it dead.
function runA() {
  const f = fixture({ areaId: "westminster" });
  f.restore();
  const g = f.g,
    dog = only(g, "westminster-roamer-6"),
    h = harness(f);
  assert.equal(dog.rig, "original-dog");
  g.player.pos = { ...g.pistol.pickupPos };
  h.tick({ actions: ["pickup"] });
  assert(g.pistol.collected);
  h.jumpNear(dog, 9);
  h.walk(
    () => dog.pos,
    () => Math.hypot(dog.pos.x - g.player.pos.x, dog.pos.z - g.player.pos.z) < 5,
  );
  h.shoot(dog);
  h.settle();
  return h;
}

// Run B: shoot the East Bridge boss dead, see its rifle drop placed, walk to it and pick it up.
function runB() {
  const f = fixture({ areaId: "east-bridge" });
  f.restore();
  const g = f.g,
    boss = g.enemies.find((e) => e.placementKey === "boss-warden-v1"),
    h = harness(f);
  armPistol(g);
  nearBossEnemy(f, boss, 4);
  h.shoot(boss);
  h.tick();
  assert.equal(g.rifle.status, "pending");
  h.walk(
    () => g.rifle.dropPosition,
    () => Math.hypot(g.rifle.dropPosition.x - g.player.pos.x, g.rifle.dropPosition.z - g.player.pos.z) < 1,
  );
  assert(h.persistence.dispatchRifle(g, { type: "claimPickup", pickupId: RIFLE_ITEM_ID }, true).ok);
  h.tick();
  assert.equal(g.rifle.status, "owned");
  h.settle();
  return h;
}

// Run C: fight the East wolf while moving, then travel to South and walk about.
async function runC() {
  const f = wolfFixture();
  f.restore();
  const g = f.g,
    wolf = only(g, "east-roamer-8"),
    h = harness(f);
  armPistol(g);
  assert.equal(wolf.rig, "original-wolf");
  // Once the wolf is on its feet the player side-steps while shooting.
  const strafe = (i) => {
    const d = { x: wolf.pos.x - g.player.pos.x, z: wolf.pos.z - g.player.pos.z },
      n = Math.hypot(d.x, d.z) || 1,
      side = Math.floor(i / 40) % 2 ? 1 : -1;
    return wolf.alerted ? { x: (-d.z / n) * side, z: (d.x / n) * side } : undefined;
  };
  h.jumpNear(wolf, 9);
  h.walk(
    () => wolf.pos,
    () => Math.hypot(wolf.pos.x - g.player.pos.x, wolf.pos.z - g.player.pos.z) < 5.5,
  );
  h.shoot(wolf, 3000, strafe);
  for (let i = 0; i < 20; i++) h.tick();
  await travelTo(g, { areaId: "south" });
  for (let i = 0; i < 30; i++) h.tick({ move: { x: 1, z: 0 } });
  h.settle();
  return h;
}

test("run A: pistol pickup, shots and the kill of a small animal", (t) => {
  const h = runA(),
    events = proveReplay(t, "A", h),
    counts = countByType(events);
  assert(counts.hit >= 2 && counts.death === 1 && counts.move > 0 && counts.engage === 1 && counts.travel === 1);
  assert(events.some((e) => e.type === "pickup" && e.itemId === PISTOL_ITEM_ID && e.ownerKey === "player"));
  assert(events.some((e) => e.type === "death" && e.targetKey === "westminster:westminster-roamer-6"));
  assert(
    events.some((e) => e.type === "hit" && e.sourceKey === "player" && e.weaponId === "pistol" && e.hpAfter === 0),
  );
});

test("run B: boss kill, rifle drop placed, rifle picked up", (t) => {
  const h = runB(),
    events = proveReplay(t, "B", h);
  assert(events.some((e) => e.type === "death" && e.targetKey === "east-bridge:boss-warden-v1"));
  const drop = events.find((e) => e.type === "drop" && e.itemId === RIFLE_ITEM_ID);
  assert(drop && drop.sourceKey === "east-bridge:boss-warden-v1" && drop.areaId === "east-bridge");
  const pickup = events.findIndex((e) => e.type === "pickup" && e.itemId === RIFLE_ITEM_ID);
  assert(pickup > events.indexOf(drop), "pickup follows drop");
  assert.deepEqual(h.journal.view.drops[RIFLE_ITEM_ID], {
    status: "owned",
    areaId: null,
    x: null,
    z: null,
    ownerKey: "player",
    ownerId: null,
    mode: "local",
  });
});

test("run C: wolf fight with movement, then travel", async (t) => {
  const h = await runC(),
    events = proveReplay(t, "C", h),
    travels = events.filter((e) => e.type === "travel");
  assert.deepEqual(
    travels.map((e) => [e.fromAreaId, e.areaId]),
    [
      [null, "east"],
      ["east", "south"],
    ],
  );
  assert(events.some((e) => e.type === "death" && e.targetKey === "east:east-roamer-8"));
  assert(events.some((e) => e.type === "hit" && e.targetKey === "east:east-roamer-8"));
  assert(events.some((e) => e.type === "move" && e.actorKey === "player"));
  assert.equal(h.journal.view.areaId, "south");
});

test("a mutated event changes the digest, and unknown or extra data is refused", async () => {
  const h = runA(),
    events = h.journal.events,
    digest = worldDigest(replayWorld(events));
  assert.equal(digest, h.journal.digest());
  // The last matching event: an earlier move of the same actor is overwritten by a later one.
  const mutate = (match, change) => {
    const copy = structuredClone(events),
      i = copy.findLastIndex(match);
    assert(i >= 0);
    change(copy[i]);
    return worldDigest(replayWorld(copy));
  };
  // A hit's hpAfter shows in the digest while the target lives (a death sets hp to 0), so cut the log before the death.
  const alive = events.slice(
      0,
      events.findIndex((e) => e.type === "death"),
    ),
    aliveDigest = worldDigest(replayWorld(alive)),
    lastHit = alive.findLastIndex((e) => e.type === "hit"),
    wounded = structuredClone(alive);
  wounded[lastHit].hpAfter += 1;
  assert.notEqual(worldDigest(replayWorld(wounded)), aliveDigest);
  assert.notEqual(
    digest,
    mutate(
      (e) => e.type === "death",
      (e) => (e.pos.x += 0.001),
    ),
  );
  assert.notEqual(
    digest,
    mutate(
      (e) => e.type === "move" && e.actorKey === "player",
      (e) => (e.pos.z += 0.001),
    ),
  );
  assert.notEqual(
    digest,
    mutate(
      (e) => e.type === "pickup",
      (e) => (e.ownerKey = "someone-else"),
    ),
  );
  assert.notEqual(worldDigest(replayWorld(events.filter((e) => e.type !== "death"))), digest);
  assert(!validateWorldEvent({ ...events[0], extra: 1 }));
  assert(!validateWorldEvent({ ...events[0], type: "teleport" }));
  assert.throws(() => applyWorldEvent({ actors: {}, drops: {} }, { type: "teleport" }), /Unknown world event/);
});

test("a creature's hit on the player maps with the attacker's key, weapon and position", () => {
  // The desktop run has no actor meshes, so creature bites never land; feed the legacy hit a bite would produce.
  const f = wolfFixture();
  f.restore();
  const g = f.g,
    wolf = only(g, "east-roamer-8"),
    journal = createJournal({ retain: Infinity });
  journal.ingest(g, []);
  g.player.hp -= 12;
  journal.ingest(g, [
    {
      type: "hit",
      actor: g.player,
      amount: 12,
      attackerId: wolf.id,
      victimId: g.player.id,
      position: { ...g.player.pos },
      moveId: "wolf_bite",
      weapon: "teeth",
      material: "flesh",
    },
  ]);
  const [engage, hit] = journal.events.slice(-2);
  const header = { tick: g.tick, areaId: "east", serverTime: null };
  assert.deepEqual(engage, {
    seq: engage.seq,
    ...header,
    type: "engage",
    instance: "east:east-roamer-8",
    sourceKey: "east:east-roamer-8",
    targetKey: "player",
    generation: null,
  });
  assert.deepEqual(hit, {
    seq: engage.seq + 1,
    ...header,
    type: "hit",
    targetKey: "player",
    sourceKey: "east:east-roamer-8",
    amount: 12,
    hpAfter: g.player.maxHP - 12,
    weaponId: "teeth",
    attackClass: null,
    sourcePos: { x: Math.round(wolf.pos.x * 1000) / 1000, z: Math.round(wolf.pos.z * 1000) / 1000 },
  });
  assert.equal(journal.digest(), worldDigest(projectWorld(g)));
});

test("reading the run does not change it, and a new run starts a new journal", () => {
  const f = fixture({ areaId: "westminster" });
  f.restore();
  const g = f.g,
    journal = createJournal({ retain: Infinity }),
    snapshot = () => JSON.stringify(g, (key, value) => (typeof value === "function" ? undefined : value));
  const first = snapshot();
  journal.ingest(g, g.events);
  journal.ingest(g, g.events, [{ command: {}, result: { ok: true, events: [] } }]);
  assert.equal(snapshot(), first);
  assert.equal(journal.events[0].seq, 1);
  const other = fixture({ areaId: "westminster" });
  other.restore();
  journal.ingest(other.g, []);
  assert.equal(journal.events[0].seq, 1);
  assert.equal(journal.events.length, journal.lastSeq);
});

test("the session keeps only the newest events and a dispatch-only call does not sample moves", () => {
  const f = fixture({ areaId: "westminster" });
  f.restore();
  const g = f.g,
    journal = createJournal({ retain: 10 });
  journal.ingest(g, []);
  const seq = journal.lastSeq;
  g.player.pos = { x: g.player.pos.x + 1, z: g.player.pos.z };
  journal.ingest(g, null, []);
  assert.equal(journal.lastSeq, seq);
  for (let i = 0; i < 40; i++) {
    g.tick += 4;
    g.player.pos = { x: g.player.pos.x + 0.5, z: g.player.pos.z };
    journal.ingest(g, []);
  }
  assert(journal.events.length < 20 && journal.events.at(-1).seq === journal.lastSeq);
});

// ---------------------------------------------------------------------------------------------
// Amendments 1-10 (Backend and Web requests).
// ---------------------------------------------------------------------------------------------
const content = validateAreaMetadata(read("world/area-content.json"), registry);
const EXPLORE = (cycle) => ({
  pilot: "donor-knife",
  pistol: true,
  supplies: true,
  vest: true,
  areaResidents: true,
  openingGroup: false,
  residentPlacements: content.residents,
  animalVariants: true,
  animalCycle: cycle,
  rat: true,
  dog: true,
  roach: true,
  drone: true,
  encounter: {
    id: "hollow-scavengers",
    character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 },
  },
});
// What the game really spawns in every area for a cycle, by instance key.
function liveRows(cycle) {
  const rows = new Map();
  for (const area of registry.ids) {
    const layout = read(registry.asset(registry.get(area).layoutRef).path),
      geometry = createGeometry(layout),
      world = {
        ...content,
        areaId: area,
        registry,
        spawn: geometry.ground(registry.get(area).entry),
        layout,
        geometry,
        progressionData: content.progression,
        expeditionData: content.expedition,
        residentPlacements: content.residents,
        lineClear: (a, b) => geometry.lineClear(a, b),
        move: (p, d, r) => geometry.move(p, d, r),
        travelAt: () => null,
      };
    for (const e of createGame(world, EXPLORE(cycle)).enemies)
      rows.set(instanceKey(area, e.placementKey), { kind: e.rig, maxHp: e.maxHP });
  }
  return rows;
}

test("1 identity: placementKey is unique in every shipped area and every key fits the wire pattern", () => {
  const pattern = /^[a-z0-9._:-]{1,96}$/;
  for (const area of new Set([...Object.keys(AREA_MOB_SPAWNS), ...Object.keys(content.residents)])) {
    const placed = (content.residents[area] ?? AREA_MOB_SPAWNS[area] ?? []).map((row) => row.key);
    assert.equal(new Set(placed).size, placed.length, "duplicate placementKey in " + area);
  }
  for (const cycle of ["A", "B"]) {
    const rows = worldSpawnRows(content, cycle);
    assert.equal(new Set(rows.map((r) => r.instance)).size, rows.length);
    for (const row of rows) assert(pattern.test(row.instance) && row.instance.startsWith(row.area + ":"));
  }
  assert.equal(instanceKey("east", "east-roamer-8"), "east:east-roamer-8");
  assert(isLocalActorKey("player") && !isLocalActorKey("east:east-roamer-8"));
  assert(pattern.test("player"));
  // Every recorded event carries the area it happened in; travel also carries where it came from.
  const events = runA().journal.events;
  assert(events.every((e) => e.areaId === "westminster" && validateWorldEvent(e)));
  assert.equal(events.find((e) => e.type === "travel").fromAreaId, null);
});

test("2 worldSpawnRows matches what the game spawns, with nulls where the game has no data", (t) => {
  for (const cycle of ["A", "B"]) {
    const live = liveRows(cycle),
      rows = worldSpawnRows(content, cycle);
    assert(rows.length > 0);
    for (const [instance, row] of live) {
      const planned = rows.find((r) => r.instance === instance);
      assert(planned, "no spawn row for " + instance);
      assert.deepEqual({ kind: planned.kind, maxHp: planned.maxHp }, row, instance + " cycle " + cycle);
    }
    for (const row of rows)
      assert.deepEqual(Object.keys(row), ["instance", "kind", "area", "maxHp", "respawnS", "lootKind", "reach"]);
  }
  const rows = worldSpawnRows(content);
  assert(
    rows.every((r) => r.respawnS === null),
    "the game has no respawn",
  );
  assert(rows.every((r) => Number.isFinite(r.maxHp) && Number.isFinite(r.reach)));
  assert(rows.some((r) => r.lootKind !== null));
  const nulls = (field) => rows.filter((r) => r[field] === null).length;
  t.diagnostic(
    `worldSpawnRows: ${rows.length} rows, null respawnS ${nulls("respawnS")}, null lootKind ${nulls("lootKind")}`,
  );
});

test("3 weaponRules: one row per hit weaponId, from the real tables", (t) => {
  const rules = weaponRules(),
    byId = Object.fromEntries(rules.map((r) => [r.weaponId, r]));
  assert.deepEqual(rules.map((r) => r.weaponId).sort(), [...WEAPON_IDS].sort());
  assert.equal(byId.pistol.maxDamagePerHit, 25);
  assert.equal(byId.railgun.maxDamagePerHit, 45);
  assert(byId.pistol.maxHitsPerS > 0.8 && byId.pistol.reachM === 18);
  assert.equal(byId["bone-saw"].maxHitsPerS, 5);
  // Every weaponId in a recorded hit is a key of the table, and the hit respects the table's damage cap.
  const events = [runA(), runB()].flatMap((h) => h.journal.events).filter((e) => e.type === "hit");
  assert(events.length > 0);
  for (const e of events) {
    assert(e.weaponId === null || byId[e.weaponId], "unknown weaponId " + e.weaponId);
    assert(e.weaponId === "pistol" && e.amount <= byId.pistol.maxDamagePerHit);
  }
  const nulls = rules.flatMap((r) =>
    Object.entries(r)
      .filter(([k, v]) => v === null)
      .map(([k]) => r.weaponId + "." + k),
  );
  t.diagnostic("weaponRules nulls: " + JSON.stringify(nulls));
  assert.deepEqual(nulls, []);
});

test("4 an incoming spawn is truth for the reducer: it replaces the predicted hp and keeps the generation", () => {
  const h = runA(),
    dog = "westminster:westminster-roamer-6",
    view = replayWorld(h.journal.events);
  assert.equal(view.actors[dog].alive, false);
  applyWorldEvent(view, {
    type: "spawn",
    instance: dog,
    hp: 30,
    maxHp: 30,
    alive: true,
    generation: 2,
  });
  assert.deepEqual(view.actors[dog], {
    x: view.actors[dog].x,
    z: view.actors[dog].z,
    hp: 30,
    alive: true,
    maxHp: 30,
    generation: 2,
  });
  assert(Number.isFinite(view.actors[dog].x));
  applyWorldEvent(view, { type: "spawn", instance: dog, hp: 0, maxHp: 30, alive: false, generation: 3 });
  assert.equal(view.actors[dog].alive, false);
  assert.equal(view.actors[dog].generation, 3);
  // The journal never produces one.
  assert(!h.journal.events.some((e) => e.type === "spawn"));
});

test("5 move carries heading, state, flags, attackClass and weaponId from closed enums", () => {
  const h = runA(),
    moves = h.journal.events.filter((e) => e.type === "move");
  assert(moves.length > 0);
  for (const e of moves) {
    assert(Number.isFinite(e.heading) && MOVE_STATES.includes(e.state));
    assert(Number.isInteger(e.flags) && e.flags >= 0 && e.flags < 16);
    assert(e.attackClass === null || (ATTACK_CLASSES.includes(e.attackClass) && e.state === "attack"));
    assert(e.weaponId === null || WEAPON_IDS.includes(e.weaponId));
  }
  assert(moves.some((e) => e.actorKey === "player" && e.state === "walk" && e.weaponId === "pistol"));
  const player = moves.filter((e) => e.actorKey === "player");
  assert.equal(player.at(-1).state, "idle", JSON.stringify(player.slice(-4)));
  // A swing shows as state attack with its class and the swinging bit.
  const f = fixture({ areaId: "westminster" });
  f.restore();
  const g = f.g,
    journal = createJournal({ retain: Infinity });
  journal.ingest(g, []);
  g.tick += 4;
  g.player.swing = { action: "slash" };
  journal.ingest(g, []);
  const attack = journal.events.at(-1);
  assert.equal(attack.type, "move");
  assert.equal(attack.state, "attack");
  assert.equal(attack.attackClass, "slash");
  assert.equal(attack.flags & MOVE_FLAGS.swinging, MOVE_FLAGS.swinging);
  assert.equal(attack.weaponId, g.player.weapon === "knife" ? "knife" : attack.weaponId);
});

test("6 appear and leave are applied by the reducer; the local journal never emits them", () => {
  const view = { areaId: "south", actors: {}, drops: {} };
  applyWorldEvent(view, {
    type: "appear",
    actorKey: "remote-7",
    pos: { x: 1, z: 2 },
    facing: { x: 0, z: 1 },
    modelRef: "hero",
    appearanceRef: null,
    weaponId: "knife",
  });
  assert.deepEqual(view.actors["remote-7"], { x: 1, z: 2, hp: null, alive: true });
  applyWorldEvent(view, { type: "leave", actorKey: "remote-7" });
  assert.deepEqual(view.actors, {});
  for (const h of [runA(), runB()]) assert(!h.journal.events.some((e) => e.type === "appear" || e.type === "leave"));
});

test("7 engage names the creature instance and leaves the generation slot empty", () => {
  const engage = runA().journal.events.find((e) => e.type === "engage");
  assert.equal(engage.instance, "westminster:westminster-roamer-6");
  assert.equal(engage.generation, null);
  assert.equal(engage.targetKey, engage.instance);
});

test("8 time: TICK_HZ is the game's fixed step, events carry tick and an empty serverTime", () => {
  assert.equal(TICK_HZ, 60);
  const f = fixture({ areaId: "westminster" });
  f.restore();
  stepGame(f.g, {}, 1 / TICK_HZ);
  assert.throws(() => stepGame(f.g, {}, 1 / (TICK_HZ + 1)), /60 Hz/);
  for (const e of runA().journal.events) assert(Number.isInteger(e.tick) && e.serverTime === null);
});

test("9 drop and pickup carry mode and ownerId; the reducer keeps a server mint", () => {
  const events = runB().journal.events.filter((e) => e.type === "drop" || e.type === "pickup");
  assert(events.length >= 2);
  for (const e of events) assert(DROP_MODES.includes(e.mode) && e.mode === "local" && e.ownerId === null);
  const view = { areaId: "east", actors: {}, drops: {} };
  applyWorldEvent(view, {
    type: "drop",
    itemId: "loot-1",
    areaId: "east",
    pos: { x: 1, z: 2 },
    sourceKey: null,
    ownerId: "acct-9",
    mode: "server",
  });
  assert.deepEqual(view.drops["loot-1"], {
    status: "dropped",
    areaId: "east",
    x: 1,
    z: 2,
    ownerKey: null,
    ownerId: "acct-9",
    mode: "server",
  });
  applyWorldEvent(view, { type: "pickup", itemId: "loot-1", ownerKey: "remote-7", ownerId: "acct-9", mode: "server" });
  assert.equal(view.drops["loot-1"].ownerId, "acct-9");
  assert.equal(view.drops["loot-1"].mode, "server");
});

test("10 wire codes: numeric type and weapon codes are unique, complete and in table order", () => {
  assert.deepEqual(Object.keys(WORLD_EVENT_CODES), [...WORLD_EVENT_TYPES]);
  assert.deepEqual(
    Object.values(WORLD_EVENT_CODES),
    WORLD_EVENT_TYPES.map((_, i) => i + 1),
  );
  assert.deepEqual(Object.keys(WEAPON_CODES), [...WEAPON_IDS]);
  assert.equal(new Set(Object.values(WEAPON_CODES)).size, WEAPON_IDS.length);
  assert(Object.values(WEAPON_CODES).every((c) => Number.isInteger(c) && c > 0 && c < 256));
});
