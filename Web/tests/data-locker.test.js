import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LOCKER_RESOURCE_RULES } from "../src/engine/locker-state.js";
import { GAME_DATA, validateLocker } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch: the locker carry/stash caps moved from engine/locker-state.js into Web/src/data/locker.json (resourceCaps).
// tests/fixtures/locker-rules-pre-data.json is the old export, written from the old module on origin/main (6b7d9af).
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/locker-rules-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/locker.json", import.meta.url))));
const text = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("LOCKER_RESOURCE_RULES equals the old in-code value exactly (rows, key order, frozen)", () => {
  assert.deepEqual(LOCKER_RESOURCE_RULES, old);
  assert.deepEqual(Object.keys(LOCKER_RESOURCE_RULES), Object.keys(old));
  assert(Object.isFrozen(LOCKER_RESOURCE_RULES));
  for (const row of Object.values(LOCKER_RESOURCE_RULES)) assert(Object.isFrozen(row));
  assert(Object.isFrozen(GAME_DATA.locker.resourceCaps));
});

test("the loader refuses a missing, extra, non-positive, huge or fractional (non-fuel) cap", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateLocker(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.resourceCaps["rifle-reserve"]; }));
  assert.throws(broken((d) => { d.resourceCaps.extra = 1; }));
  assert.throws(broken((d) => { d.resourceCaps["pistol-reserve"] = 0; }));
  assert.throws(broken((d) => { d.resourceCaps["pistol-reserve"] = -1; }));
  assert.throws(broken((d) => { d.resourceCaps["pistol-reserve"] = 12.5; }));
  assert.throws(broken((d) => { d.resourceCaps["pistol-reserve"] = "12"; }));
  assert.throws(broken((d) => { d.resourceCaps["flame-fuel"] = 100001; }));
  assert.doesNotThrow(broken((d) => { d.resourceCaps["flame-fuel"] = 999.5; }));
});

test("the client caps never exceed the server's record caps (arma_record_caps stays the authority)", () => {
  const sql = text("../../supabase/migrations/20261024000007_arma_save_envelope.sql") + text("../../supabase/migrations/20261025000012_arma_record_fractional_hp.sql");
  const max = (pattern) => Number(new RegExp(`\\('${pattern.replace(/[.*]/g, "\\$&")}', 'num', 0, (\\d+)`).exec(sql)?.[1]);
  const general = max("locker.ammo.*"),
    fuel = max("locker.ammo.flame-fuel");
  assert.equal(general, 100000);
  assert.equal(fuel, 1000);
  for (const [key, row] of Object.entries(LOCKER_RESOURCE_RULES)) {
    const cap = key === "flame-fuel" ? fuel : general;
    assert(row.stashCap <= cap && row.carryCap <= cap, `${key} cap is above the server's`);
  }
  assert.equal(LOCKER_RESOURCE_RULES["flame-fuel"].stashCap, fuel);
});

test("the save-layer tables stay in code with a reason; locker-state keeps one table", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json"));
  for (const file of ["engine/progression-rules.js", "engine/flame-fuel-state.js", "engine/locker-state.js"]) {
    const rows = baseline.keepInCode[file];
    assert(rows.length > 0 && rows.every((r) => r.reason.startsWith("save layer row")), file);
    assert.equal(baseline.constantTables[file], rows.length, `${file}: every remaining table is kept in code`);
  }
  assert.equal(countConstantTables(text("../src/engine/locker-state.js")), 1);
  assert.equal(countConstantTables(text("../src/engine/progression-rules.js")), 3);
  assert.equal(countConstantTables(text("../src/engine/flame-fuel-state.js")), 1);
});
