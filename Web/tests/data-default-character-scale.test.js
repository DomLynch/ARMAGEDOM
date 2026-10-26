import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAreaRuntime } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/as-data-gate.mjs";

// presence-session.js (World): the hero scale used for the other players when a layout names none moved from the literal 1.265 to
// data/areaRuntime.json `view.defaultCharacterScale`. Client-side drawing only: the server never reads it (it sends no scale), so there
// is one reader. The 0.95 in the same file is the 95th percentile of the interval log, a statistic, marked `// tuning-ok`.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const rawText = read("../src/data/areaRuntime.json");

test("the default is the old literal and is frozen data", () => {
  assert.equal(GAME_DATA.areaRuntime.view.defaultCharacterScale, 1.265);
  assert(Object.isFrozen(GAME_DATA.areaRuntime.view));
});

test("presence-session.js reads the row and holds no counted number", () => {
  const source = read("../src/engine/presence-session.js");
  assert(source.includes("GAME_DATA.areaRuntime.view.defaultCharacterScale"));
  assert(!source.includes("1.265"));
  const baseline = JSON.parse(read("../../scripts/as-data-baseline.json"));
  // The tightened gate (2, 3, 4, 10, 0.5 and named constants count) still finds numbers here: the baseline entry is the ratchet.
  assert.equal(
    countNumberLiterals(source, "Web/src/engine/presence-session.js").count,
    baseline.numberLiterals["engine/presence-session.js"] ?? 0,
  );
});

test("the loader rejects a missing or bad default", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(rawText);
    mutate(d);
    validateAreaRuntime(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.view.defaultCharacterScale;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.defaultCharacterScale = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.view.defaultCharacterScale = "big";
    }),
  );
});
