import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { countNumberLiterals, isNumberExempt, numberLiteralProblems } from "../../scripts/as-data-gate.mjs";

const count = (src) => countNumberLiterals(src).count;
const values = (src) => countNumberLiterals(src).items.map((i) => i.value);

test("tuning values count, unit conversions do not", () => {
  assert.deepEqual(values("const f = (t) => t + 0.22; const g = (t) => t * 0.25 + 1.05;"), [0.22, 0.25, 1.05]);
  assert.deepEqual(values("x = -6; y = -1; z = 1 / 60 + 90 + 180 + 360 + 255 + 1e-9;"), [-6]);
  assert.equal(count("a = 0; b = 1; c = -1; d = 100; e = 1000; f = 60;"), 0);
  assert.deepEqual(
    values("c = 2; d = 3; e = 4; f = 10; g = 0.5;"),
    [2, 3, 4, 10, 0.5],
    "2, 3, 4, 10 and 0.5 are values",
  );
  assert.equal(count("const t = Math.PI * 2; // tuning-ok: full turn"), 0);
  assert.equal(count("const t = Math.PI * 2;"), 1);
});

test("array indexes, length and version comparisons, version properties are not tuning", () => {
  assert.equal(count("a[7]; b[12] = 1; c[5].d;"), 0);
  assert.equal(count("if (list.length > 16) fail(); if (16 < list.length) fail();"), 0);
  assert.equal(count("if (data.version !== 15) fail(); if (saveVersion === 6) go();"), 0);
  assert.equal(count("const row = { version: 14, schema_version: 3 };"), 0);
  assert.equal(count("const row = { version: 14, hp: 55 };"), 1);
});

test("a named top-level constant counts like any other number unless its line says tuning-ok", () => {
  assert.equal(count("const DODGE_SECONDS = 0.22;"), 1);
  assert.equal(count("export const MAX_HP = 120;"), 1);
  assert.equal(count("const dodge = 0.22;"), 1);
  assert.equal(count("const DODGE_SECONDS = -0.22;"), 1);
  assert.equal(count("const EPS = 1e-8;"), 0, "an epsilon below 1e-6 never counts");
  assert.equal(count("const KEY_PRECISION = 1e6; // tuning-ok: fixed-point scale of the wire keys"), 0);
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

test("only pure model geometry files are exempt, listed with a reason in keep-in-code.json", () => {
  for (const key of [
    "engine/bone-saw-view.js",
    "supplies-view.js",
    "vest-view.js",
    "low-hover-drone.js",
    "feral-dog.js",
  ])
    assert.equal(isNumberExempt(key), true, key);
  for (const key of [
    "combat.js",
    "actors.js",
    "effects.js",
    "finisher-presentation.js",
    "finisher-opened.js",
    "engine/boss-view.js",
    "engine/flame-view.js",
    "engine/boss-equipment-view.js",
    "donor/knife.js",
    "viewer.js",
  ])
    assert.equal(isNumberExempt(key), false, key);
  const keep = JSON.parse(fs.readFileSync(new URL("../src/data/keep-in-code.json", import.meta.url)));
  for (const entry of [...keep.numberExemptFiles, ...keep.jsonImportAllowed])
    assert.ok(entry.pattern && entry.reason.length > 20, "every exemption has a reason: " + entry.pattern);
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
      view = write("vest-view.js", "const x = 0.22;");
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
  // A smoke check that the baseline was not emptied by accident. The burn-down removes entries as files reach zero, so it only requires one.
  assert(Object.keys(baseline.numberLiterals).length > 0);
  assert(Object.values(baseline.numberLiterals).every((n) => Number.isInteger(n) && n > 0));
});
