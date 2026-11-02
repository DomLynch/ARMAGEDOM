import test from "node:test";
import assert from "node:assert/strict";
import { rigCapability, rigText } from "../src/rig-capabilities.js";
import { animalAppearanceFor } from "../src/area-mob-spawns.js";
import { populationPlacements } from "../src/engine/area-population.js";

// Data move: the population slot list, the drone checks, the east wolf guard and the animal appearance prefix matched rig names in
// area-population.js, area-content.js and area-mob-spawns.js. They are rig-capabilities.json rows now. The OLD checks below are
// copied verbatim from those files before the move.
const probes = [
  "original-rat",
  "original-dog",
  "original-roach",
  "low-hover-drone",
  "giant-salamander",
  "original-wolf",
  "hollow-scavenger",
  "",
  undefined,
  null,
  "constructor",
];
const OLD_FOUNDATIONS = ["original-rat", "original-dog", "original-roach", "low-hover-drone", "giant-salamander"];
const oldAppearance = (entity) => {
  const id = entity.animalRecipe;
  return id &&
    ((id.startsWith("rat-") && entity.rig === "original-rat") ||
      (id.startsWith("dog-") && entity.rig === "original-dog") ||
      (id.startsWith("roach-") && entity.rig === "original-roach"))
    ? id
    : null;
};

test("population slot, drone and wolf checks answer as the old comparisons did", () => {
  for (const rig of probes) {
    assert.equal(rigCapability(rig, "populationSlot"), OLD_FOUNDATIONS.includes(rig), `slot ${rig}`);
    assert.equal(rigText(rig, "brain") === "drone", rig === "low-hover-drone", `drone ${rig}`);
    assert.equal(rigText(rig, "species") === "wolf", rig === "original-wolf", `wolf ${rig}`);
  }
});

test("the animal appearance prefix matches every recipe family against every rig as before", () => {
  const recipes = [
    "rat-a",
    "dog-pack-chaser",
    "roach-b",
    "wolf-east-guard",
    "salamander-x",
    "rat",
    "ratty",
    "",
    undefined,
  ];
  for (const rig of probes)
    for (const animalRecipe of recipes) {
      const entity = { kind: 0, rig, animalRecipe, placementKey: "none" };
      assert.equal(animalAppearanceFor(entity), oldAppearance(entity), `${rig} ${animalRecipe}`);
    }
});

test("the east wolf guard keeps its wolf row through a population policy, other animals become humans", () => {
  const policy = {
    areas: {
      east: {
        activePlacementIds: ["east-roamer-8", "east-roamer-9"],
        creatureSlot: { placementKey: "none", cycles: { A: { foundationRef: "original-rat", recipeRef: "rat-a" } } },
      },
    },
  };
  const wolf = { key: "east-roamer-8", foundationRef: "original-wolf", recipeRef: "wolf-east-guard" };
  const dog = { key: "east-roamer-9", foundationRef: "original-dog", recipeRef: "dog-pack-chaser" };
  const out = populationPlacements(policy, "east", "A", [wolf, dog]);
  assert.deepEqual(out[0], wolf);
  assert.deepEqual(out[1], { key: "east-roamer-9" });
  const other = populationPlacements(policy, "east", "A", [{ ...wolf, recipeRef: "other" }]);
  assert.deepEqual(other[0], { key: "east-roamer-8" });
});
