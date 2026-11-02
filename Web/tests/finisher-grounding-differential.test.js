import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finisherGroundingTrace } from "./helpers/finisher-grounding-trace.js";

// The grounding budgets and floor tolerance moved from finisher-grounding.js into data/finisherData.json `grounding`; the lift
// envelope, table statistics and cache behaviour must match the pre-data trace (tests/fixtures/finisher-grounding-pre-data.json).
test("victim grounding tables match the pre-data trace on the real Hollow death clip", async () => {
  const before = JSON.parse(
    readFileSync(new URL("./fixtures/finisher-grounding-pre-data.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(await finisherGroundingTrace())), before);
});
