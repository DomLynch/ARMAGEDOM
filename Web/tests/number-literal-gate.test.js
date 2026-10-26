import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { countNumberLiterals, isNumberExempt, numberLiteralProblems } from "../../scripts/as-data-gate.mjs";

const count = (src) => countNumberLiterals(src).count;
const values = (src) => countNumberLiterals(src).items.map((i) => i.value);

test("tuning values count, math constants and unit scalers do not", () => {
  assert.deepEqual(values("const f = (t) => t + 0.22; const g = (t) => t * 0.25 + 1.05;"), [0.22, 0.25, 1.05]);
  assert.deepEqual(values("x = -6; y = -1; z = 2 * a + 1 / 60 + 0.5 + 90 + 180 + 360 + 255 + 1e-9;"), [-6]);
  assert.equal(count("a = 0; b = 1; c = 2; d = 3; e = 4; f = 10; g = 100; h = 1000;"), 0);
  assert.equal(count("const t = Math.PI * 2;"), 0);
});

test("array indexes, length and version comparisons, version properties are not tuning", () => {
  assert.equal(count("a[7]; b[12] = 1; c[5].d;"), 0);
  assert.equal(count("if (list.length > 16) fail(); if (16 < list.length) fail();"), 0);
  assert.equal(count("if (data.version !== 15) fail(); if (saveVersion === 6) go();"), 0);
  assert.equal(count("const row = { version: 14, schema_version: 3 };"), 0);
  assert.equal(count("const row = { version: 14, hp: 55 };"), 1);
});

test("a named top-level constant is exempt, the same number inline is not", () => {
  assert.equal(count("const DODGE_SECONDS = 0.22;"), 0);
  assert.equal(count("export const MAX_HP = 120;"), 0);
  assert.equal(count("const dodge = 0.22;"), 1);
  assert.equal(count("function f() { const DODGE_SECONDS = 0.22; return DODGE_SECONDS; }"), 1);
  assert.equal(count("const DODGE_SECONDS = -0.22;"), 0);
});

test("validators are exempt however they are declared; other functions are not", () => {
  assert.equal(count("function validateKnife(k) { if (k.hp > 120 || k.range < 0.05) fail(); }"), 0);
  assert.equal(count("const checkRow = (r) => r.damage > 40;"), 0);
  assert.equal(count("export const assertShape = function (x) { return x.n < 33; };"), 0);
  assert.equal(count("const o = { ensureLimits(x) { return x < 17; } };"), 0);
  assert.equal(
    count("function validateKnife(k) { return () => k.hp > 120; }"),
    0,
    "nested closures inherit the exemption",
  );
  assert.equal(count("function swing(k) { return k.hp > 120; }"), 1);
  assert.equal(count("function isValid(k) { return k.hp > 120; }"), 1);
});

test("a tuning-ok comment exempts its line and is reported with its reason", () => {
  const r = countNumberLiterals("const h = (x) => x * 2654435761; // tuning-ok: hash multiplier\nconst d = 0.22;\n");
  assert.equal(r.count, 1);
  assert.deepEqual(r.reasons, ["1: hash multiplier"]);
  assert.equal(r.items[0].line, 2);
  assert.equal(count("a = 5; // tuning-ok:\n"), 1, "a reason is required");
});

test("strings, comments and regexes never count", () => {
  assert.equal(
    count('const s = "radius 0.65"; // 0.4 here\n/* 12.5 */ const r = /^[a-z]{0,95}$/; const t = `${x}0.7`;'),
    0,
  );
});

test("view and art files are exempt by name, gameplay files are not", () => {
  for (const key of [
    "engine/bone-saw-view.js",
    "actors.js",
    "effects.js",
    "low-hover-drone.js",
    "engine/commander/x-view.js",
  ])
    assert.equal(isNumberExempt(key), true, key);
  for (const key of ["combat.js", "engine/boss-ranged.js", "donor/knife.js", "viewer.js", "engine/review.js"])
    assert.equal(isNumberExempt(key), false, key);
});

test("the ratchet fails an increase, a missing lowering and a new file, and passes an exact match", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "numgate-"));
  try {
    const write = (name, src) => {
      const p = path.join(dir, name);
      fs.writeFileSync(p, src);
      return p;
    };
    const a = write("a.js", "const x = 0.22; const y = 0.25;"),
      b = write("b.js", "const x = 0.22;"),
      c = write("c.js", "const x = 0.22;"),
      view = write("pose-view.js", "const x = 0.22;");
    const baseline = { numberLiterals: { "a.js": 2, "b.js": 2 } };
    const problems = numberLiteralProblems([a, b, c, view], baseline, dir);
    assert.equal(problems.length, 2);
    assert(problems.some((p) => p.includes("b.js") && p.includes("Lower it to 1")));
    assert(problems.some((p) => p.includes("c.js") && p.includes("limit 0")));
    assert.deepEqual(numberLiteralProblems([a], baseline, dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the real tree matches the seeded baseline file by file", () => {
  const root = new URL("../src/", import.meta.url).pathname;
  const walk = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : [],
      );
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.deepEqual(numberLiteralProblems(walk(root), baseline, root), []);
  assert(Object.keys(baseline.numberLiterals).length > 50);
  assert(Object.values(baseline.numberLiterals).every((n) => Number.isInteger(n) && n > 0));
});
