import test from "node:test";
import assert from "node:assert/strict";
import { freshMarked, validMarked, copyMarked } from "../src/engine/marked.js";
import { make } from "./helpers/marked-fixture.js";
import { MARKED_SAVE_KEY } from "../src/engine/marked-core.js";

// The reader floor for golden weapons: a save that carries marked.golden must load here, whatever a later release put inside it.
const withGolden = (golden) => {
  const first = make({ earned: true }),
    saved = JSON.parse(first.records.get(MARKED_SAVE_KEY));
  saved.marked.golden = golden;
  const records = new Map(first.records);
  records.set(MARKED_SAVE_KEY, JSON.stringify(saved));
  return make({ records });
};

test("(1) a save with golden loads, and a save without golden loads unchanged", () => {
  const s = { ...freshMarked(), golden: ["pistol", "rifle"] };
  assert(validMarked(s));
  assert(validMarked(freshMarked()));
  assert.deepEqual(copyMarked(freshMarked()), freshMarked());
  assert(!("golden" in copyMarked(freshMarked())));
  const f = withGolden(["pistol"]);
  assert(!f.g.runSaveInvalid);
  const plain = make({ earned: true });
  assert(!plain.g.runSaveInvalid);
  assert(!("golden" in plain.g.marked));
});

test("(2) the reader keeps golden: copyMarked keeps it and the next write stores it", () => {
  const s = { ...freshMarked(), golden: ["pistol", "rifle"] },
    copy = copyMarked(s);
  assert.deepEqual(copy, s);
  assert.notEqual(copy.golden, s.golden);
  const f = withGolden(["pistol", "shotgun"]);
  assert.deepEqual(f.g.marked.golden, ["pistol", "shotgun"]);
  assert(f.p.persistRun(f.g));
  assert.deepEqual(JSON.parse(f.records.get(MARKED_SAVE_KEY)).marked.golden, ["pistol", "shotgun"]);
});

test("(3) junk, wrong types and duplicates never reject the save and are never written back", () => {
  for (const golden of [["pistol", "pistol", 7, null, { a: 1 }, "BAD KEY", "rifle"], { pistol: true }, "pistol", 3, null]) {
    assert(validMarked({ ...freshMarked(), golden }), JSON.stringify(golden));
  }
  assert.deepEqual(copyMarked({ ...freshMarked(), golden: ["pistol", "pistol", 7, null, "BAD KEY", "rifle"] }).golden, ["pistol", "rifle"]);
  for (const junk of [{ pistol: true }, "pistol", 3, null, [7, null]]) assert(!("golden" in copyMarked({ ...freshMarked(), golden: junk })));
  const f = withGolden(["pistol", "pistol", 42, "Not A Key", "rifle"]);
  assert(!f.g.runSaveInvalid);
  assert.deepEqual(f.g.marked.golden, ["pistol", "rifle"]);
  assert(f.p.persistRun(f.g));
  assert.deepEqual(JSON.parse(f.records.get(MARKED_SAVE_KEY)).marked.golden, ["pistol", "rifle"]);
  const junkOnly = withGolden({ a: 1 });
  assert(!junkOnly.g.runSaveInvalid);
  assert(junkOnly.p.persistRun(junkOnly.g));
  assert(!("golden" in JSON.parse(junkOnly.records.get(MARKED_SAVE_KEY)).marked));
});

test("other unknown keys and bad money stay refused", () => {
  assert(!validMarked({ ...freshMarked(), extra: 1 }));
  assert(!validMarked({ ...freshMarked(), bank: -1, golden: [] }));
});
