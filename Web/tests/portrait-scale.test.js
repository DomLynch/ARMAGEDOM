import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGeometry } from "../src/world-geometry.js";
import { LondonWorld } from "../src/world.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateAreaGeometry } from "../src/engine/area-content.js";
import { createAreaRegistry } from "../src/area-registry.js";

// A layout may carry an optional `portraitScale`: a factor on the portrait actor size (areaRuntime view.portraitActorPixels), so the
// scene and the player are drawn smaller in a portrait view. Only Lambeth names one (the owner asked it to match Westminster's scale);
// every other layout leaves it out and keeps the global default.
const worldDir = new URL("../public/world/", import.meta.url);
const areas = fs.readdirSync(worldDir).filter((d) => fs.existsSync(new URL(`${d}/layout.json`, worldDir)));
const layoutOf = (area) => JSON.parse(fs.readFileSync(new URL(`${area}/layout.json`, worldDir), "utf8"));
const LAMBETH_SCALE = 0.8;

test("only lambeth names a portraitScale", () => {
  assert(areas.includes("lambeth") && areas.length > 1);
  for (const area of areas) {
    if (area === "lambeth") assert.equal(layoutOf(area).portraitScale, LAMBETH_SCALE);
    else assert.equal("portraitScale" in layoutOf(area), false, area);
  }
  assert.equal(GAME_DATA.areaRuntime.view.defaultPortraitScale, 1);
});

function portraitZoom(layout, at) {
  const geometry = createGeometry(layout);
  const crop = { elements: new Array(16).fill(0), identity() {} };
  const self = {
    layout,
    geometry,
    camera: { projectionMatrix: { multiplyMatrices() {} }, projectionMatrixInverse: { copy: () => ({ invert() {} }) } },
    crop,
    calibrated: {},
    viewZoomMultiplier: 1,
    center: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 },
    routeGuidance: null,
  };
  LondonWorld.prototype.update.call(self, geometry.ground(at), 0.016, 375, 812, true);
  return crop.elements[5]; // the vertical zoom
}

test("the override shrinks the portrait zoom for lambeth only, where the painting still covers the screen", () => {
  const lambeth = layoutOf("lambeth");
  const plain = { ...lambeth };
  delete plain.portraitScale;
  const spot = { x: 0.5, y: 0.2 }; // high on the road: the zoom is well above its floor
  const scaled = portraitZoom(lambeth, spot),
    unscaled = portraitZoom(plain, spot);
  assert(Math.abs(scaled / unscaled - LAMBETH_SCALE) < 0.01);
  // an area without the key frames exactly as the default factor would
  const westminster = layoutOf("westminster");
  assert.equal(portraitZoom(westminster, spot), portraitZoom({ ...westminster, portraitScale: GAME_DATA.areaRuntime.view.defaultPortraitScale }, spot));
  // the zoom never drops below the covering floor (no border past the painting) anywhere on the road
  for (const y of [0.05, 0.3, 0.6, 0.95]) assert(portraitZoom(lambeth, { x: 0.6, y }) >= 1);
});

test("the loader rejects a bad portraitScale", () => {
  const registry = createAreaRegistry({ manifest: JSON.parse(fs.readFileSync(new URL("manifest.json", worldDir), "utf8")) });
  for (const bad of [0, -1, Infinity, "0.8"])
    assert.throws(() => validateAreaGeometry(registry, "lambeth", { ...layoutOf("lambeth"), portraitScale: bad }), /portraitScale/);
});
