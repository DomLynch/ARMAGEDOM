import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import { rigCapability } from "../src/rig-capabilities.js";
import { countRigLiterals } from "../../scripts/as-data-gate.mjs";

// Data move: effects.js no longer names rigs. Where a hit burst, kill confirmation, tracer end and target reticle aim now comes from
// visual.json effects.targetHeights; the fire-breath glow asks the breathEmitter capability.
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url))));
const heights = GAME_DATA.visual.effects.targetHeights;
const low = { "original-rat": { scaled: 0.18 }, "original-dog": { scaled: 0.35 }, "original-roach": { scaled: 0.08 }, "original-crow": { scaled: 0.18 }, "original-spider": { scaled: 0.1 } }; // 28 Oct: the crow stands as tall as the rat

test("the height rows equal the old in-code numbers, site by site", () => {
  assert.deepEqual(heights.burst, { default: { scaled: 1.1 }, "original-wolf": { fixed: 1.625 }, "original-elephant": { fixed: 2.7 }, "low-hover-drone": { drone: true }, ...low });
  assert.deepEqual(heights.confirm, { default: { scaled: 2 }, "original-wolf": { fixed: 1.625 }, "original-elephant": { fixed: 2.7 }, "low-hover-drone": { drone: true }, ...low });
  assert.deepEqual(heights.tracer, {
    default: {},
    "original-wolf": { fixed: 1.625 },
    "original-elephant": { fixed: 2.7 },
    "low-hover-drone": { drone: true },
    ...low,
    "giant-salamander": { scaled: 0.18 },
  });
  assert.deepEqual(heights.reticle, {
    default: { scaled: 1.15 },
    "giant-salamander": { cue: true },
    "original-wolf": { cue: true },
    "original-elephant": { cue: true },
    "low-hover-drone": { drone: true },
    ...low,
  });
  assert(Object.isFrozen(heights.burst) && Object.isFrozen(heights.burst["original-rat"]));
});

test("effects.js keeps no rig-name literal and asks for the fire-breath emitter by capability", () => {
  const source = fs.readFileSync(new URL("../src/effects.js", import.meta.url), "utf8");
  const rigs = Object.keys(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))).rigCapabilities);
  assert.equal(countRigLiterals(source, rigs), 0);
  assert.equal(rigCapability("giant-salamander", "breathEmitter"), true);
  for (const rig of rigs.filter((r) => r !== "giant-salamander")) assert.equal(rigCapability(rig, "breathEmitter"), false, rig);
});

test("the loader rejects a broken targetHeights block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d.effects.targetHeights);
    validateVisual(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((t) => { delete t.tracer; }));
  assert.throws(broken((t) => { t.extra = {}; }));
  assert.throws(broken((t) => { delete t.burst.default; }));
  assert.throws(broken((t) => { t.burst["original-rat"] = { scaled: 0.18, fixed: 1 }; }));
  assert.throws(broken((t) => { t.burst["original-rat"] = { height: 1 }; }));
  assert.throws(broken((t) => { t.burst["original-rat"] = { scaled: -1 }; }));
  assert.throws(broken((t) => { t.burst["original-rat"] = { drone: false }; }));
  assert.throws(broken((t) => { t.burst["Bad Rig"] = { fixed: 1 }; }));
});
