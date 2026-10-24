import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture } from "./helpers/rifle-fixture.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { stageProgressionDeath } from "../src/engine/progression-runtime.js";
import { issueSupply } from "../src/supplies.js";
import { needsUniqueDeathCommit } from "../src/engine/unique-reward-runtime.js";
import { RIFLE_ITEM_ID } from "../src/engine/weapon-catalog.js";
import { LondonWorld } from "../src/world.js";
import { createGeometry } from "../src/world-geometry.js";
import { uniqueRewardDropPosition } from "../src/engine/unique-reward-runtime.js";

// Alpha item 6: "a boss kill always ends with its drop placed or carried, in every area".
// For every boss row in area-content.json this test kills the boss through the real path (progression death, supply
// issue, corpse, persistRun) at several death positions, then asserts the drop is `pending` at a legal spot, survives a
// reload, can be claimed (carried) and that saving keeps working afterwards. Cases that fail today are listed in
// KNOWN_GAPS so the suite stays green; the test also fails when a listed gap starts passing (remove it then).
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url)));
const content = read("world/area-content.json");
const registry = fixture().world.registry;
const data = validateAreaMetadata(content, registry);

// One row per reward layer: where the state lives and which command claims it.
function rewardRows() {
  const rows = Object.entries(data.bossEquipmentData).map(([field, profile]) => ({
    name: field,
    source: profile.source,
    itemId: profile.itemId,
    state: (g) => g.bossEquipment[field],
    claim: (f, g) => f.p.dispatchBossEquipment(g, { type: "claimPickup", pickupId: profile.itemId }, true),
  }));
  rows.push({
    name: "rifle",
    source: data.rifleData.source,
    itemId: RIFLE_ITEM_ID,
    state: (g) => g.rifle,
    claim: (f, g) => f.p.dispatchRifle(g, { type: "claimPickup", pickupId: RIFLE_ITEM_ID }, true),
  });
  return rows;
}
const ROWS = rewardRows();
const BOSSES = content.bosses.placements.map((p) => ({
  key: p.key,
  areaId: p.areaId,
  reward: ROWS.find((r) => r.source.placementKey === p.key && r.source.areaId === p.areaId),
}));

// The real LondonWorld methods (travelAt exit zones, lineClear with the safehouse rule) on a prototype-only instance:
// the constructor needs THREE, a camera and a texture, so (like exit-approach.test.js) the instance is built with
// Object.create and only the data those methods read: area id, registry, geometry, safehouse data.
function realWorld(world, geometry = world.geometry) {
  return Object.assign(Object.create(LondonWorld.prototype), {
    areaId: world.areaId,
    registry,
    geometry,
    safehouseData: world.safehouseData,
  });
}
function realTravelAt(world) {
  const real = realWorld(world);
  return (position) => real.travelAt(position);
}
const EXTRA_WORLD = {
  bossEquipmentData: data.bossEquipmentData,
  safehouseData: data.safehouseData,
  reaperData: data.reaperData,
  markedData: data.markedData,
};
const legalGround = (f, p) => f.world.geometry.clear(p, 0.4) && !f.world.travelAt(p);

// Scan the area for blocked points; returns the nearest blocked point to `origin`, and the blocked point whose nearest
// legal ground is farthest away (the "nearest legal point is far" case) with that distance.
function scanBlocked(f, origin) {
  const step = 1,
    legal = [];
  const grid = new Map();
  for (let x = -60; x <= 60; x += step)
    for (let z = -60; z <= 60; z += step)
      if (legalGround(f, { x, z })) {
        legal.push({ x, z });
        grid.set(x + "," + z, true);
      }
  let nearestBlocked = null,
    nearestD = Infinity,
    deep = null,
    deepD = -1;
  for (let x = -60; x <= 60; x += step)
    for (let z = -60; z <= 60; z += step) {
      if (grid.has(x + "," + z)) continue;
      const p = { x, z },
        d = Math.hypot(x - origin.x, z - origin.z);
      if (d < nearestD && Number.isFinite(f.world.geometry.point(p).y) && inRange(f, p)) {
        nearestD = d;
        nearestBlocked = p;
      }
      if (!inRange(f, p)) continue;
      let best = Infinity;
      for (const l of legal) {
        const dl = Math.hypot(l.x - x, l.z - z);
        if (dl < best) best = dl;
      }
      if (best > deepD) {
        deepD = best;
        deep = p;
      }
    }
  return { nearestBlocked, deep, deepDistance: deepD, legalCount: legal.length };
}
// Points that project inside the backdrop: the only blocked ground a boss can actually die on.
const inRange = (f, p) => {
  const q = f.world.geometry.point(p);
  return q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1;
};

