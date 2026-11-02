import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateSpawnVariation } from "../src/engine/game-data-spawn-variation.js";
import { activeDay, rollSlots, seededRandom, variedCrates, variedHostiles } from "../src/engine/spawn-variation.js";
import { populationPlacements } from "../src/engine/area-population.js";
import { reviveDue } from "../src/engine/respawn.js";
import { placementsFor } from "../src/engine/world-pickups-core.js";
import { trapCrateList } from "../src/engine/trap-crate.js";
import { validateAreaGeometry } from "../src/engine/area-content.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import { AREA_DRONE_SPAWNS } from "../src/area-drone-spawns.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";

const DATA = GAME_DATA.spawnVariation;
const read = (path) => JSON.parse(fs.readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
const content = read("world/area-content.json");
const manifest = read("world/manifest.json");
const registry = createAreaRegistry({ manifest });
const layoutOf = (id) => read(registry.asset(registry.get(id).layoutRef).path);
// Thirty consecutive days, as the date strings the game seeds from.
const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().split("T")[0]);
const rowsOf = (area) => content.residents[area] ?? AREA_MOB_SPAWNS[area];
const layoutKey = (list) => JSON.stringify(list.map((row) => [row.id ?? row.key, row.x ?? row.pos.x, row.z ?? row.pos.z]));
const clone = () => structuredClone(DATA);

test("the generator is deterministic and spreads over [0, 1)", () => {
  const a = seededRandom("2026-10-28:east"),
    b = seededRandom("2026-10-28:east"),
    c = seededRandom("2026-10-29:east");
  const first = Array.from({ length: 8 }, a);
  assert.deepEqual(first, Array.from({ length: 8 }, b));
  assert.notDeepEqual(first, Array.from({ length: 8 }, c));
  assert.ok(first.every((n) => n >= 0 && n < 1));
});

test("a roll gives every slot a different point, and a weight of the points steers it", () => {
  const spec = { points: { a: 1, b: 1, c: 1, d: 1 }, slots: ["a", "b", "c"] };
  for (const day of days) assert.equal(new Set(Object.values(rollSlots(spec, day))).size, 3);
  const heavy = { points: { a: 1000, b: 1 }, slots: ["a"] };
  assert.ok(days.filter((day) => rollSlots(heavy, day).a === "a").length > days.length - 3);
});

test("same seed, same layout: crates and hostiles", () => {
  for (const area of Object.keys(DATA.crates)) {
    assert.equal(layoutKey(variedCrates(area, days[0]).pickups), layoutKey(variedCrates(area, days[0]).pickups));
    assert.deepEqual(variedCrates(area, days[3]).traps, variedCrates(area, days[3]).traps);
  }
  for (const [area, row] of Object.entries(DATA.hostiles))
    for (const cycle of Object.keys(row.cycles))
      assert.deepEqual(variedHostiles(rowsOf(area), area, cycle, days[5]), variedHostiles(structuredClone(rowsOf(area)), area, cycle, days[5]));
});

test("a different day differs, in every area, for crates and for hostiles", () => {
  for (const area of Object.keys(DATA.crates)) {
    const layouts = new Set(days.map((day) => layoutKey([...variedCrates(area, day).pickups, ...variedCrates(area, day).traps])));
    assert.ok(layouts.size > 1, `${area} crates never change`);
  }
  for (const [area, row] of Object.entries(DATA.hostiles))
    for (const cycle of Object.keys(row.cycles)) {
      const layouts = new Set(days.map((day) => layoutKey(variedHostiles(rowsOf(area), area, cycle, day))));
      assert.ok(layouts.size > 1, `${area}/${cycle} hostiles never change`);
    }
  const east = new Set(days.map((day) => layoutKey(variedHostiles(rowsOf("east"), "east", "A", day))));
  assert.notEqual(layoutKey(variedHostiles(rowsOf("east"), "east", "A", days[0])), layoutKey(variedHostiles(rowsOf("east"), "east", "B", days[0])));
  assert.ok(east.size > days.length / 2, "most days give a layout of their own");
});

