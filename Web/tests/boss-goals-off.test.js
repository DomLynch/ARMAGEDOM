import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGame, stepGame } from "../src/combat.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { bossGoalsEnabled, bossGoalLocks, activeGoal } from "../src/engine/boss-goal-core.js";
import { stepBossGoals } from "../src/engine/boss-goals.js";
import { createBossGoalView } from "../src/engine/boss-goal-view.js";

// Boss unlock goals with the page switch absent (the default): this process has no ?bossgoals=1, so nothing may change. Every boss is
// placed with its area exactly as before, the step creates no state and the view builds nothing.
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const RULES = GAME_DATA.bossGoals;

function game(area) {
  const data = validateAreaMetadata(read("world/area-content.json"), registry),
    geometry = createGeometry(read(registry.asset(registry.get(area).layoutRef).path)),
    world = {
      areaId: area,
      registry,
      spawn: geometry.ground(registry.get(area).entry),
      layout: { characterScale: 1.265 },
      geometry,
      bossData: data.bossData,
      progressionData: data.progression,
      expeditionData: data.expedition,
      uniqueRewardData: data.uniqueRewardData,
      populationData: data.populationData,
      residentPlacements: data.residents,
      lootRules: data.lootRules,
      lineClear: () => true,
      move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
      travelAt: () => null,
    };
  return createGame(world, {
    pilot: "donor-knife",
    pistol: true,
    supplies: true,
    vest: true,
    areaResidents: true,
    animalVariants: true,
    residentPlacements: data.residents,
    encounter: {
      id: "hollow-scavengers",
      character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 },
    },
  });
}

test("the shipped default is off and the page switch is absent", () => {
  assert.equal(RULES.bossGoalsEnabledDefault, false);
  assert.equal(bossGoalsEnabled(), false);
  assert.equal(bossGoalsEnabled(RULES, ""), false);
});

test("every boss is placed with its area, as before", () => {
  for (const row of RULES.goals) {
    const place = read("world/area-content.json").bosses.placements.find((p) => p.key === row.placementKey),
      g = game(place.areaId);
    assert.ok(
      g.enemies.some((e) => e.placementKey === row.placementKey && e.bossProfile),
      row.placementKey + " must stand in " + place.areaId,
    );
    assert.equal(bossGoalLocks(g, row.placementKey), false);
    assert.equal(activeGoal(g), null);
  }
});

test("the step creates no state and counts nothing, however many kills", () => {
  const g = game("area8");
  for (let i = 0; i < 3; i++) {
    g.events = [{ type: "death", actor: { placementKey: "x" } }];
    assert.equal(stepBossGoals(g), null);
    stepGame(g, {});
  }
  assert.equal(g.bossGoals, undefined);
  assert.ok(
    g.enemies.some((e) => e.bossProfile),
    "the boss is untouched",
  );
  assert.equal(g.message === undefined || !/boss|Marshal/i.test(g.message), true);
});

test("the view is inert and does not read the page", () => {
  let reads = 0;
  const view = createBossGoalView({ doc: { getElementById: () => (reads++, null) } });
  view.frame(game("area8"));
  view.dispose();
  assert.equal(reads, 0);
});
