import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { worldViewProbe } from "./helpers/world-view-probe.mjs";
import { GAME_DATA, validateAreaRuntime } from "../src/engine/game-data.js";

// Data batch 13 (World): the camera framing, clip planes, texture budget default and exit hint range of world.js moved into
// data/areaRuntime.json `view`. tests/fixtures/world-view-pre-data.json is what tests/helpers/world-view-probe.mjs printed on
// origin/main (7050c4c): the crop matrix and camera centre for 240 states (two areas, followPlayerSize on and off, five screen sizes,
// three positions, four frame times).
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/world-view-pre-data.json", import.meta.url)));
const rawText = fs.readFileSync(new URL("../src/data/areaRuntime.json", import.meta.url), "utf8");

test("the view section is pinned", () => {
  const section = JSON.stringify(JSON.parse(rawText).view);
  assert.equal(crypto.createHash("sha256").update(section).digest("hex"), "ea8e54ff5f34bbdaf78e967f6efcd668fd149080bd8938772698853ae1953e7d");
});

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.areaRuntime.view, {
    textureBudgetMiB: 48,
    textureBudgetMinMiB: 16,
    cameraNear: 0.1,
    cameraFar: 300,
    portraitActorPixels: 63,
    landscapeZoomBoost: 1.1,
    portraitZoomBoost: 1.05,
    portraitLift: 0.02,
    landscapeLift: 0.1,
    maxFollowSeconds: 0.1,
    exitHintMeters: 6,
  });
  assert(Object.isFrozen(GAME_DATA.areaRuntime.view));
});

test("the camera frames every state exactly as before the move", async () => {
  const now = await worldViewProbe(new URL("../src/world.js", import.meta.url).href);
  assert.equal(now.length, old.length);
  assert(new Set(old.map((r) => r.crop.join())).size > 50, "the probe reaches many distinct framings");
  now.forEach((row, i) => assert.deepEqual(row, old[i], `state ${i}`));
});

test("the loader rejects a broken view section", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(rawText);
    mutate(d);
    validateAreaRuntime(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.view;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.textureBudgetMiB = 48.5;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.textureBudgetMinMiB = 64;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.cameraNear = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.cameraFar = d.view.cameraNear;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.landscapeZoomBoost = -1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.portraitLift = "high";
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.view.exitHintMeters;
    }),
  );
});
