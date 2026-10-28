import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateSaveClient } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/save-client.js 10 to 0. Nine counted numbers were HTTP status codes (429, 500, 502, 504: wire codes, marked `// tuning-ok`);
// the 250 ms floor on the retry wait moved to data/saveClient.json `retryFloorMs` (value unchanged: 250), and the 60000-byte cap on a
// keepalive body to `keepaliveMaxBytes` (value unchanged: 60000).
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/saveClient.json", import.meta.url))));

test("the retry floor is data and still 250 ms; every older key is unchanged", () => {
  assert.equal(GAME_DATA.saveClient.retryFloorMs, 250);
  assert.equal(GAME_DATA.saveClient.keepaliveMaxBytes, 60000);
  const { retryFloorMs, keepaliveMaxBytes, ...rest } = GAME_DATA.saveClient;
  assert.deepEqual(rest, {
    schema_version: 1, minSaveIntervalMs: 5000, staleSeqRetries: 2, characterName: "Survivor", bootSyncWaitMs: 3000,
    bucketBurst: 6, bucketRefillMs: 5000, bucketReserve: 2,
    // The claim_pickup bucket and retry rule for cash claims (writer: server/data/rate-limits.json clientOps.claim_pickup).
    claimBurst: 4, claimRefillMs: 5000, claimRetries: 6, claimSecondMs: 1000,
  });
});

test("the loader refuses a missing, tiny, huge or fractional retry floor", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateSaveClient(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.retryFloorMs; }));
  assert.throws(broken((d) => { d.retryFloorMs = 10; }));
  assert.throws(broken((d) => { d.retryFloorMs = 5001; }));
  assert.throws(broken((d) => { d.retryFloorMs = 250.5; }));
  assert.throws(broken((d) => { delete d.keepaliveMaxBytes; }));
  assert.throws(broken((d) => { d.keepaliveMaxBytes = 70000; }));
});

test("the gate counts 0 in save-client.js: the status-code lines are marked, nothing else is left, the baseline entry is gone", () => {
  const r = countNumberLiterals(fs.readFileSync(new URL("../src/engine/save-client.js", import.meta.url), "utf8"));
  assert.equal(r.count, 0);
  assert.equal(r.reasons.length, 9, "nine HTTP status codes (429 x4, 500, 502 x2, 504 x2 across seven marked lines)");
  assert(r.reasons.every((line) => /HTTP status code/.test(line)));
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert(!("engine/save-client.js" in baseline.numberLiterals));
});