test("crates: every placement lands on open, reachable ground, apart from the entry and from each other; ids and kinds never change", () => {
  const radius = GAME_DATA.worldPickups.pickupRadius,
    sameKindApart = 5; // the existing same-kind spacing rule (tests/world-pickups.test.js)
  for (const area of Object.keys(DATA.crates)) {
    const geo = createGeometry(layoutOf(area)),
      entry = geo.ground(manifest.entries[area]),
      basePickups = GAME_DATA.worldPickups.placements[area],
      baseTraps = GAME_DATA.trapCrates.placements[area];
    for (const day of days) {
      const { pickups, traps } = variedCrates(area, day),
        all = [...pickups, ...traps];
      assert.deepEqual(pickups.map((p) => [p.id, p.type]), basePickups.map((p) => [p.id, p.type]));
      assert.deepEqual(traps.map((p) => p.id), baseTraps.map((p) => p.id));
      for (const p of all) {
        assert.ok(geo.clear({ x: p.x, z: p.z }, 0), `${day} ${p.id} is not on open ground`);
        if (traps.includes(p)) assert.ok(geo.lineClear(entry, { x: p.x, z: p.z }), `${day} ${p.id} is not reachable from the entry`);
        assert.ok(Math.hypot(p.x - entry.x, p.z - entry.z) > 3 * radius, `${day} ${p.id} sits on the entry`);
        for (const q of all)
          if (q !== p) {
            const gap = Math.hypot(p.x - q.x, p.z - q.z);
            assert.ok(gap > 2 * radius, `${day} ${p.id} overlaps ${q.id}`);
            if (p.type && p.type === q.type) assert.ok(gap >= sameKindApart, `${day} ${p.id} is next to ${q.id}`);
          }
      }
    }
  }
});

test("crate points are the hand-placed points of the area and nothing else", () => {
  for (const [area, spec] of Object.entries(DATA.crates)) {
    const base = [...GAME_DATA.worldPickups.placements[area], ...GAME_DATA.trapCrates.placements[area]],
      ids = base.map((row) => row.id).sort();
    assert.deepEqual(Object.keys(spec.points).sort(), ids);
    assert.deepEqual([...spec.slots].sort(), ids);
    const spots = new Set(base.map((row) => `${row.x}:${row.z}`));
    for (const day of days)
      for (const p of [...variedCrates(area, day).pickups, ...variedCrates(area, day).traps]) assert.ok(spots.has(`${p.x}:${p.z}`));
  }
});

test("hostiles: the same keys and kinds, only plain residents move, and every position and patrol leg is valid ground", () => {
  const populationData = validateAreaMetadata(content, registry).populationData,
    boss = new Set(content.bosses.placements.map((row) => row.key)),
    crooked = new Set(GAME_DATA.spawns.crookedResidents),
    drones = new Set(Object.values(AREA_DRONE_SPAWNS).flat().map((row) => row.key)),
    guard = content.expedition.contract.guard.placementKey;
  const metadata = validateAreaMetadata(content, registry);
  for (const [area, row] of Object.entries(DATA.hostiles)) {
    const policy = populationData.areas[area],
      rows = rowsOf(area),
      active = new Set(policy.activePlacementIds);
    for (const cycle of Object.keys(row.cycles)) {
      const spec = row.cycles[cycle];
      for (const key of spec.slots) {
        const source = rows.find((r) => r.key === key);
        assert.ok(source && active.has(key), `${key} is not an active resident`);
        assert.ok(!boss.has(key) && !crooked.has(key) && !drones.has(key) && key !== guard && key !== policy.creatureSlot.placementKey, key);
        assert.ok([undefined, "hollow-scavenger"].includes(source.foundationRef), `${key} is not a plain human`);
        assert.equal(source.appearanceRef, undefined);
      }
      for (const key of Object.keys(spec.points)) assert.ok(rows.some((r) => r.key === key) && !drones.has(key), `${key} is not a resident point`);
      for (const day of days) {
        const varied = variedHostiles(rows, area, cycle, day),
          residents = { ...metadata.residents, [area]: varied };
        assert.deepEqual(varied.map((r) => r.key), rows.map((r) => r.key));
        assert.deepEqual(varied.map((r) => r.foundationRef), rows.map((r) => r.foundationRef));
        const slotted = varied.filter((r) => spec.slots.includes(r.key)).map((r) => `${r.pos.x}:${r.pos.z}`);
        assert.equal(new Set(slotted).size, slotted.length, `${day} ${area} two residents share a point`);
        for (const r of varied) if (!spec.slots.includes(r.key)) assert.deepEqual(r, rows.find((o) => o.key === r.key));
        validateAreaGeometry(registry, area, layoutOf(area), residents, metadata.expedition, metadata.bossData, populationData);
        const placed = populationPlacements(populationData, area, cycle, varied, "");
        const unvaried = populationPlacements(populationData, area, cycle, rows, "");
        assert.deepEqual(placed.map((r) => r.key), unvaried.map((r) => r.key));
        assert.deepEqual(placed.map((r) => r.foundationRef), unvaried.map((r) => r.foundationRef));
      }
    }
  }
});

