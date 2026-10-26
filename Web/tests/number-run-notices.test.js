import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateRunNotices } from "../src/engine/game-data.js";
import { PISTOL_RULES } from "../src/pistol.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/run-core.js 14 to 0 and engine/run-state.js 13 to 0 (value-identical): the run message durations moved to data/runNotices.json
// (5 s storage unavailable, 5 s reset prompt, 8 s boss drop, 3 s supply pickup, 4 s supply notice repeat, 2 s supply refusal, 4 s vest),
// the pistol save bounds 6 and 12 now read PISTOL_RULES, and the save format versions are marked tuning-ok. The old values are pinned
// here from origin/main (3436bc00) and the sources are checked to read them.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(text("../src/data/runNotices.json")));

test("the data holds exactly the durations the run files used to hold in code", () => {
  assert.deepEqual(GAME_DATA.runNotices, {
    schema_version: 1, storageUnavailableSeconds: 5, resetPromptSeconds: 5, bossDropSeconds: 8, supplyPickupSeconds: 3,
    supplyNoticeRepeatSeconds: 4, supplyRefusalSeconds: 2, vestEquippedSeconds: 4,
  });
  assert(Object.isFrozen(GAME_DATA.runNotices));
});

test("the pistol save bounds are the pistol's own capacity and reserve (6 and 12 before)", () => {
  const why = "restorePistol rejects saves above these; a lower cap needs a restore clamp or a save migration first";
  assert.equal(PISTOL_RULES.capacity, 6, why);
  assert.equal(PISTOL_RULES.reserve, 12, why);
});

test("the run files read every duration from the data row", () => {
  const core = text("../src/engine/run-core.js"), state = text("../src/engine/run-state.js");
  for (const use of [
    "g.time + NOTICES.storageUnavailableSeconds", "g.time + NOTICES.bossDropSeconds", "g.messageUntil = NOTICES.resetPromptSeconds",
    "g.messageUntil = NOTICES.storageUnavailableSeconds", "g.time + NOTICES.supplyPickupSeconds",
    "g.time + NOTICES.supplyNoticeRepeatSeconds", "g.time + NOTICES.supplyRefusalSeconds", "g.time + NOTICES.vestEquippedSeconds",
  ])
    assert(core.includes(use), use);
  for (const use of [
    "g.time + NOTICES.supplyPickupSeconds", "g.time + NOTICES.supplyNoticeRepeatSeconds", "g.time + NOTICES.supplyRefusalSeconds",
    "g.time + NOTICES.vestEquippedSeconds", "saved.magazine > PISTOL_RULES.capacity", "saved.reserve > PISTOL_RULES.reserve",
  ])
    assert(state.includes(use), use);
});

test("the loader refuses missing, extra and out-of-range durations", () => {
  const broken = (mutate) => () => { const d = raw(); mutate(d); validateRunNotices(d); };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.bossDropSeconds; }));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.vestEquippedSeconds = 0; }));
  assert.throws(broken((d) => { d.supplyPickupSeconds = 31; }));
  assert.throws(broken((d) => { d.supplyRefusalSeconds = "2"; }));
});

test("the gate counts 0 in both files and the baseline entries are gone", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json"));
  for (const file of ["engine/run-core.js", "engine/run-state.js"]) {
    assert.equal(countNumberLiterals(text(`../src/${file}`)).count, 0, file);
    assert(!(file in baseline.numberLiterals), file);
  }
});
