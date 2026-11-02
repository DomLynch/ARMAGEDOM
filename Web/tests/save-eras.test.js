// The save chain as a table (src/engine/save-eras.js) with one replay per era. Where the repo holds a genuine record
// written by that era's build, the CURRENT tree must restore it (runSaveInvalid false), and its next save must be the
// newest era's record, which in turn restores. Eras with no genuine record say why, and name the test that covers them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture } from "./helpers/rifle-fixture.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { CURRENT_ERA, SAVE_ERAS, eraOfRecord } from "../src/engine/save-eras.js";

const text = (name) => fs.readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
const json = (name) => JSON.parse(text(name));
const data = validateAreaMetadata(
  JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url))),
  fixture().world.registry,
);
const bossWorld = Object.fromEntries(["bossEquipmentData", "safehouseData", "reaperData", "markedData"].map((k) => [k, data[k]]));
const make = (records) => fixture({ areaId: "westminster", extraWorld: bossWorld, records });

// version -> a raw genuine record of that era, or { none: reason }.
const records = {
  1: { none: "no genuine v1 record in the repo; the v1 base codec is exercised by every layer's own migration test (run-state-098.txt)" },
  4: { none: "no genuine v4 record; covered through the v5 and later records, which carry the progression block" },
  5: { none: "the v5 record needs the historical area registry; replayed in boss-reward-integration.test.js and reaper-migration.test.js" },
  6: { none: "no genuine v6 record; covered by the v7 record, which wraps it" },
  7: { raw: () => text("earned-cleaver148-v7.json") },
  8: { raw: () => text("flame154-collected-v8.json") },
  9: { raw: () => json("rifle166-earned-v9.json").rawV9 },
  10: { raw: () => json("rocket-v10-earned-prefix.json").rawV10 },
  11: { raw: () => json("safehouse171-earned-v11.json").rawV11 },
  12: { none: "no genuine v12 record; opening-story.test.js builds a v12 migration from the v11 record" },
  13: { raw: () => json("legacy-flame183-v13.json").value },
  14: { none: "no genuine v14 record; opening-story.test.js covers the v14 key and rejects a corrupt one" },
  15: { raw: () => json("railgun194-original193-v15.json").storedRaw },
  16: { raw: () => text("hub195-source194-v16.json") },
  17: { raw: () => text("marked196-source195-v17.json") },
  18: { raw: () => text("navigation203-source202-v18.json") },
};

test("the era table is the whole chain: versions ascend, keys end in their version, the newest is v18", () => {
  assert.deepEqual(SAVE_ERAS.map((row) => row.version), [...SAVE_ERAS.map((row) => row.version)].sort((a, b) => a - b));
  for (const row of SAVE_ERAS) assert(row.key.endsWith(":v" + row.version), row.key);
  assert.equal(new Set(SAVE_ERAS.map((row) => row.key)).size, SAVE_ERAS.length, "one key per era");
  assert.equal(CURRENT_ERA.version, 18);
  assert.equal(CURRENT_ERA.key, "armagedom:marked-run:v18");
});

test("every era has a replay record or a written reason", () => {
  assert.deepEqual(Object.keys(records).map(Number), SAVE_ERAS.map((row) => row.version));
  for (const [version, entry] of Object.entries(records)) assert(typeof entry.raw === "function" || entry.none, version);
});

test("eraOfRecord reads a record's own version and refuses anything else", () => {
  assert.equal(eraOfRecord(text("navigation203-source202-v18.json")).layer, "marked");
  assert.equal(eraOfRecord('{"version":11}').key, "armagedom:boss-equipment-run:v11");
  for (const bad of ["not json", "{}", "[]", '{"version":99}', "null"]) assert.equal(eraOfRecord(bad), null, bad);
});

// What the record says about the run, and what the restored run says: hit points, pistol ammo, how many boss awards and issued supplies it
// carries, and the flame fuel. Every genuine record differs from a fresh run in at least one of these, so equality proves THIS record was read.
const printOf = (r) => ({ hp: r.hp, mag: r.pistol?.magazine, res: r.pistol?.reserve, awards: r.progression?.awards?.length, issued: r.supplies?.issued?.length, fuel: r.flameFuel?.fuelUnits ?? 0 });
const printOfRun = (g) => ({ hp: g.player.hp, mag: g.pistol?.magazine, res: g.pistol?.reserve, awards: g.progression?.awards?.length, issued: g.supplies?.issued?.length, fuel: g.flameFuel?.fuelUnits ?? 0 });
const freshRun = (() => {
  const f = make(new Map());
  f.restore();
  return printOfRun(f.g);
})();

for (const row of SAVE_ERAS) {
  const entry = records[row.version];
  if (!entry.raw) continue;
  test(`era v${row.version} (${row.layer}): a genuine record restores in the current tree and re-saves as v${CURRENT_ERA.version}`, () => {
    const raw = entry.raw();
    assert.equal(eraOfRecord(raw)?.version, row.version, "the fixture really is this era");
    const expected = printOf(JSON.parse(raw));

    // Negative controls: the check has teeth. A fresh run differs from this record, and the same record stored under a key nothing reads
    // (or not stored at all) restores to the fresh run, not to the record.
    assert.notDeepEqual(expected, freshRun, "this record is indistinguishable from a fresh run, so a replay of it would prove nothing");
    for (const records of [new Map(), new Map([[row.key.replace(/:v\d+$/, ":v999"), raw]])]) {
      const missed = make(records);
      missed.restore();
      assert.deepEqual(printOfRun(missed.g), freshRun, "without the record the run must be fresh");
    }

    const f = make(new Map([[row.key, raw]]));
    f.restore();
    assert(!f.g.runSaveInvalid, "restore marked the genuine record invalid");
    assert.deepEqual(printOfRun(f.g), expected, "the restored run does not carry the genuine record's own values");
    assert(f.g.player.hp > 0 && !f.g.finished);
    assert(f.p.persistRun(f.g), "the restored run could not be saved");
    const saved = f.records.get(CURRENT_ERA.key);
    assert(saved, "no current-era record was written");
    assert.equal(eraOfRecord(saved).version, CURRENT_ERA.version);
    assert.deepEqual(printOf(JSON.parse(saved)), expected, "the re-saved record still carries the genuine values");
    const cold = make(new Map([[CURRENT_ERA.key, saved]]));
    cold.restore();
    assert(!cold.g.runSaveInvalid, "the re-saved record does not restore");
    assert.deepEqual(printOfRun(cold.g), expected, "a cold start from the re-saved record carries the genuine values");
    assert.deepEqual(JSON.parse(JSON.stringify(cold.g.progression)), JSON.parse(JSON.stringify(f.g.progression)));
  });
}
