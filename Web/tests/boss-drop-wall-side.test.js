import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture } from "./helpers/rifle-fixture.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { stageProgressionDeath } from "../src/engine/progression-runtime.js";
import { issueSupply } from "../src/supplies.js";
import { RIFLE_ITEM_ID } from "../src/engine/weapon-catalog.js";
import { LondonWorld } from "../src/world.js";
import { createGeometry, segmentsIntersect } from "../src/world-geometry.js";

// A boss that dies beside a wall must drop on the corpse's own side of it: legal ground AND lineClear(corpse, drop).
// uniqueRewardDropPosition has three searches before the area entry: ring(0.25..1 m, legal), ring(1.5..6 m, legal),
// then ring(1.5..6 m, ground only). `legal` carries the corpse line; the last ring deliberately does not. The
// corpse points are derived from each shipped layout: every road/blocker edge is sampled at 0.1 m steps with the
// corpse 0.05..0.5 m off it on both sides (inside the 0.4 m + 0.061 wall margin, so no spot at the corpse itself).
// Each point is classified by re-running the three rings in this test:
//   stage 2 / stage 3 "line-sensitive": the same ring without the corpse line would pick a spot across a wall;
//   plain: the real search finds a same-side spot.
// "Wall gap": the real search ends in the ground-only ring and the drop lands across a wall (KNOWN_WALL_GAPS).
// Every case is killed through the real path (progression death, supply, corpse, persistRun) on the real geometry,
// LondonWorld.travelAt and LondonWorld.lineClear.
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url)));
const content = read("world/area-content.json");
const registry = fixture().world.registry;
const data = validateAreaMetadata(content, registry);
const EXTRA_WORLD = {
  bossEquipmentData: data.bossEquipmentData,
  safehouseData: data.safehouseData,
  reaperData: data.reaperData,
  markedData: data.markedData,
};
const rewardRows = [
  ...Object.entries(data.bossEquipmentData).map(([field, profile]) => ({
    source: profile.source,
    state: (g) => g.bossEquipment[field],
  })),
  { source: data.rifleData.source, state: (g) => g.rifle },
];
const BOSSES = content.bosses.placements.map((p) => ({
  key: p.key,
  areaId: p.areaId,
  pos: p.pos,
  profileRef: p.profileRef,
  reward: rewardRows.find((r) => r.source.placementKey === p.key && r.source.areaId === p.areaId),
}));
const FALLBACK_RADII = [1.5, 2, 2.5, 3, 4, 5, 6];
const NEAR_RADII = [0.25, 0.5, 0.75, 1];
const same = (a, b) => (!a && !b) || (a && b && a.x === b.x && a.z === b.z);

const realWorld = (areaId, geometry, safehouseData = data.safehouseData) =>
  Object.assign(Object.create(LondonWorld.prototype), { areaId, registry, geometry, safehouseData });

// Re-runs the drop search so each corpse point can be classified; assertions use the real function's own output.
function classify(geometry, w, o) {
  const ground = (p) => geometry.clear(p, 0.4) && !w.travelAt(p),
    legal = (p) => ground(p) && w.lineClear(o, p),
    ring = (radii, accept) => {
      for (const radius of radii)
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8,
            p = { x: o.x + Math.cos(a) * radius, z: o.z + Math.sin(a) * radius };
          if (accept(p)) return p;
        }
      return null;
    };
  if (legal(o) || !w.lineClear(o, o)) return null;
  const near = ring(NEAR_RADII, legal),
    wide = ring(FALLBACK_RADII, legal),
    groundOnly = ring(FALLBACK_RADII, ground),
    real = near ?? wide ?? groundOnly,
    crosses = (p) => !!p && !w.lineClear(o, p);
  if (crosses(real)) return { kind: "wall-gap", drop: real };
  // Without the corpse line the near ring (stage 2) or the wide ring (stage 3) would have picked another spot.
  const noLineNear = ring(NEAR_RADII, ground) ?? wide ?? groundOnly,
    noLineWide = near ?? ring(FALLBACK_RADII, ground) ?? groundOnly;
  if (!same(noLineNear, real) && crosses(noLineNear)) return { kind: "stage2", drop: real };
  if (!near && !same(noLineWide, real) && crosses(noLineWide)) return { kind: "stage3", drop: real };
  return real ? { kind: "plain", drop: real } : null;
}

