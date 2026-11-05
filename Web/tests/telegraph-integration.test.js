import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { createGame, stepGame } from "../src/combat.js";
import { createHollowEncounter } from "../src/hollow-encounter.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { collectTelegraphs, createTelegraphSet } from "../src/engine/telegraph.js";
import { pointCapacity, shapePoints } from "../src/engine/telegraph-shape.js";
import { stepBossRanged } from "../src/engine/boss-ranged.js";

// The telegraph over the real simulation: a real boss swing is read from the game's own state, fills to 1 on the tick its hit is
// allowed to land, and the player it hurts is standing inside the drawn shape.
const RULES = GAME_DATA.telegraph;
const registry = createAreaRegistry();
const raw = () => JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url)));

function setup(distance) {
  const c = validateAreaMetadata(raw(), registry),
    row = c.bossData.placements.find((p) => p.profileRef === "warden"),
    geometry = { lineClear: () => true, move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }) },
    w = {
      registry,
      areaId: "east-bridge",
      layout: { characterScale: 1.265 },
      geometry,
      bossData: c.bossData,
      residentPlacements: c.residents,
      spawn: { x: row.pos.x, z: row.pos.z + distance },
      lineClear: (a, b) => geometry.lineClear(a, b),
      move: (p, d) => geometry.move(p, d),
      travelAt: () => null,
    },
    g = createGame(w, {
      pilot: "donor-knife",
      areaResidents: true,
      openingGroup: false,
      residentPlacements: c.residents,
      encounter: createHollowEncounter({ rig: "hollow-scavenger", contactRig: "hero", weapon: "knife", bodyScale: 1 }),
    });
  g.enemies = g.enemies.filter((e) => e.bossProfile);
  g.enemies[0].facing = { x: 0, z: 1 };
  return { g, e: g.enemies[0] };
}

test("a real boss swing fills to 1 as its hit lands and the player it hurts stands inside the shape", () => {
  const { g, e } = setup(2.2),
    set = createTelegraphSet(),
    points = new Float32Array(2 * pointCapacity(RULES));
  let last = -1,
    sawFill = false,
    hurtInside = null;
  for (let n = 0; n < 240 && g.player.hp === 150; n++) {
    stepGame(g, {}, 1 / 60);
    collectTelegraphs(g, set);
    if (!e.swing) continue;
    assert.equal(set.count, 1);
    const r = set.rows[0],
      def = e.swing.def;
    assert.equal(r.source, "swing");
    assert.equal(r.reach, def.range * e.combatScale);
    assert.equal(r.arc, def.arc);
    assert.ok(r.progress >= last, "never goes backwards");
    last = r.progress;
    if (r.progress > 0 && r.progress < 1) sawFill = true;
    const count = shapePoints(r.kind, r.reach, r.arc, r.width, points, RULES),
      // The player in the attack's own frame: x to the side, z along the swing.
      dx = g.player.pos.x - r.x,
      dz = g.player.pos.z - r.z,
      along = dx * r.dx + dz * r.dz,
      side = dx * -r.dz + dz * r.dx;
    if (g.player.hp < 150) hurtInside = { along, side, count, reach: r.reach, arc: r.arc };
  }
  assert.ok(sawFill, "it filled over the wind-up");
  assert.equal(last, 1, "whole by the time the hit lands");
  assert.ok(g.player.hp < 150, "the swing hurt the player");
  // The player is within the drawn reach and inside the drawn arc when the damage lands.
  assert.ok(
    hurtInside.along > 0 && hurtInside.along <= hurtInside.reach + 1e-6,
    `along ${hurtInside.along} of ${hurtInside.reach}`,
  );
  assert.ok(
    Math.abs(Math.atan2(hurtInside.side, hurtInside.along)) <= (hurtInside.arc / 2) * (Math.PI / 180),
    "within the arc",
  );
});

test("a real boss shotgun warning is read from the game's own state and fills to the release", () => {
  const e = {
      id: 7,
      rig: "boss-south-nightborn",
      bossProfile: { attacks: { slash: { range: 1.15 } } },
      combatScale: 1.265,
      hp: 120,
      pos: { x: 0, z: 0 },
      facing: { x: 0, z: 1 },
      ready: 0,
      recoverUntil: 0,
      staggerUntil: 0,
    },
    g = {
      time: 0,
      tick: 0,
      finished: false,
      world: { areaId: "south", lineClear: () => true },
      player: { id: 0, pos: { x: 0, z: 4 }, hp: 150, radius: 0.4, combatScale: 1.265 },
      enemies: [e],
      events: [],
      bossRockets: [],
    },
    services = {
      patrol: () => false,
      move() {},
      source: () => ({ x: 0, y: 1, z: 0 }),
      trace: () => null,
      receive() {},
    },
    rule = GAME_DATA.weapons.bossRanged[e.rig],
    set = createTelegraphSet(),
    seen = [];
  for (let n = 0; n < 60 * (rule.warning + 0.2) && !(n > 5 && !e.bossRanged); n++) {
    g.time += 1 / 60;
    g.tick++;
    stepBossRanged(g, e, 1 / 60, services);
    if (collectTelegraphs(g, set).count) seen.push(set.rows[0].progress);
  }
  assert.ok(seen.length > 10, "shown during the warning");
  assert.ok(seen.every((p, i) => i === 0 || p >= seen[i - 1]));
  assert.ok(seen.at(-1) > 0.9);
  assert.equal(set.rows[0].reach, rule.range);
  assert.equal(collectTelegraphs(g, set).count, 0, "gone once the shot is released");
});
