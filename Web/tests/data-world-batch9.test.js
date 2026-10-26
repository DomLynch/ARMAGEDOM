import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { SUPPLY_RULES, GEAR_ITEMS } from "../src/supplies.js";
import { SEVER_BLOOD_DATA } from "../src/engine/sever-blood-data.js";
import { GAME_DATA, validateSupplies, validateCreatures, validateVisual } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch 9 (World): SUPPLY_RULES and GEAR_ITEMS (supplies.js), SEVER_BLOOD_DATA (engine/sever-blood-data.js) and PLAYER_FIELDS
// (engine/creature-sim.js) moved into data/supplies.json, data/visual.json and data/creatures.json. The literals below are the values
// the constants held on origin/main (6b7d9af) before the move.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

test("the data files are pinned", () => {
  assert.equal(sha(read("../src/data/supplies.json")), "69156017db3ebe45588d34fbae08aad8e293bf897c3f58f5e47d100408639002");
  assert.equal(sha(read("../src/data/visual.json")), "6febd838c069f805f01918801539cff7a9e5f8ad1d6b8afa2873d310eca833db");
  assert.equal(sha(read("../src/data/creatures.json")), "00b717e7a9ffd918832880eda1be4034f64a1d037d107c1330cc8b88fb028350");
});

test("every moved value equals the constant it replaced", () => {
  assert.deepEqual(SUPPLY_RULES, { pickupRadius: 1.3, reserveCap: 12, healFraction: 0.2 });
  assert.deepEqual([...GEAR_ITEMS], ["westminster-start-pistol-v1", "westminster-worn-vest-v1"]);
  assert.deepEqual(SEVER_BLOOD_DATA, {
    jet: { capacity: 2, duration: 0.5, length: 1.2, radius: 0.075 },
    pool: { settleSeconds: 0.1, capacity: 4, lifetime: 4, spreadSeconds: 0.4, radius: 0.5, opacity: 0.7 },
    headDropletLifetime: 1.25,
    headDropletGravity: 4,
  });
  assert.deepEqual([...GAME_DATA.creatures.creatureSim.playerFields], ["hp", "dodgeUntil", "guarding", "parryUntil", "stamina"]);
});

test("the tables are the frozen data rows", () => {
  assert.equal(SUPPLY_RULES, GAME_DATA.supplies.rules);
  assert.equal(GEAR_ITEMS, GAME_DATA.supplies.gearItems);
  assert.equal(SEVER_BLOOD_DATA, GAME_DATA.visual.severBlood);
  for (const v of [SUPPLY_RULES, GEAR_ITEMS, SEVER_BLOOD_DATA, SEVER_BLOOD_DATA.jet, SEVER_BLOOD_DATA.pool, GAME_DATA.creatures.creatureSim.playerFields])
    assert(Object.isFrozen(v));
});

const broken = (file, validate, mutate) => () => {
  const d = structuredClone(JSON.parse(read(`../src/data/${file}.json`)));
  mutate(d);
  validate(d);
};

test("the loader rejects broken supplies rules and gear items", () => {
  const b = (m) => broken("supplies", validateSupplies, m);
  assert.doesNotThrow(b(() => {}));
  assert.throws(b((d) => { delete d.rules; }));
  assert.throws(b((d) => { d.rules.extra = 1; }));
  assert.throws(b((d) => { d.rules.reserveCap = 12.5; }));
  assert.throws(b((d) => { d.rules.pickupRadius = "far"; }));
  assert.throws(b((d) => { d.rules.healFraction = 0; }));
  assert.throws(b((d) => { d.rules.healFraction = 1.5; }));
  assert.throws(b((d) => { d.gearItems.reverse(); }));
  assert.throws(b((d) => { d.gearItems.push("extra"); }));
  assert.throws(b((d) => { delete d.gearItems; }));
});

test("the loader rejects broken sever blood data", () => {
  const b = (m) => broken("visual", validateVisual, m);
  assert.doesNotThrow(b(() => {}));
  assert.throws(b((d) => { delete d.severBlood; }));
  assert.throws(b((d) => { d.severBlood.extra = 1; }));
  assert.throws(b((d) => { d.severBlood.jet.capacity = 0; }));
  assert.throws(b((d) => { d.severBlood.jet.length = -1; }));
  assert.throws(b((d) => { d.severBlood.pool.capacity = 1.5; }));
  assert.throws(b((d) => { d.severBlood.pool.opacity = 0; }));
  assert.throws(b((d) => { d.severBlood.pool.opacity = 2; }));
  assert.throws(b((d) => { delete d.severBlood.pool.radius; }));
  assert.throws(b((d) => { d.severBlood.headDropletGravity = "heavy"; }));
});

test("the loader rejects broken creature sim player fields", () => {
  const b = (m) => broken("creatures", validateCreatures, m);
  assert.doesNotThrow(b(() => {}));
  assert.throws(b((d) => { delete d.creatureSim; }));
  assert.throws(b((d) => { d.creatureSim.extra = 1; }));
  assert.throws(b((d) => { d.creatureSim.playerFields.pop(); }));
  assert.throws(b((d) => { d.creatureSim.playerFields.push("pos"); }));
  assert.throws(b((d) => { d.creatureSim.playerFields.reverse(); }));
});

test("the three source files hold no constant table; the baseline has no entry for them", () => {
  const baseline = JSON.parse(read("../../scripts/as-data-baseline.json"));
  for (const [file, path] of [
    ["supplies.js", "../src/supplies.js"],
    ["engine/creature-sim.js", "../src/engine/creature-sim.js"],
    ["engine/sever-blood-data.js", "../src/engine/sever-blood-data.js"],
  ]) {
    assert.equal(countConstantTables(read(path)), 0, file);
    assert(!(file in baseline.constantTables), file);
  }
});
