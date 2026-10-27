import test from "node:test";
import assert from "node:assert/strict";
import { freshMarked, validMarked, copyMarked } from "../src/engine/marked.js";
import { make } from "./helpers/marked-fixture.js";
import { MARKED_SAVE_KEY } from "../src/engine/marked-core.js";

// The reader floor for golden weapons: a save that carries marked.golden must load here, whatever a later release put inside it.
test("a Marked block with golden loads and is copied intact", () => {
  const s = { ...freshMarked(), golden: ["pistol", "rifle"] };
  assert(validMarked(s));
  assert.deepEqual(copyMarked(s), s);
  assert.notEqual(copyMarked(s).golden, s.golden);
});

test("a Marked block without golden still loads and gains no field", () => {
  assert(validMarked(freshMarked()));
  assert.deepEqual(copyMarked(freshMarked()), freshMarked());
  assert(!("golden" in copyMarked(freshMarked())));
});

test("unknown golden entries and sub-keys do not reject the save", () => {
  for (const golden of [["laser-cannon", 7, null], { pistol: true, futureKey: { x: 1 } }, [], {}])
    assert(validMarked({ ...freshMarked(), golden }), JSON.stringify(golden));
});

test("golden of the wrong outer shape or absurd size is still refused, and other unknown keys stay closed", () => {
  for (const golden of ["pistol", 3, null, Array.from({ length: 65 }, () => "x")]) assert(!validMarked({ ...freshMarked(), golden }));
  assert(!validMarked({ ...freshMarked(), extra: 1 }));
  assert(!validMarked({ ...freshMarked(), bank: -1, golden: [] }));
});

test("a full save holding golden loads through the run codec and is kept on the next write", () => {
  const first = make({ earned: true });
  const saved = JSON.parse(first.records.get(MARKED_SAVE_KEY));
  saved.marked.golden = ["pistol", "future-gun"];
  const records = new Map(first.records);
  records.set(MARKED_SAVE_KEY, JSON.stringify(saved));
  const f = make({ records });
  assert(!f.g.runSaveInvalid);
  assert.deepEqual(f.g.marked.golden, ["pistol", "future-gun"]);
  assert(f.p.persistRun(f.g));
  assert.deepEqual(JSON.parse(f.records.get(MARKED_SAVE_KEY)).marked.golden, ["pistol", "future-gun"]);
});