test("moved residents keep their distance from the creatures that stay put", () => {
  const { populationData } = validateAreaMetadata(content, registry);
  for (const area of Object.keys(DATA.hostiles)) {
    const spec = DATA.hostiles[area].cycles.A,
      fixed = [...rowsOf(area), ...(AREA_DRONE_SPAWNS[area] ?? [])].filter(
        (r) => !spec.slots.includes(r.key) && populationData.areas[area].activePlacementIds.includes(r.key),
      );
    for (const key of Object.keys(spec.points)) {
      const p = rowsOf(area).find((r) => r.key === key).pos;
      for (const f of fixed) assert.ok(Math.hypot(p.x - f.pos.x, p.z - f.pos.z) > 1, `${key} stands on ${f.key}`);
    }
  }
});

test("the tutorial and the hub keep their hand-built layout; the roll needs a browser and honours the off switch", () => {
  for (const area of ["westminster", "central-hub"]) {
    assert.ok(!(area in DATA.crates) && !(area in DATA.hostiles));
    assert.equal(variedHostiles(AREA_MOB_SPAWNS[area] ?? [], area, "A", days[0]).length, (AREA_MOB_SPAWNS[area] ?? []).length);
  }
  assert.deepEqual(variedHostiles(AREA_MOB_SPAWNS.westminster, "westminster", "A", days[0]), AREA_MOB_SPAWNS.westminster);
  assert.equal(activeDay(), null, "headless code gets the hand-built layout");
  assert.equal(placementsFor("east"), GAME_DATA.worldPickups.placements.east);
  assert.equal(trapCrateList("east"), GAME_DATA.trapCrates.placements.east);
  assert.equal(variedCrates("east", null).pickups, GAME_DATA.worldPickups.placements.east);
  const saved = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    globalThis.location = { search: "" };
    const day = activeDay();
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(placementsFor("east"), variedCrates("east", day).pickups);
    assert.equal(trapCrateList("east"), variedCrates("east", day).traps);
    globalThis.location = { search: `?${DATA.offParam}=1` };
    assert.equal(activeDay(), null);
    assert.equal(placementsFor("east"), GAME_DATA.worldPickups.placements.east);
  } finally {
    if (saved) Object.defineProperty(globalThis, "location", saved);
    else delete globalThis.location;
  }
});

test("a hostile whose varied spot is on screen does not revive there, even if its hand-built spot is far away", () => {
  const area = "south",
    cycle = "A",
    saved = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    globalThis.location = { search: "" };
    const day = activeDay(),
      rows = rowsOf(area),
      varied = variedHostiles(rows, area, cycle, day),
      moved = varied.find((row, i) => Math.hypot(row.pos.x - rows[i].pos.x, row.pos.z - rows[i].pos.z) > 3),
      policy = { seconds: 60, minPlayerDistance: 2, offscreenDistance: 3, excludedAreas: [] },
      base = (at) => ({
        areaResidents: true,
        areaInitialized: true,
        finished: false,
        animalCycle: cycle,
        enemies: [],
        player: { hp: 100, pos: { ...at } },
        time: 1000,
        respawn: { base: 0, kills: { [moved?.key]: 0 } },
        world: { areaId: area, populationData: { respawn: policy }, lineClear: () => true },
      }),
      built = [],
      build = (g, a, keys) => (built.push(...keys), []);
    assert.ok(moved, "today's roll moves at least one south resident");
    assert.equal(reviveDue(base(moved.pos), build, AREA_MOB_SPAWNS), 0);
    assert.deepEqual(built, [], "the player stands on the varied spot, so it waits");
    const original = rows.find((row) => row.key === moved.key).pos;
    reviveDue(base(original), build, AREA_MOB_SPAWNS);
    assert.deepEqual(built, [moved.key], "standing on the hand-built spot does not block a revive at the varied one");
  } finally {
    if (saved) Object.defineProperty(globalThis, "location", saved);
    else delete globalThis.location;
  }
});

test("data checks: a broken row is refused", () => {
  validateSpawnVariation(clone());
  for (const mutate of [
    (d) => (d.crates.east.points["east-1"] = 0),
    (d) => d.crates.east.slots.push("east-1"),
    (d) => d.crates.east.slots.push("elsewhere"),
    (d) => (d.crates.westminster = d.crates.east),
    (d) => (d.hostiles["central-hub"] = d.hostiles.east),
    (d) => delete d.hostiles.east.cycles.B,
    (d) => (d.rng.range = 0),
    (d) => (d.extra = 1),
  ])
    assert.throws(() => {
      const d = clone();
      mutate(d);
      validateSpawnVariation(d);
    });
});
