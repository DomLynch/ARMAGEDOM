import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { donorMotionTrace } from "./helpers/donor-motion-trace.js";

// The donor motion numbers moved from donor-motion.js into donor-motion-data.json; the swing curve, saw poses and
// locomotion clips/phases must match what the code produced before (tests/fixtures/donor-motion-pre-data.json).
test("donor swing curve, saw poses and locomotion match the pre-data trace", () => {
  const before = JSON.parse(readFileSync(new URL("./fixtures/donor-motion-pre-data.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(donorMotionTrace())), before);
});
