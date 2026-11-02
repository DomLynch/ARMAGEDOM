import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finisherArmTrace } from "./helpers/finisher-arm-trace.js";

// The arm toss numbers moved from finisher-arm.js into finisher-data.json `armSever`; launch, bounce, spin, wall stop
// and lifetime expiry must match the pre-data trace (tests/fixtures/finisher-arm-pre-data.json).
test("detached arm toss physics match the pre-data trace", () => {
  const before = JSON.parse(readFileSync(new URL("./fixtures/finisher-arm-pre-data.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(finisherArmTrace())), before);
});
