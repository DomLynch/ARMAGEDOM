import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constantTableProblems, dataDebt, keepInCodeProblems, tableNames } from "../../scripts/as-data-gate.mjs";

function sample(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "keep-in-code-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return { dir, paths: Object.keys(files).map((name) => join(dir, name)) };
}
const text = "export const WIRE = Object.freeze(['a']);\nconst DATA = { x: 1 };\nconst helper = Object.freeze({});\nconst plain = 3;\n";

test("tableNames reads the same tables the count does", () => {
  assert.deepEqual(tableNames(text), ["WIRE", "DATA", "helper"]);
});

test("kept tables are subtracted from the data debt; the rest is the debt", (t) => {
  const { dir, paths } = sample(t, { "mod.js": text, "other.js": "const B = [1];\n" });
  const baseline = {
    constantTables: { "mod.js": 3, "other.js": 1 },
    keepInCode: { "mod.js": [{ name: "WIRE", reason: "wire protocol" }] },
  };
  assert.deepEqual(constantTableProblems(paths, baseline, dir), []);
  const debt = dataDebt(paths, baseline, dir);
  assert.deepEqual(debt.files["mod.js"], { tables: 3, kept: 1, debt: 2 });
  assert.deepEqual([debt.tables, debt.kept, debt.debt], [4, 1, 3]);
});

test("a kept name that no longer exists, a duplicate, a missing reason or an unknown file fails", (t) => {
  const { dir, paths } = sample(t, { "mod.js": text });
  const problems = (rows, file = "mod.js") => keepInCodeProblems(paths, { keepInCode: { [file]: rows } }, dir);
  assert.deepEqual(problems([{ name: "WIRE", reason: "r" }]), []);
  assert.match(problems([{ name: "GONE", reason: "r" }])[0], /GONE, which is no longer a top-level constant table/);
  assert.match(problems([{ name: "plain", reason: "r" }])[0], /no longer a top-level constant table/, "a non-table const is not a table");
  assert.match(problems([{ name: "WIRE", reason: "r" }, { name: "WIRE", reason: "r" }])[0], /twice/);
  assert.match(problems([{ name: "WIRE" }])[0], /needs a name and a reason/);
  assert.match(problems([{ name: "WIRE", reason: "  " }])[0], /needs a name and a reason/);
  assert.match(problems([{ name: "WIRE", reason: "r" }], "missing.js")[0], /not in Web\/src/);
  assert.match(constantTableProblems(paths, { constantTables: { "mod.js": 3 }, keepInCode: { "mod.js": [{ name: "GONE", reason: "r" }] } }, dir)[0], /GONE/);
});

test("the real baseline passes: every kept name is still a table in its file", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : [],
    );
  const baseline = JSON.parse(readFileSync(join(root, "scripts/as-data-baseline.json"), "utf8"));
  assert.deepEqual(keepInCodeProblems(walk(join(root, "Web/src")), baseline, join(root, "Web/src")), []);
  assert.ok(Object.values(baseline.keepInCode).every((rows) => rows.every((r) => r.reason.length > 10)));
});
