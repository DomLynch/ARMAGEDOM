import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { populationPlacements, validatePopulationData } from "../src/engine/area-population.js";
import { wolfFixture } from "./helpers/wolf-fixture.js";
import { stepGame } from "../src/combat.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { CREATURE_MOVES } from "../src/creature-moves.js";
import { rigCapability, rigNumber } from "../src/rig-capabilities.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const creatureHealth = (rig) => JSON.parse(fs.readFileSync(new URL("../src/data/creatureDefinitions.json", import.meta.url), "utf8")).definitions.find((d) => d.id === rig).stats.health;
const place = (cycle, search = "") =>
  populationPlacements(content.populationData, "elephant-and-castle", cycle, content.residents["elephant-and-castle"], search).find(
    (row) => row.key === "elephant-and-castle-resident-2",
  );

test("the elephant is the Elephant and Castle creature slot in both cycles, on by default", () => {
  for (const cycle of ["A", "B"]) {
    const row = place(cycle);
    assert.equal(row.foundationRef, "original-elephant");
    assert.equal(row.recipeRef, "elephant-ashen-bull");
  }
  assert.equal(rigCapability("original-elephant", "nativeSkeleton"), true);
  assert.equal(rigNumber("original-elephant", "mouthOffset"), 0);
});

test("?noelephant=1 gives the slot back to the original dog (A) or roach (B)", () => {
  assert.equal(place("A", "?noelephant=1").foundationRef, "original-dog");
  assert.equal(place("B", "?noelephant=1").foundationRef, "original-roach");
  assert.equal(place("B", "?nocrow=1").foundationRef, "original-elephant");
});

// The Auditor-facing coverage of the two engine changes: the bite row chosen from a rig's biteMove (combat.js) and the per-cycle `off`
// creature (area-population.js).
function firstSwing(areaId, rig, side = -1) {
  const f = wolfFixture({ areaId }),
    g = f.g,
    e = g.enemies.find((x) => x.rig === rig);
  g.enemies = [e];
  g.player.pos = { x: e.pos.x, z: e.pos.z + side * e.contactGoalReach * 0.9 };
  g.ratContact = { calf: () => ({ x: g.player.pos.x, y: 1.6, z: g.player.pos.z }), foot: () => null, capture: () => ({ rats: new Map() }), hit: () => false };
  for (let i = 0; i < 1500 && !e.swing; i++) stepGame(g);
  return e.swing;
}

test("combat picks the bite row named by the rig's biteMove: elephant_attack for the elephant, wolf_attack for the wolf", () => {
  const elephant = firstSwing("elephant-and-castle", "original-elephant");
  assert.equal(elephant.moveId, "elephant_bite");
  assert.equal(elephant.def.damage, 16);
  const wolf = firstSwing("east", "original-wolf", 1);
  assert.equal(wolf.moveId, "wolf_bite");
  assert.equal(wolf.def.damage, 8);
});

test("guard: no roach_attack, dog_attack or unnamed _attack move row may exist (they would override ROACH_BITE / DOG_BITE now that the bite row comes from biteMove)", () => {
  for (const name of ["roach_attack", "dog_attack", "undefined_attack", "_attack"]) assert.equal(CREATURE_MOVES[name], undefined, name);
});

test("?noelephant=1: the server spawn row says elephant / 150 hp, the client slot is a dog / roach, so the engage mismatches and is refused (O0002), never misjudged", () => {
  const row = JSON.parse(fs.readFileSync(new URL("../../server/data/spawns.json", import.meta.url), "utf8"))["elephant-and-castle:elephant-and-castle-resident-2"];
  assert.deepEqual([row.kind, row.maxHp], ["original-elephant", 150]);
  const off = place("A", "?noelephant=1");
  assert.equal(off.foundationRef, "original-dog");
  const hp = creatureHealth(off.foundationRef);
  // arma_spawn_engage (supabase/migrations/20261024000002_arma_world.sql) raises O0002 when s.kind <> p_kind or s.max_hp <> p_max_hp.
  assert.notEqual(off.foundationRef, row.kind);
  assert.notEqual(hp, row.maxHp);
});

test("a slot cycle's `off` creature is validated like the cycle's own creature", () => {
  const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
  const make = (mutate) => () => {
    const data = structuredClone(content.populationData);
    mutate(data.areas["elephant-and-castle"].creatureSlot.cycles.A);
    return validatePopulationData(data, registry, content.residents);
  };
  make(() => {})();
  assert.throws(make((spec) => (spec.off.recipeRef = "wolf-east-guard")), /Invalid registered area population/);
  assert.throws(make((spec) => (spec.off.foundationRef = "original-wolf")), /Invalid registered area population/);
  assert.throws(make((spec) => (spec.off.extra = 1)));
});

test("the elephant bite is its own heavier row; the model file matches its manifest pin", () => {
  assert.equal(CREATURE_MOVES.elephant_attack.damage, 16);
  assert.equal(CREATURE_MOVES.elephant_attack.clip, "Bite");
  const manifest = read("assets/manifest-hollow.json").models["original-elephant"];
  const bytes = fs.readFileSync(new URL("../public/assets/" + manifest.url, import.meta.url));
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
  assert(bytes.length < 600 * 1024, "phone budget: under about 600 KB");
});
