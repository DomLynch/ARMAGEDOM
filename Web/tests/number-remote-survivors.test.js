import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createSurvivorKit, survivorVariantIndex } from "../src/engine/remote-survivors.js";
import { GAME_DATA, validateRemoteSurvivors } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/remote-survivors.js 8 to 0 (value-identical). The two FNV-1a hash constants are marked `// tuning-ok`; the default hero scale
// reads areaRuntime view.defaultCharacterScale (World's row, 1.265); the five look numbers moved to data/remoteSurvivors.json.
const read = (p) => fs.readFileSync(new URL("../public/assets/" + p, import.meta.url));
const manifest = JSON.parse(read("manifest-hollow.json")),
  description = manifest.models.vagrant;
const source = async () => ({ description, gltf: await loadGeometry(read(description.url)), equipment: await loadGeometry(read(description.equipment.url)) });
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/remoteSurvivors.json", import.meta.url))));

// The old in-code hash, copied from origin/main 1286b716.
function oldIndex(id, count) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % count;
}

test("the variant index is the old FNV-1a result for a spread of ids and counts", () => {
  for (const id of [1, 7, 42, "a1b2", "uuid-0001", "7f3c9a52-1b2d-4e6f-9a10-c0ffee000001", 123456789, ""])
    for (const count of [1, 2, 5, 6, 7]) assert.equal(survivorVariantIndex(id, count), oldIndex(id, count), `${id} / ${count}`);
  for (let id = 1; id <= 500; id++) assert.equal(survivorVariantIndex(id, 6), oldIndex(id, 6));
});

test("the look data holds the old numbers", () => {
  assert.deepEqual(GAME_DATA.remoteSurvivors, {
    schema_version: 1, ringSegments: 40, ringInner: 0.62, ringOuter: 0.74, ringOpacity: 0.85, markerHeight: 0.03, maxFrameSeconds: 0.1, walkBlendPerSecond: 6,
  });
  assert.equal(GAME_DATA.areaRuntime.view.defaultCharacterScale, 1.265);
  assert(Object.isFrozen(GAME_DATA.remoteSurvivors));
});

test("a spawned figure's ring and marker use the data numbers; the default scale equals the old 1.265", async () => {
  const src = await source(),
    figure = createSurvivorKit({ source: src }).spawn(3),
    ring = figure.root.getObjectByName("Friendly ring");
  assert.equal(ring.geometry.parameters.thetaSegments, 40);
  assert.equal(ring.material.opacity, 0.85);
  assert.equal(ring.position.y, 0.03);
  const explicit = createSurvivorKit({ source: src, characterScale: 1.265 }).spawn(3);
  const scaleOf = (f) => { let s = null; f.root.traverse((o) => { if (s === null && o.scale && o.scale.x !== 1) s = o.scale.x; }); return s; };
  assert.equal(scaleOf(figure), scaleOf(explicit), "no characterScale given == the old default");
});

test("the loader refuses missing, extra or out-of-range look numbers", () => {
  const broken = (mutate) => () => { const d = raw(); mutate(d); validateRemoteSurvivors(d); };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.ringOpacity; }));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.ringSegments = 3; }));
  assert.throws(broken((d) => { d.ringSegments = 40.5; }));
  assert.throws(broken((d) => { d.ringOpacity = 0; }));
  assert.throws(broken((d) => { d.ringOpacity = 1.5; }));
  assert.throws(broken((d) => { d.maxFrameSeconds = 0; }));
  assert.throws(broken((d) => { d.walkBlendPerSecond = "6"; }));
});

test("the gate counts 0 in remote-survivors.js (two marked hash constants) and the baseline entry is gone", () => {
  const r = countNumberLiterals(fs.readFileSync(new URL("../src/engine/remote-survivors.js", import.meta.url), "utf8"));
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  // The tightened gate (2, 3, 4, 10, 0.5 and named constants count) still finds numbers here: the baseline entry is the ratchet.
  assert.equal(r.count, baseline.numberLiterals["engine/remote-survivors.js"] ?? 0);
  assert.equal(r.count, 0);
  assert.equal(r.reasons.length, 3, "two hash constants and the quarter turn that lays the ring flat");
  assert(r.reasons.every((line) => /FNV-1a|quarter turn/.test(line)));
});
