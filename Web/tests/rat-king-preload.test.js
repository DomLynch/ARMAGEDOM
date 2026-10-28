import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createActors } from "../src/actors.js";
import { validatePopulationData } from "../src/engine/area-population.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../public/assets/manifest-hollow.json");
const content = read("../public/world/area-content.json");

// The crash: kill the Rat King, reload while he is dead, and on respawn the actor view threw "Original rat-king export not ready" because the
// fresh-area preloader only read the raw resident rows (no appearanceRef there: the model lives on the slot's cycle spec).
function setup(t, search) {
  const prior = globalThis.document,
    priorLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
  if (search !== undefined) globalThis.location = { search };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
    if (priorLocation) Object.defineProperty(globalThis, "location", priorLocation);
    else delete globalThis.location;
  });
  const calls = [],
    library = { manifest, models: new Map(), ensureModels: async (refs) => calls.push(refs), modelUrls: (refs) => refs, dispose() {} },
    world = {
      areaId: "area7",
      layout: {},
      toRender: (p) => new THREE.Vector3(p.x, 0, -p.z),
      populationData: content.population,
      residentPlacements: content.residents,
    },
    actors = createActors(new THREE.Scene(), world, library);
  t.after(() => actors.dispose());
  return { calls, actors };
}

test("fresh area preload queues the Rat King model from the slot cycle spec (the raw resident rows do not carry it)", async (t) => {
  const { calls, actors } = setup(t);
  assert.equal(content.residents.area7.some((row) => row.appearanceRef === "rat-king"), false, "the reproduction: no resident row names the model");
  await actors.ensureAreaModels({ enemies: [] }, "area7", { fresh: true });
  assert.ok(calls.at(-1).includes("rat-king"), "fresh preload must queue rat-king");
  assert.ok(actors.areaPrefetchUrls("area7").includes("rat-king"), "area entry prefetch must queue rat-king");
  assert.ok(!actors.areaPrefetchUrls("lambeth").includes("rat-king"), "other areas do not");
});

test("with ?noratking=1 the model is not queued (the plain rat-soot returns)", async (t) => {
  const { calls, actors } = setup(t, "?noratking=1");
  await actors.ensureAreaModels({ enemies: [] }, "area7", { fresh: true });
  assert.ok(!calls.at(-1).includes("rat-king"));
  assert.ok(!actors.areaPrefetchUrls("area7").includes("rat-king"));
});

test("the cycle spec's appearanceRef must be a rig-matching animal recipe row in appearance.json", () => {
  const registry = createAreaRegistry({ manifest: read("../public/world/manifest.json") }),
    checked = validateAreaMetadata(content, registry);
  const make = (mutate) => {
    const population = structuredClone(checked.populationData);
    mutate(population.areas.area7.creatureSlot.cycles.A);
    return () => validatePopulationData(population, registry, checked.residents);
  };
  assert.doesNotThrow(make(() => {}));
  assert.throws(make((spec) => (spec.appearanceRef = "no-such-model")), /Invalid registered area population/);
  assert.throws(make((spec) => (spec.appearanceRef = "dog-street-mongrel")), /Invalid registered area population/, "right row, wrong foundation");
});