const CASES_PER_KIND = 2;
function deriveCases(boss) {
  const geometry = createGeometry(read("world/" + boss.areaId + "/layout.json")),
    w = realWorld(boss.areaId, geometry),
    found = { stage2: [], stage3: [], plain: [], "wall-gap": [] },
    counts = { stage2: 0, stage3: 0, plain: 0, "wall-gap": 0 },
    gapCorpses = [];
  for (const [a, b] of geometry.edges) {
    const len = Math.hypot(b.x - a.x, b.z - a.z),
      nx = -(b.z - a.z) / len,
      nz = (b.x - a.x) / len;
    for (let s = 0; s <= len; s += 0.1)
      for (const side of [-1, 1])
        for (let d = 0.05; d <= 0.5001; d += 0.05) {
          const o = {
              x: a.x + ((b.x - a.x) * s) / len + nx * d * side,
              z: a.z + ((b.z - a.z) * s) / len + nz * d * side,
            },
            c = classify(geometry, w, o);
          if (!c) continue;
          counts[c.kind]++;
          if (c.kind === "wall-gap") gapCorpses.push(o);
          if (found[c.kind].length < CASES_PER_KIND) found[c.kind].push({ corpse: o, drop: c.drop, kind: c.kind });
        }
  }
  return { geometry, found, counts, gapCorpses };
}

// Which polygon edge separates two points (road boundary or the n-th blocker)?
function separatingWall(geometry, a, b) {
  const index = geometry.edges.findIndex(([c, d]) => segmentsIntersect(a, b, c, d));
  if (index < 0) return "no layout edge between them (the safehouse boundary blocks the line)";
  let rest = index - geometry.road.length;
  if (rest < 0) return "road boundary edge " + index;
  for (let i = 0; i < geometry.blockers.length; i++) {
    if (rest < geometry.blockers[i].length) return "blocker " + i + " edge " + rest;
    rest -= geometry.blockers[i].length;
  }
  return "edge " + index;
}

function killAt(boss, pos) {
  const f = fixture({ areaId: boss.areaId, extraWorld: EXTRA_WORLD }),
    real = realWorld(boss.areaId, f.world.geometry, f.world.safehouseData);
  f.world.travelAt = (p) => real.travelAt(p);
  f.world.lineClear = (a, b) => real.lineClear(a, b);
  f.restore();
  const g = f.g,
    e = g.enemies.find((x) => x.placementKey === boss.key);
  assert(e, "boss present in " + boss.areaId);
  e.pos = { ...pos };
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
  assert(f.p.persistRun(g), "save not blocked");
  const s = boss.reward.state(g);
  assert.equal(s.status, "pending");
  return { f, drop: s.dropPosition, real };
}

// KNOWN_WALL_GAPS: measured on origin/main 8f68fb5 with the shipped layouts. `count` is how many sampled corpse
// points end in the ground-only ring and drop across a wall. Cause: ring(FALLBACK_RADII, ground) drops the corpse
// line on purpose (pickup only needs player-to-spot clearance), so when no same-side spot exists within 6 m the drop
// lands across the wall. None of these corpse points is near the boss: the boss cannot get there (homeLeash 4.5..8).
//  lambeth:     48 points; first corpse (8.91, 20.27) -> drop (7.49, 21.69), separated by blocker 1 edge 1;
//               22.3 m from the Surgeon's spawn.
//  westminster:  4 points; first corpse (-22.02, 3.05) -> drop (-20.52, 3.05), separated by the safehouse boundary
//               (no layout edge between them); 39.2 m from the Witch's spawn.
// Re-measured with the grid links (24 exits): the new exit zones change which ring spots count as legal ground, so westminster has 8
// gap points and south 6; the leash test below checks both like the rest.
// world/south-clears: South's road opened north and past the statue plinth, so its wall gaps went 6 -> 0 (an improvement); no row is needed.
// world/area8-barrier: the painted concrete barrier and the lane cut behind it add thin walls in area8: 207 gap points, all far from the boss.
const KNOWN_WALL_GAPS = { lambeth: { count: 48 }, westminster: { count: 8 }, area8: { count: 207 } };