// Variants: where the boss dies and what the world looks like when its save is written.
const VARIANTS = {
  natural: () => ({}),
  "blocked-ground": (f, e) => ({ pos: scanBlocked(f, e.pos).nearestBlocked }),
  "far-from-legal": (f, e) => ({ pos: scanBlocked(f, e.pos).deep }),
  "outside-area": (f, e) => ({ pos: { x: e.pos.x + 400, z: e.pos.z + 400 } }),
  // Everything near the corpse is blocked AND the area entry is inside an exit zone: no legal spot is findable.
  "entry-not-legal": (f, e) => {
    const entry = f.world.geometry.ground(f.world.registry.get(f.world.areaId).entry);
    const travel = f.world.travelAt;
    f.world.travelAt = (p) => (Math.hypot(p.x - entry.x, p.z - entry.z) < 0.5 ? { areaId: "x" } : travel(p));
    return { pos: { x: e.pos.x + 400, z: e.pos.z + 400 } };
  },
  "no-ground-anywhere": (f) => {
    f.world.geometry.clear = () => false;
    return {};
  },
  "storage-fails-then-recovers": () => ({ quotaOnKill: true }),
};

function killAt(f, boss, variant) {
  f.restore();
  const g = f.g,
    e = g.enemies.find((x) => x.placementKey === boss.key);
  assert(e, "boss enemy present in " + boss.areaId);
  const setup = VARIANTS[variant](f, e);
  if (setup.pos) e.pos = { ...setup.pos };
  e.hp = 0;
  g.supplies = issueSupply(g.supplies, {
    areaId: f.world.areaId,
    placementKey: e.placementKey,
    position: e.pos,
    hp: 0,
    rules: g.lootRules,
    cycle: g.animalCycle,
  }).state;
  stageProgressionDeath(g, e, "knife", e.maxHP);
  g.corpses.push(e);
  if (setup.quotaOnKill) f.quota(true);
  return { g, e, saved: f.p.persistRun(g), quotaOnKill: !!setup.quotaOnKill };
}

// Returns the list of failed expectations for one boss x variant. Empty list = the drop is placed or carried and
// saving keeps working.
function measure(boss, variant) {
  const failures = [];
  const f = fixture({
    areaId: boss.areaId,
    extraWorld: EXTRA_WORLD,
  });
  f.world.travelAt = realTravelAt(f.world);
  const real = realWorld(f.world);
  f.world.lineClear = (a, b) => real.lineClear(a, b);
  const { g, e, saved, quotaOnKill } = killAt(f, boss, variant);
  const row = boss.reward;
  const check = (name, ok) => ok || failures.push(name);
  if (quotaOnKill) {
    check("storage-failure-keeps-exit-locked", needsUniqueDeathCommit(g) === true);
    f.quota(false);
    check("save-recovers-after-storage-returns", f.p.persistRun(g) === true);
  } else check("save-not-blocked-at-kill", saved === true);
  check("run-not-flagged-invalid", !g.runSaveInvalid);
  const s = row.state(g);
  check("status-pending", s.status === "pending");
  const at = s.dropPosition;
  if (process.env.BOSS_DROP_TABLE === "1")
    console.log(
      "INFO",
      boss.areaId + "/" + variant,
      "deathLegal=" + legalGround(f, e.pos),
      "dropDist=" + (at ? Math.hypot(at.x - e.pos.x, at.z - e.pos.z).toFixed(2) : "none"),
    );
  check("drop-position-finite", !!at && Number.isFinite(at.x) && Number.isFinite(at.z));
  if (at) check("drop-position-legal", legalGround(f, at));
  check("no-uncommitted-kill-left", needsUniqueDeathCommit(g) === false);
  check("later-save-works", f.p.persistRun(g) === true);
  check("award-recorded-once", g.progression.awards.filter((a) => a.placementKey === boss.key).length === 1);
  if (at && s.status === "pending") {
    // Reload from the stored record: same drop, same position, save not invalid.
    const r = fixture({
      records: new Map(f.records),
      areaId: boss.areaId,
      extraWorld: EXTRA_WORLD,
    });
    r.world.travelAt = f.world.travelAt;
    r.world.lineClear = f.world.lineClear;
    r.world.geometry.clear = f.world.geometry.clear;
    r.restore();
    const rs = row.state(r.g);
    check("reload-keeps-pending-position", !r.g.runSaveInvalid && rs.status === "pending" && rs.dropPosition?.x === at.x && rs.dropPosition?.z === at.z);
    // Carry it: stand on the spot, claim, save.
    g.player.pos = { x: at.x, z: at.z };
    const claim = row.claim(f, g);
    check("claim-at-drop-works", claim.ok === true);
    check("owned-after-claim", row.state(g).status === "owned");
    check("save-after-claim", f.p.persistRun(g) === true);
  }
  return failures;
}

