import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localWoundTrace } from "./helpers/local-wound-trace.js";

// The wound mesh numbers moved from local-wound.js into finisher-data.json; the buffers, colours and placed
// matrices must match what the code produced before (tests/fixtures/local-wound-pre-data.json).
test("local wound geometry, colours and placement match the pre-data trace", () => {
  const before = JSON.parse(readFileSync(new URL("./fixtures/local-wound-pre-data.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(localWoundTrace())), before);
});
