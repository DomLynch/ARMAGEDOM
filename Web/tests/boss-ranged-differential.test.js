import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bossRangedTrace } from "./helpers/boss-ranged-trace.js";

// The shotgun fan, warning arcs, rocket ground/bisection and shot stagger/stamina moved from boss-ranged.js into
// boss-ranged-data.json; events, hits and rocket flight must match the pre-data trace (tests/fixtures/boss-ranged-trace-pre-data.json).
test("boss shotgun and rocket events, hits and flight match the pre-data trace", () => {
  const before = JSON.parse(
    readFileSync(new URL("./fixtures/boss-ranged-trace-pre-data.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(bossRangedTrace())), before);
});