// Known gaps: "<area>/<variant>" -> { expect: failed expectation names, cause }. Measured on origin/main d1d49ad.
// An empty table means every case passes.
// Both gap variants are synthetic: in the shipped layouts the area entry is legal ground in all seven areas
// (outside-area passes everywhere), so a boss kill today always finds a spot. If no spot AND no legal entry exist,
// uniqueRewardDropPosition returns null (unique-reward-runtime.js:69), stageDeathDrops hands that null to the model
// transition, which refuses (item-layer.js:105 `if (!next) return null`), so the whole candidate write is refused:
// persistRun returns false, the award is never recorded, the exit stays locked (needsUniqueDeathCommit) and every
// later save in that area is refused the same way until Retry puts the boss back. The 223 fix widened the search
// but did not remove this last "no spot at all" refusal.
const SAVE_BLOCKED = [
  "save-not-blocked-at-kill",
  "status-pending",
  "drop-position-finite",
  "no-uncommitted-kill-left",
  "later-save-works",
  "award-recorded-once",
];
const KNOWN_GAPS = Object.fromEntries(
  BOSSES.flatMap((b) =>
    [
      ["entry-not-legal", "nothing legal near the corpse and the area entry sits in an exit zone"],
      ["no-ground-anywhere", "geometry.clear false everywhere"],
    ].map(([variant, cause]) => [b.areaId + "/" + variant, { expect: SAVE_BLOCKED, cause }]),
  ),
);

const results = [];
for (const boss of BOSSES)
  for (const variant of Object.keys(VARIANTS)) {
    const id = boss.areaId + "/" + variant;
    test("boss drop always: " + id, () => {
      assert(boss.reward, "every boss row has a reward row: " + boss.key);
      const failures = measure(boss, variant);
      results.push({ id, failures });
      if (process.env.BOSS_DROP_TABLE === "1")
        console.log("CASE", id, failures.length ? "FAIL " + failures.join(",") : "PASS");
      const gap = KNOWN_GAPS[id];
      if (gap) {
        assert.deepEqual(failures, gap.expect, "known gap changed (" + gap.cause + ")");
      } else assert.deepEqual(failures, [], "drop not placed or carried / save blocked");
    });
  }

test("boss drop always: coverage and gap table", () => {
  assert.equal(BOSSES.length, 7, "seven boss rows in area-content.json");
  assert.deepEqual(
    new Set(BOSSES.map((b) => b.areaId)).size,
    BOSSES.length,
    "one boss per area",
  );
  for (const b of BOSSES) assert(b.reward, "reward row for " + b.key);
  for (const id of Object.keys(KNOWN_GAPS)) assert(VARIANTS[id.split("/")[1]], "gap names a real variant: " + id);
  if (process.env.BOSS_DROP_TABLE === "1") {
    for (const r of results) console.log("CASE", r.id, r.failures.length ? "FAIL " + r.failures.join(",") : "PASS");
  }
});

// Guard: in every shipped boss area the registered entry is legal ground, so the last-resort drop spot always exists.
// Uses the shipped layout.json through createGeometry, the real LondonWorld.travelAt / lineClear, and the real
// uniqueRewardDropPosition (the validatedDropPosition every reward layer uses). A layout or registry edit that makes
// an entry illegal fails here, before it can turn into a blocked save (the KNOWN_GAPS cases above).
for (const boss of BOSSES)
  test("boss area entry is legal drop ground: " + boss.areaId, () => {
    const geometry = createGeometry(read("world/" + boss.areaId + "/layout.json")),
      w = realWorld({ areaId: boss.areaId, safehouseData: data.safehouseData }, geometry),
      entry = geometry.ground(registry.get(boss.areaId).entry);
    assert(geometry.clear(entry, 0.4), "entry is on clear ground at radius 0.4");
    assert.equal(w.travelAt(entry), null, "entry is not inside an exit zone");
    // End to end: a boss that dies nowhere near legal ground gets exactly the entry from the real position rule.
    const g = { world: w },
      corpse = { placementKey: boss.key, hp: 0, pos: { x: 400, z: 400 } },
      spot = uniqueRewardDropPosition(g, corpse, boss.reward.source);
    assert.deepEqual(spot, { x: entry.x, z: entry.z });
  });
