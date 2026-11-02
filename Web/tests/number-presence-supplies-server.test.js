import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateBrowserSession } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// Backend phase 2b, batch C remainder (value-identical): presence-session 1, supplies 3, supply-ledger-v2 3, engine/server.js 1, all to 0.
// The server's per-call step clamp (0.1 s) moved to data/browserSession.json `maxStepSeconds`. The median's 0.5, the extended-supplies save
// version 2 and the three FNV-1a / 2^32 hash constants of the supply roll stay in code, marked (a statistic, a save version, a hash).
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(text("../src/data/browserSession.json")));

test("the step clamp is data and still 0.1 s; every older key is unchanged", () => {
  assert.equal(GAME_DATA.browserSession.maxStepSeconds, 0.1);
  assert.equal(GAME_DATA.browserSession.messageSeconds, 5);
  assert.equal(GAME_DATA.browserSession.actorVisualScale, 1.3225);
  assert(text("../src/engine/server.js").includes("Math.min(GAME_DATA.browserSession.maxStepSeconds, seconds)"));
});

test("the loader refuses a missing, tiny or huge step clamp", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateBrowserSession(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.maxStepSeconds; }));
  assert.throws(broken((d) => { d.maxStepSeconds = 0; }));
  assert.throws(broken((d) => { d.maxStepSeconds = 2; }));
  assert.throws(broken((d) => { d.maxStepSeconds = "0.1"; }));
});

test("the supply roll still hashes the same way: the marked FNV-1a constants are the old ones", () => {
  const src = text("../src/supply-ledger-v2.js");
  for (const use of ["let seed = 2166136261;", "Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0", "(seed / 4294967296) * sum"])
    assert(src.includes(use), use);
  const fnv = (s) => {
    let seed = 2166136261;
    for (const char of s) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    return seed;
  };
  assert.equal(fnv("a"), 3826002220, "the FNV-1a 32-bit hash of a single 'a'");
});

test("the gate counts 0 in the four files, their exemptions are marked, and the baseline entries are gone", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json")).numberLiterals;
  for (const file of ["engine/presence-session.js", "supplies.js", "supply-ledger-v2.js", "engine/server.js"]) {
    assert.equal(countNumberLiterals(text(`../src/${file}`)).count, 0, file);
    assert(!(file in baseline), file);
  }
  const reasons = countNumberLiterals(text("../src/supplies.js")).reasons;
  assert(reasons.every((line) => /extended supplies save format version/.test(line)));
  assert.equal(countNumberLiterals(text("../src/supply-ledger-v2.js")).reasons.length, 3);
  assert.equal(countNumberLiterals(text("../src/engine/presence-session.js")).reasons.filter((l) => /median/.test(l)).length, 1);
});
