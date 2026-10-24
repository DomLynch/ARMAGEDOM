import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constTableProblems, countConstTables, DATA_FOLDER } from "../../scripts/const-table-gate.mjs";

test("counts top-level UPPER_CASE object, array and Object.freeze tables, and nothing else", () => {
  const text = [
    "const RULES = { a: 1 };",
    "export const LIST = [1, 2];",
    "export const FROZEN = Object.freeze(",
    "  { b: 2 },",
    ");",
    "const lower = { c: 3 };",
    "const LIMIT = 5;",
    "  const NESTED = { d: 4 };",
    "function f() { const INNER = { e: 5 }; }",
  ].join("\n");
  assert.equal(countConstTables(text), 3);
});

function fixture(text) {
  const dir = mkdtempSync(join(tmpdir(), "const-table-"));
  writeFileSync(join(dir, "mod.js"), text);
  return { dir, path: join(dir, "mod.js") };
}

test("a legacy count is tolerated, growth fails with a pointer to the data folder, a lower count must be recorded", () => {
  const one = fixture("const A = { x: 1 };\n"),
    two = fixture("const A = { x: 1 };\nconst B = [1];\n"),
    none = fixture("const a = 1;\n");
  assert.deepEqual(constTableProblems([one.path], { constTables: { "mod.js": 1 } }, one.dir), []);
  const grown = constTableProblems([two.path], { constTables: { "mod.js": 1 } }, two.dir);
  assert.equal(grown.length, 1);
  assert.ok(grown[0].includes(DATA_FOLDER));
  const fresh = constTableProblems([two.path], {}, two.dir);
  assert.match(fresh[0], /limit 0/);
  const lowered = constTableProblems([none.path], { constTables: { "mod.js": 1 } }, none.dir);
  assert.match(lowered[0], /Lower it to 0/);
});
