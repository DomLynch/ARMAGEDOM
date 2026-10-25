import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createActors } from "../src/actors.js";
import { createGame, enemy } from "../src/combat.js";

// Release 204 gated offscreen preparation to the travel pause because one step ran 56.7 ms. Every step of
// building a resident's views must stay short so the same iterator can be pumped from idle time later.
// The target is 8 ms (the splits hold it on a quiet machine); the assertion allows 12 so a shared, loaded runner
// does not flake (and the best of three measurements is judged, see below) while a regression to the old steps of 35-58 ms still fails by a wide margin.
const STEP_BUDGET_MS = 12;
const HARD_CEILING_MS = 25;

test("building a Hollow resident's views never runs one step past the step budget", async (t) => {
  const read = (p) => readFileSync(new URL("../public/assets/" + p, import.meta.url)),
    manifest = JSON.parse(read("manifest-hollow.json"));
  const prior = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
        drawImage() {},
        getImageData: () => ({ data: new Uint8Array([255, 255, 255, 255]) }),
      }),
    }),
  };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
  const load = async (name) => ({
    description: manifest.models[name],
    gltf: await loadGeometry(read(manifest.models[name].url)),
    equipment: manifest.models[name].equipment ? await loadGeometry(read(manifest.models[name].equipment.url)) : null,
    armSever: manifest.models[name].armSever ? await loadGeometry(read(manifest.models[name].armSever.url)) : null,
  });
  const models = new Map([
    ["vagrant", await load("vagrant")],
    ["hollow-scavenger", await load("hollow-scavenger")],
  ]);
  const world = {
    areaId: "east",
    layout: { characterScale: 1.265 },
    toRender: ({ x, z }) => new THREE.Vector3(x, 0, -z),
  };
  const actors = createActors(new THREE.Scene(), world, { manifest, models, dispose() {} });
  t.after(() => actors.dispose());
  const game = createGame(world, { pilot: "donor-knife", finishers: true });
  const resident = Object.assign(enemy(0, { x: 2, z: 2 }), { rig: "hollow-scavenger" });
  // Timing is noisy on a shared runner: the first (cold) build is skipped and the 99th percentile of the
  // rest is held to the budget, with a looser hard ceiling for the few steps that are one atomic piece of work.
  const measure = (attempt) => {
    const times = [];
    for (let run = 0; run < 4; run++) {
      const steps = actors.prepareAreaSteps(
        `run-${attempt}-${run}`,
        { enemies: [{ ...resident, id: 100 + attempt * 10 + run }], corpses: [] },
        { ...world, scene: new THREE.Scene() },
        game.finishers,
      );
      const run_ = [];
      // The view build, then the finisher geometry that arrival leaves for the idle pump: both in steps.
      for (const source of [steps, actors.deferredFinisherSteps()])
        for (;;) {
          const started = performance.now(),
            step = source.next();
          run_.push(performance.now() - started);
          if (step.done) break;
        }
      assert.ok(run_.length > 50, "the build is split into many steps");
      if (run > 0) times.push(...run_);
    }
    times.sort((a, b) => a - b);
    return { p99: times[Math.floor(times.length * 0.99)], max: times.at(-1) };
  };
  // A step that is too long in the code is too long every time; a runner that stalls the process (a neighbour job, GC) stalls
  // one measurement. So the budget holds if any of up to three measurements stays under it (CI run for #152 saw one 28.3 ms step).
  let best;
  for (let attempt = 0; attempt < 3; attempt++) {
    const got = measure(attempt);
    if (!best || got.max + got.p99 < best.max + best.p99) best = got;
    if (got.p99 <= STEP_BUDGET_MS && got.max <= HARD_CEILING_MS) break;
  }
  assert.ok(best.p99 <= STEP_BUDGET_MS, `99th percentile step ${best.p99.toFixed(1)} ms in the best of 3`);
  assert.ok(best.max <= HARD_CEILING_MS, `slowest step ${best.max.toFixed(1)} ms in the best of 3`);
});
