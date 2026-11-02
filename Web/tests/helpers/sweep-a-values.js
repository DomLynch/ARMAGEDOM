import * as T from "three";
import { wolfResponse, wolfBiteDirection } from "../../src/wolf-native.js";
import { salamanderResponse, salamanderMouthSource } from "../../src/salamander-native.js";
import { ANIMAL_CYCLES, animalPlacement } from "../../src/animal-cycle.js";
import { mobSizeProfile } from "../../src/mob-size.js";
import { CREATURE_BEHAVIOURS, resolveCreatureBehaviour } from "../../src/creature-behaviour-presets.js";

// Every value the five modules of sweep batch A compute, as plain data: the wolf and salamander reactions, the wolf bite direction, the
// salamander mouth source (which mesh vertex it asks for), the animal placement offsets for every cycle key, the mob size profiles and the
// behaviour presets with their refusals. Used by the differential test that proves a data move changed no value.
const attempt = (fn) => {
  try {
    return fn();
  } catch (error) {
    return "throws " + error.constructor.name;
  }
};
export function sweepAValues() {
  const out = { responses: {}, bite: [], mouth: null, offsets: {}, sizes: {}, behaviours: {} };
  for (const alive of [true, false]) {
    out.responses[`wolf/${alive}`] = wolfResponse(alive, 12.5);
    out.responses[`salamander/${alive}`] = salamanderResponse(alive, 12.5);
  }
  for (const deg of [0, 30, 90, 135, 180, 270, 359]) {
    const a = (deg * Math.PI) / 180;
    out.bite.push(wolfBiteDirection({ x: Math.cos(a), z: Math.sin(a) }));
  }
  let asked = null;
  const mesh = {
    isSkinnedMesh: true,
    matrixWorld: new T.Matrix4().makeTranslation(1, 2, 3),
    getVertexPosition(index, point) {
      asked = index;
      return point.set(index / 1000, 0.5, -0.25);
    },
  };
  const source = salamanderMouthSource(
    { model: { getObjectByName: () => mesh } },
    { rig: "giant-salamander", facing: { x: 0, z: 1 } },
    new T.Vector3(),
  );
  out.mouth = {
    asked,
    source,
    other: salamanderMouthSource(
      { model: { getObjectByName: () => mesh } },
      { rig: "original-wolf", facing: { x: 0, z: 1 } },
      new T.Vector3(),
    ),
  };
  for (const cycle of ["A", "B", "C"])
    for (const key of [...Object.keys(ANIMAL_CYCLES.A), "east-roamer-9", "east-roamer-5", "nowhere-1"])
      out.offsets[`${cycle}/${key}`] = attempt(() => animalPlacement(cycle, key)?.offset ?? null);
  for (const factor of [0.85, 0.9, 1, 1.1, 1.15, 0.8, 1.2, 0.95, NaN])
    for (const base of [
      { bodyScale: 1.2, combatScale: 1.3, radius: 0.4 },
      { bodyScale: 0, combatScale: 1, radius: 1 },
      null,
    ])
      out.sizes[`${factor}/${JSON.stringify(base)}`] = attempt(() => mobSizeProfile(base, factor));
  for (const name of [...Object.keys(CREATURE_BEHAVIOURS), "missing"])
    for (const foundation of [
      { moveSpeed: 2, recoveryDelay: 0.3, weapon: "knife", supportedActions: ["slash", "stab", "heavy"] },
      { moveSpeed: 0.05, recoveryDelay: 0, weapon: "knife", supportedActions: [] },
      { moveSpeed: 9, recoveryDelay: 0, weapon: "knife", supportedActions: [] },
      { moveSpeed: 2, recoveryDelay: 9, weapon: "knife", supportedActions: [] },
      { moveSpeed: 2, recoveryDelay: -1, weapon: "knife", supportedActions: [] },
      { moveSpeed: 2 },
    ])
      out.behaviours[`${name}/${JSON.stringify(foundation)}`] = attempt(() =>
        resolveCreatureBehaviour(name, foundation),
      );
  return out;
}