const DERIVED = Object.fromEntries(BOSSES.map((b) => [b.areaId, deriveCases(b)]));
const KINDS = ["stage2", "stage3", "plain"];

for (const boss of BOSSES) {
  const { geometry, found, counts } = DERIVED[boss.areaId];
  for (const kind of KINDS)
    found[kind].forEach((c, i) =>
      test(`wall-side drop: ${boss.areaId} ${kind} #${i + 1}`, () => {
        const { f, drop, real } = killAt(boss, c.corpse);
        assert(f.world.geometry.clear(drop, 0.4) && !real.travelAt(drop), "drop is legal ground");
        assert(
          real.lineClear(c.corpse, drop),
          "drop is on the corpse's side of the wall: " + separatingWall(geometry, c.corpse, drop),
        );
      }),
    );
  test(`wall-side drop: ${boss.areaId} wall gaps match the known table`, () => {
    const gap = KNOWN_WALL_GAPS[boss.areaId];
    for (const c of found["wall-gap"]) {
      const { drop, real } = killAt(boss, c.corpse);
      assert.equal(real.lineClear(c.corpse, drop), false, "known gap still crosses a wall");
      if (process.env.BOSS_DROP_TABLE === "1")
        console.log(
          "WALLGAP",
          boss.areaId,
          JSON.stringify(c.corpse),
          JSON.stringify(drop),
          separatingWall(geometry, c.corpse, drop),
          "distFromBossSpawn=" + Math.hypot(c.corpse.x - boss.pos.x, c.corpse.z - boss.pos.z).toFixed(1),
        );
    }
    assert.equal(counts["wall-gap"], gap?.count ?? 0, "number of corpse points whose drop lands across a wall");
  });
}

// The known wall gaps are "not live" only while no boss can die on them. The boss actor is built by the real fixture
// path from the real boss rows: `home` is the placement pos (patrol points equal it), and residentIntent.homeLeash is
// the profile's homeLeash. The leash is measured from HOME (the spawn point; combat.js drops pursuit when the player is
// farther than homeLeash from e.home, and the boss pursues the player), not from the boss's current position. So a boss
// is held within about homeLeash of home; every gap corpse point must be farther than that from home and patrol.
for (const boss of BOSSES.filter((b) => KNOWN_WALL_GAPS[b.areaId])) {
  test(`wall-side drop: ${boss.areaId} known wall gaps stay out of the boss's leash`, () => {
    const f = fixture({ areaId: boss.areaId, extraWorld: EXTRA_WORLD });
    f.restore();
    const e = f.g.enemies.find((x) => x.placementKey === boss.key),
      leash = e.residentIntent.homeLeash,
      anchors = [e.home, ...e.patrol];
    assert(Number.isFinite(leash) && leash > 0, "leash read from the boss row");
    assert.equal(leash, content.bosses.profiles[boss.profileRef].homeLeash, "actor leash is the profile's homeLeash");
    const { gapCorpses } = DERIVED[boss.areaId];
    assert.equal(gapCorpses.length, KNOWN_WALL_GAPS[boss.areaId].count);
    let nearest = Infinity;
    for (const p of gapCorpses) for (const a of anchors) nearest = Math.min(nearest, Math.hypot(p.x - a.x, p.z - a.z));
    assert(
      nearest > leash,
      `a wall-gap corpse point is ${nearest.toFixed(2)} m from home, inside the ${leash} m leash`,
    );
    if (process.env.BOSS_DROP_TABLE === "1")
      console.log("LEASH", boss.areaId, "leash=" + leash, "nearestGapPoint=" + nearest.toFixed(2));
  });
}

test("wall-side drop: every area has cases and the table names real areas", () => {
  for (const boss of BOSSES) {
    const { found, counts } = DERIVED[boss.areaId];
    if (process.env.BOSS_DROP_TABLE === "1")
      console.log(
        "COUNTS",
        boss.areaId,
        JSON.stringify(counts),
        "cases",
        KINDS.reduce((n, k) => n + found[k].length, 0),
      );
    assert(
      KINDS.some((k) => found[k].length > 0),
      "derived at least one wall-side case in " + boss.areaId,
    );
  }
  for (const id of Object.keys(KNOWN_WALL_GAPS)) assert(DERIVED[id], "gap names a boss area: " + id);
  assert(RIFLE_ITEM_ID);
});
