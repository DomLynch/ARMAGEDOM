import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { TRAVEL_MESSAGE_DELAY_MS } from "../src/engine/areas.js";
import { GAME_DATA, validateAreaRuntime } from "../src/engine/game-data.js";

// Data batch 12 (World): the travel timings of engine/areas.js moved into data/areaRuntime.json `travel`. The literals below are what
// the code held on origin/main (64aae21): message delay 300 ms, failure message 5 s, preparation deadline 16 ms, idle timeout 16 ms,
// urgent slice 12 ms, ambient slice 4 ms, "idle enough" 4 ms, hold 250 ms.
const rawText = fs.readFileSync(new URL("../src/data/areaRuntime.json", import.meta.url), "utf8");

test("the travel section is pinned", () => {
  // The three message and wave-delay keys added later are pinned in the next test; this hash covers the original section.
  const { lockMessageSeconds, travelMessageSeconds, firstWaveDelay, ...original } = JSON.parse(rawText).travel;
  assert.deepEqual([lockMessageSeconds, travelMessageSeconds, firstWaveDelay], [4, 4, 2]);
  const section = JSON.stringify(original);
  assert.equal(
    crypto.createHash("sha256").update(section).digest("hex"),
    "3c25991b5ee7bf121dd8fc3e3e7a86e409dfc1d6dce2baed56e44d55afc87962",
  );
});

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.areaRuntime.travel, {
    messageDelayMs: 300,
    failureMessageSeconds: 5,
    lockMessageSeconds: 4,
    travelMessageSeconds: 4,
    firstWaveDelay: 2,
    preparation: {
      deadlineMs: 16,
      idleTimeoutMs: 16,
      urgentSliceMs: 12,
      ambientSliceMs: 4,
      idleEnoughMs: 4,
      holdMs: 250,
    },
  });
  assert.equal(TRAVEL_MESSAGE_DELAY_MS, 300);
  assert(Object.isFrozen(GAME_DATA.areaRuntime.travel) && Object.isFrozen(GAME_DATA.areaRuntime.travel.preparation));
});

test("the loader rejects a broken travel section", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(rawText);
    mutate(d);
    validateAreaRuntime(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.travel;
    }),
  );
  assert.throws(
    broken((d) => {
      d.travel.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.travel.messageDelayMs = -1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.travel.failureMessageSeconds = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.travel.preparation.urgentSliceMs = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.travel.preparation.holdMs = 2.5;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.travel.preparation.deadlineMs;
    }),
  );
  assert.throws(
    broken((d) => {
      d.travel.preparation.extra = 1;
    }),
  );
});
