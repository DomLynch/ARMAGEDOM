// Drives LondonWorld.prototype.update on a stub with the real Westminster geometry and records the crop matrix and camera centre for
// portrait, landscape and square screens, several player positions and frame times, with and without followPlayerSize.
// tests/data-world-view.test.js compares it with tests/fixtures/world-view-pre-data.json, which this same file wrote on origin/main
// (7050c4c) before the camera numbers moved into data/areaRuntime.json `view`.
// Run it as `node world-view-probe.mjs <world.js module URL>`.
import fs from "node:fs";
import { createGeometry } from "../../src/world-geometry.js";

const layoutOf = (area) =>
  JSON.parse(fs.readFileSync(new URL(`../../public/world/${area}/layout.json`, import.meta.url), "utf8"));

export async function worldViewProbe(moduleUrl) {
  const { LondonWorld } = await import(moduleUrl);
  const out = [];
  for (const area of ["westminster", "east"]) {
    for (const follow of [false, true]) {
      const layout = { ...layoutOf(area), followPlayerSize: follow };
      const geometry = createGeometry(layout);
      const sizes = [
        [390, 844],
        [844, 390],
        [1280, 720],
        [1024, 1024],
        [320, 480],
      ];
      for (const [width, height] of sizes) {
        const crop = { elements: new Array(16).fill(0), identity() {} };
        const self = {
          layout,
          geometry,
          camera: {
            projectionMatrix: { multiplyMatrices() {} },
            projectionMatrixInverse: { copy: () => ({ invert() {} }) },
          },
          crop,
          calibrated: {},
          viewZoomMultiplier: 1,
          center: { x: 0.5, y: 0.5 },
          velocity: { x: 0, y: 0 },
          routeGuidance: null,
        };
        const spots = [
          geometry.ground({ x: 0.52, y: 0.78 }),
          geometry.ground({ x: 0.2, y: 0.6 }),
          geometry.ground({ x: 0.85, y: 0.5 }),
        ];
        spots.forEach((spot, i) => {
          for (const [dt, immediate] of [
            [0.016, i === 0],
            [0.016, false],
            [0.5, false],
            [0, false],
          ]) {
            LondonWorld.prototype.update.call(self, spot, dt, width, height, immediate);
            out.push({
              area,
              follow,
              width,
              height,
              i,
              dt,
              immediate,
              crop: Array.from(self.crop.elements),
              center: { ...self.center },
              velocity: { ...self.velocity },
            });
          }
        });
      }
    }
  }
  return out;
}

if (process.argv[2]) process.stdout.write(JSON.stringify(await worldViewProbe(process.argv[2])));
