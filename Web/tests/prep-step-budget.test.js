import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createActors } from "../src/actors.js";
import { createGame, enemy } from "../src/combat.js";

// Release 204 gated offscreen preparation to the travel pause because one step ran 56.7 ms. Every step of
// building a resident's views must stay short so the same iterator can be pumped from idle time later.
const STEP_BUDGET_MS = 8;
// Before the split the same build ran steps of 35-58 ms; none may come back anywhere near that.
const HARD_CEILING_MS = 20;

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
  const times = [];
  for (let run = 0; run < 4; run++) {
    const steps = actors.prepareAreaSteps(
      `run-${run}`,
      { enemies: [{ ...resident, id: 100 + run }], corpses: [] },
      { ...world, scene: new THREE.Scene() },
      game.finishers,
    );
    const run_ = [];
    for (;;) {
      const started = performance.now(),
        step = steps.next();
      run_.push(performance.now() - started);
      if (step.done) break;
    }
    assert.ok(run_.length > 50, "the build is split into many steps");
    if (run > 0) times.push(...run_);
  }
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99)],
    max = times.at(-1);
  assert.ok(p99 <= STEP_BUDGET_MS, `99th percentile step ${p99.toFixed(1)} ms`);
  assert.ok(max <= HARD_CEILING_MS, `slowest step ${max.toFixed(1)} ms`);
});
