// server/data/spawns.json (the rows the writer pins every engage to) must be what the game's own data says for the live species cycle. Drift guard like the
// weapon/payout/loot seeds: when a creature, its hp or its placement changes, this fails until the file is regenerated
// (node server/data/generate-spawns.mjs A > server/data/spawns.json).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LIVE_CYCLE, loadContent, spawnsFor } from "../../server/data/generate-spawns.mjs";

const file = JSON.parse(fs.readFileSync(new URL("../../server/data/spawns.json", import.meta.url), "utf8"));
const content = loadContent();

test("spawns.json equals the game's spawn rows for the live species cycle", () => {
  assert.equal(LIVE_CYCLE, "A");
  assert.deepEqual(file, spawnsFor(content, LIVE_CYCLE), "regenerate: node server/data/generate-spawns.mjs A > server/data/spawns.json");
  assert.ok(Object.keys(file).length >= 30, "a real world, not the empty placeholder");
});

test("both species cycles place the same instances; the creatures that differ are pinned, so a change is a decision", () => {
  const a = spawnsFor(content, "A"),
    b = spawnsFor(content, "B");
  assert.deepEqual(Object.keys(a), Object.keys(b), "the same placements in both cycles");
  const differing = Object.keys(a).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
  // The shared world runs ONE cycle (A). A phone playing cycle B has a different creature on these placements and its engage is refused (O0002).
  assert.deepEqual(differing, [
    "area7:area7-station-rat-v1",
    "area8:area8-resident-4",
    "east-bridge:east-bridge-resident-2",
    "east:east-roamer-4",
    "elephant-and-castle:elephant-and-castle-resident-2",
    "lambeth:lambeth-resident-2",
  ]);
});

test("every always-drop weapon's source placement is a spawn row (a kill can be engaged and settled)", () => {
  for (const key of ["east:east-roamer-2", "east-bridge:boss-warden-v1", "lambeth:boss-surgeon-v1", "westminster:boss-witch-v1"]) assert.ok(file[key], key);
});
