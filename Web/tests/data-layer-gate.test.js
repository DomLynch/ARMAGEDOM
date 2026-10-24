import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  constantTableProblems,
  countConstantTables,
  dataImportProblems,
  DATA_FOLDER,
  GAME_DATA_LOADER,
} from "../../scripts/as-data-gate.mjs";
import { buildGameData, GAME_DATA, validateDiagnostics } from "../src/engine/game-data.js";

function sample(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "data-layer-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    paths: Object.entries(files).map(([name, text]) => {
      const path = join(dir, name);
      writeFileSync(path, text);
      return path;
    }),
  };
}

test("counts top-level UPPER_CASE tables and Object.freeze tables (lower-case too), nothing else", () => {
  const text = [
    "const RULES = { a: 1 };",
    "export const LIST = [1, 2];",
    "export const FROZEN = Object.freeze(",
    "  { b: 2 },",
    ");",
    "const quiet = Object.freeze({ c: 3 });",
    "const lower = { d: 4 };",
    "const LIMIT = 5;",
    "  const NESTED = { e: 5 };",
    "function f() { const INNER = { g: 6 }; }",
  ].join("\n");
  assert.equal(countConstantTables(text), 4);
});

test("a new table in engine code fails and points at the data folder; legacy counts are tolerated; a lower count must be recorded", (t) => {
  const grown = sample(t, { "mod.js": "const A = { x: 1 };\nconst B = [1];\n" }),
    legacy = { constantTables: { "mod.js": 2 } };
  assert.deepEqual(constantTableProblems(grown.paths, legacy, grown.dir), []);
  const [fresh] = constantTableProblems(grown.paths, {}, grown.dir);
  assert.match(fresh, /limit 0/);
  assert.ok(fresh.includes(DATA_FOLDER) && fresh.includes(GAME_DATA_LOADER));
  assert.match(constantTableProblems(grown.paths, { constantTables: { "mod.js": 1 } }, grown.dir)[0], /limit 1/);
  assert.match(constantTableProblems(grown.paths, { constantTables: { "mod.js": 3 } }, grown.dir)[0], /Lower it to 2/);
});

test("only engine/game-data.js may import a data/*.json file, in any import form", (t) => {
  const { dir, paths } = sample(t, {
    "a.js": 'import x from "../data/weapons.json" with { type: "json" };\n',
    "b.js": 'const x = await import("./data/creatures.json");\n',
    "c.js": 'import y from "./finisher-data.json" with { type: "json" };\n',
    "d.js": "export const ok = 1;\n",
  });
  const problems = dataImportProblems(paths, dir);
  assert.equal(problems.length, 2, "a.js and b.js, not c.js (not under data/) or d.js");
  assert.ok(problems.every((p) => p.includes(GAME_DATA_LOADER)));
});

test("the loader itself is allowed to import data files", (t) => {
  const { dir } = sample(t, {});
  mkdirSync(join(dir, "engine"));
  const loader = join(dir, "engine", "game-data.js");
  writeFileSync(loader, 'import d from "../data/diagnostics.json" with { type: "json" };\n');
  assert.deepEqual(dataImportProblems([loader], dir), []);
});

test("game data: the real file loads frozen with its schema_version; missing or unsupported versions and unknown fields are refused", () => {
  assert.equal(GAME_DATA.diagnostics.statsFramesPerLine, 120);
  assert.ok(Object.isFrozen(GAME_DATA) && Object.isFrozen(GAME_DATA.diagnostics));
  const ok = { schema_version: 1, statsFramesPerLine: 5 },
    validate = () => {};
  assert.equal(buildGameData({ a: [ok, validate] }).a.statsFramesPerLine, 5);
  assert.throws(() => buildGameData({ a: [{ statsFramesPerLine: 5 }, validate] }), /schema_version/);
  assert.throws(() => buildGameData({ a: [{ ...ok, schema_version: 2 }, validate] }), /schema_version/);
  assert.throws(() => buildGameData({ diagnostics: [{ ...ok, extra: 1 }, validateDiagnostics] }));
  assert.throws(() => buildGameData({ diagnostics: [{ schema_version: 1, statsFramesPerLine: 0 }, validateDiagnostics] }));
  assert.throws(() => buildGameData({ diagnostics: [{ schema_version: 1 }, validateDiagnostics] }));
});
