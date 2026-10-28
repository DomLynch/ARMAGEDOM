import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createActors } from "../src/actors.js";
import { ensureSlotModels, slotModelRefs } from "../src/engine/slot-models.js";

// A slot creature that is dead when the run is restored (or the area is entered again) is in neither enemies nor corpses, so the
// ordinary model preparation never loads its deferred foundation; its respawn then throws inside the frame loop.
const manifest = {
  pilot: "donor-knife",
  models: {
    "giant-salamander": { rig: "giant-salamander", deferred: true },
    "giant-eel": { rig: "giant-eel", deferred: true },
    "original-rat": { rig: "original-rat" },
    vagrant: { rig: "vagrant" },
  },
};
const stub = (rig) => ({
  description: { rig, clips: {} },
  gltf: { scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())), animations: [] },
});
function setup(t) {
  const prior = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
  };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
  const calls = [],
    world = {
      areaId: "westminster",
      layout: {},
      toRender: (p) => new THREE.Vector3(p.x, 0, -p.z),
      residentPlacements: { westminster: [{ key: "w-1", appearanceRef: "west-look" }, { key: "w-2" }], east: [] },
      populationData: {
        areas: {
          westminster: { creatureSlot: { cycles: { A: { foundationRef: "giant-salamander" }, B: { foundationRef: "giant-eel" } } } },
          east: { creatureSlot: { cycles: { A: { foundationRef: "original-rat" }, B: { foundationRef: "original-rat" } } } },
        },
      },
    },
    library = {
      manifest,
      models: new Map([["vagrant", stub("vagrant")]]),
      async ensureModels(refs) {
        calls.push(refs);
        for (const ref of refs) library.models.set(ref, stub(ref));
      },
      dispose() {},
    },
    actors = createActors(new THREE.Scene(), world, library);
  t.after(() => actors.dispose());
  return { calls, world, library, actors };
}
const slotCreature = () => ({
  id: 7,
  kind: 0,
  rig: "giant-salamander",
  placementKey: "westminster-roamer-2",
  pos: { x: 2, z: 0 },
  facing: { x: 0, z: 1 },
  hp: 10,
  maxHp: 10,
});

test("slot refs are the deferred cycle foundations and resident appearances, the same the fresh retry queues", async (t) => {
  const { calls, world, actors } = setup(t);
  for (const area of ["westminster", "east", "missing"]) {
    await actors.ensureAreaModels({ enemies: [] }, area, { fresh: true });
    assert.deepEqual(new Set(slotModelRefs(world, area, manifest)), new Set(calls.at(-1)), area);
  }
  assert.deepEqual(slotModelRefs(world, "westminster", manifest), ["giant-salamander", "giant-eel", "west-look"]);
  assert.deepEqual(slotModelRefs(world, "east", manifest), [], "foundations that ship with the library are not deferred");
});

test("a slot creature dead at restore respawns without 'export not ready' once the slot models are prepared", async (t) => {
  const { calls, world, library, actors } = setup(t);
  const game = { player: { id: 0, kind: -1, pos: { x: 0, z: 0 }, facing: { x: 0, z: 1 } }, enemies: [], time: 0 };
  // Restore: the creature is dead, so the saved record names no live or corpse actor and nothing deferred is requested.
  await actors.ensureAreaModels({ enemies: [], corpses: [] }, "westminster");
  assert.deepEqual(calls.at(-1), [], "the ordinary preparation asks for nothing (the defect)");
  game.enemies = [slotCreature()]; // ... and then it respawns
  assert.throws(() => actors.update(game, 0), /Original giant-salamander export not ready/);
  // Fix: the restore and area-entry paths also prepare the slot's models.
  await ensureSlotModels(library, world, "westminster");
  assert.deepEqual(calls.at(-1), ["giant-salamander", "giant-eel", "west-look"]);
  try {
    actors.update(game, 0);
  } catch (error) {
    assert.doesNotMatch(String(error), /export not ready/, "the respawned slot creature has its model");
  }
});

test("slot model preparation is optional: no library, no refs and a failed download never throw", async (t) => {
  const { calls, world, library } = setup(t);
  assert.equal(ensureSlotModels(null, world, "westminster"), undefined);
  assert.equal(ensureSlotModels(library, world, "east"), undefined, "nothing deferred in the area: no promise, so callers add no turn");
  assert.deepEqual(calls, [], "nothing deferred in the area, nothing requested");
  await ensureSlotModels({ ...library, ensureModels: async () => Promise.reject(Error("offline")) }, world, "westminster");
  await ensureSlotModels({ manifest }, world, "westminster");
});

test("restore and area entry prepare the slot models right after the ordinary preparation", () => {
  const session = readFileSync(new URL("../src/engine/browser-session.js", import.meta.url), "utf8"),
    areas = readFileSync(new URL("../src/engine/areas.js", import.meta.url), "utf8");
  for (const [source, ordinary, slot] of [
    [session, "await actors.ensureAreaModels(game);", "ensureSlotModels(library, world, world.areaId);"],
    [areas, "await s.actors.ensureAreaModels?.(record, task.areaId);", "ensureSlotModels(s.survivorLibrary, s.world, task.areaId);"],
  ]) {
    const first = source.indexOf(ordinary),
      second = source.indexOf(slot);
    assert(first > 0 && second > first, `${slot} follows ${ordinary}`);
  }
  assert.match(session, /import \{ ensureSlotModels \} from "\.\/slot-models\.js";/);
  assert.match(areas, /import \{ ensureSlotModels \} from "\.\/slot-models\.js";/);
});
