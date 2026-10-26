import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GAME_DATA, validateBrowserSession } from "../src/engine/game-data.js";
import { CLOSE_REPLACED } from "../src/engine/presence-client.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/browser-session.js 17 to 0 (value-identical). The old in-code values are from origin/main (a83d1f01 lineage, 1286b716):
// actor scale 1.3225; hemisphere 0xb9bec9 / 0x4b3828 at 1.6; sun 0xffd7a0 at 2.3 placed (-7, 12, 6); rim 0xd4c7a5, 3.2, distance 5;
// pixel-ratio cap 1.5; on-screen message 5 s (twice); closes 1000 / 1001 / 4010 are not beaconed.
// The session needs a canvas, a renderer and the whole game, so the values and the source's reads are pinned here.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(text("../src/data/browserSession.json")));
// three turns "#rrggbb" and the old hex number into the same colour (sRGB in, working space out): compare the converted components.
const same = (css, number) => assert.deepEqual(new THREE.Color(css).toArray(), new THREE.Color(number).toArray(), css);

test("the data converts to exactly the numbers the code used to hold", () => {
  const d = GAME_DATA.browserSession,
    l = d.sceneLights;
  assert.equal(d.actorVisualScale, 1.3225);
  assert.equal(d.maxPixelRatio, 1.5);
  assert.equal(d.messageSeconds, 5);
  same(l.hemiSky, 0xb9bec9);
  same(l.hemiGround, 0x4b3828);
  same(l.sunColor, 0xffd7a0);
  same(l.rimColor, 0xd4c7a5);
  assert.equal(new THREE.Color(l.rimColor).getHex(), 0xd4c7a5);
  assert.deepEqual([...l.sunPosition], [-7, 12, 6]);
  assert.equal(l.rimIntensity, 3.2);
  assert.equal(l.rimDistance, 5);
  assert.equal(GAME_DATA.areaRuntime.defaultLighting.fillIntensity, 1.6, "hemisphere starts at the default fill");
  assert.equal(GAME_DATA.areaRuntime.defaultLighting.keyIntensity, 2.3, "sun starts at the default key");
  assert.equal(CLOSE_REPLACED, 4010);
  assert(Object.isFrozen(d) && Object.isFrozen(l.sunPosition));
});

test("the session source reads each value from the data rows", () => {
  const src = text("../src/engine/browser-session.js");
  for (const use of [
    "GAME_DATA.browserSession.actorVisualScale",
    "new THREE.HemisphereLight(lights.hemiSky, lights.hemiGround, startLighting.fillIntensity)",
    "new THREE.DirectionalLight(lights.sunColor, startLighting.keyIntensity)",
    "sun.position.set(...lights.sunPosition)",
    "new THREE.PointLight(lights.rimColor, lights.rimIntensity, lights.rimDistance, 2)",
    "Math.min(devicePixelRatio, GAME_DATA.browserSession.maxPixelRatio)",
    "[1000, 1001, CLOSE_REPLACED]",
  ])
    assert(src.includes(use), use);
  assert.equal(src.split("GAME_DATA.browserSession.messageSeconds").length - 1, 2);
});

test("the loader refuses missing, extra, malformed or out-of-range values", () => {
  const broken = (mutate) => () => { const d = raw(); mutate(d); validateBrowserSession(d); };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.sceneLights.rimColor; }));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.actorVisualScale = 0; }));
  assert.throws(broken((d) => { d.maxPixelRatio = 0.5; }));
  assert.throws(broken((d) => { d.messageSeconds = "5"; }));
  assert.throws(broken((d) => { d.sceneLights.sunColor = "ffd7a0"; }));
  assert.throws(broken((d) => { d.sceneLights.sunColor = "#FFD7A0"; }));
  assert.throws(broken((d) => { d.sceneLights.sunPosition = [1, 2]; }));
  assert.throws(broken((d) => { d.sceneLights.sunPosition = [1, 2, 1000]; }));
  assert.throws(broken((d) => { d.sceneLights.rimDistance = 0; }));
});

test("the gate counts 0 in browser-session.js (one marked WebSocket close-code line) and the baseline entry is gone", () => {
  const r = countNumberLiterals(text("../src/engine/browser-session.js"));
  assert.equal(r.count, 0);
  assert.equal(r.reasons.length, 1, "1001 on one marked line (1000 is an allowed unit)");
  assert(r.reasons.every((line) => /WebSocket normal-close codes/.test(line)));
  assert(!("engine/browser-session.js" in JSON.parse(text("../../scripts/as-data-baseline.json")).numberLiterals));
});
