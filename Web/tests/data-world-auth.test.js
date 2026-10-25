import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { WORLD_AUTH } from "../src/engine/world-config.js";
import { GAME_DATA, validateWorld } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch 8: WORLD_AUTH moved from engine/world-config.js into Web/src/data/world.json `auth`.
// tests/fixtures/world-auth-pre-data.json is the old export, written by importing the old module from origin/main.
// (engine/areas.js already holds no table after batch 7; the only table left in engine/world-config.js was WORLD_AUTH.)
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/world-auth-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/world.json", import.meta.url))));

test("WORLD_AUTH equals the old in-code value exactly (url, key, key order) and is the frozen data row", () => {
  assert.deepEqual(WORLD_AUTH, old);
  assert.deepEqual(Object.keys(WORLD_AUTH), Object.keys(old));
  assert.equal(WORLD_AUTH, GAME_DATA.world.auth);
  assert(Object.isFrozen(WORLD_AUTH));
});

test("the sign-in config only accepts a public project URL and a publishable key", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateWorld(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.auth; }));
  assert.throws(broken((d) => { d.auth.extra = 1; }));
  assert.throws(broken((d) => { d.auth.url = "http://fdbqnupceqytizxnoiua.supabase.co"; }));
  assert.throws(broken((d) => { d.auth.url = "https://evil.example.com"; }));
  assert.throws(broken((d) => { d.auth.anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy.anon-jwt"; }));
  assert.throws(broken((d) => { d.auth.anonKey = "sb_secret_abcdefghijklmnopqrstuvwxyz"; }));
  assert.throws(broken((d) => { d.auth.anonKey = ""; }));
});

test("engine/world-config.js holds no constant table; the baseline says so", () => {
  assert.equal(countConstantTables(fs.readFileSync(new URL("../src/engine/world-config.js", import.meta.url), "utf8")), 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert(!("engine/world-config.js" in baseline.constantTables));
  assert(!("engine/areas.js" in baseline.constantTables));
});
