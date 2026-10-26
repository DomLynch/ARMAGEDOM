import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { railgunCoilsTrace } from "./helpers/railgun-coils-trace.js";

// The coils' ring, material, arc and glow numbers moved from railgun-coils.js into data/railgunCoils.json; the built geometry,
// placement, material and charge animation must match the pre-data trace (tests/fixtures/railgun-coils-pre-data.json).
test("railgun coils geometry, material and charge glow match the pre-data trace", () => {
  const before = JSON.parse(readFileSync(new URL("./fixtures/railgun-coils-pre-data.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(railgunCoilsTrace())), before);
});
