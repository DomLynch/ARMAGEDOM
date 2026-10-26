import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import { FLAME_VISUAL_DATA } from "../src/engine/flame-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/flame-data.js 14 to 0, flame-core.js 1 to 0, flame-fuel-state.js 2 to 1 (value-identical): FLAME_VISUAL_DATA now comes from
// visual.json flameEffect.particles (the palette stored as hex strings), the flame save version and the fuel ULP headroom are marked
// tuning-ok. The 40 degree contact cone stays in flame-fuel-state.js: it is the hit path, a separate tier-b move.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("FLAME_VISUAL_DATA equals the object the file used to hold in code", () => {
  assert.deepEqual(FLAME_VISUAL_DATA, {
    emitterCount: 24, reducedCount: 6, burnSlots: 6, burnPerVictim: 2, burnSeconds: 0.35, textureSize: 32,
    emitterWidth: [0.26, 0.5], burnWidth: [0.5, 0.7], burnAspect: 1.65, palette: [0xfff6ce, 0xffb843, 0xf15a10],
  });
  assert(Object.isFrozen(FLAME_VISUAL_DATA));
});

test("the loader refuses a bad particles row", () => {
  const broken = (mutate) => () => {
    const v = structuredClone(JSON.parse(text("../src/data/visual.json")));
    mutate(v.flameEffect.particles);
    validateVisual(v);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((p) => { delete p.palette; }));
  assert.throws(broken((p) => { p.extra = 1; }));
  assert.throws(broken((p) => { p.palette = ["0xfff6ce"]; }));
  assert.throws(broken((p) => { p.reducedCount = p.emitterCount + 1; }));
  assert.throws(broken((p) => { p.burnWidth = [0.5]; }));
  assert.throws(broken((p) => { p.burnSlots = 0; }));
});

test("the gate counts 0 in the two files, 1 in flame-fuel-state.js (the cone), and the baseline agrees", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json"));
  for (const file of ["engine/flame-data.js", "engine/flame-core.js"]) {
    assert.equal(countNumberLiterals(text(`../src/${file}`)).count, 0, file);
    assert(!(file in baseline.numberLiterals), file);
  }
  assert.equal(countNumberLiterals(text("../src/engine/flame-fuel-state.js")).count, 1);
  assert.equal(baseline.numberLiterals["engine/flame-fuel-state.js"], 1);
  assert.equal(GAME_DATA.visual.flameEffect.particles.palette.length, 3);
});
