import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finisherGoreTrace } from "./helpers/finisher-gore-trace.js";

// The wound placement numbers moved from finisher-gore.js into data/finisherData.json gore.placement; the samples kept per zone,
// the chosen receiver vertex, the anchors and the ray count must match the pre-data trace (tests/fixtures/finisher-gore-pre-data.json).
test("finisher gore sampling, receiver choice and anchors match the pre-data trace", () => {
  const before = JSON.parse(readFileSync(new URL("./fixtures/finisher-gore-pre-data.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(finisherGoreTrace())), before);
});
