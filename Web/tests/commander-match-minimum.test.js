import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateCommanderMatch } from "../src/engine/commander/match-data.js";

// A Commander match starts with at least one drone and at least one defender; the shipped values (3 and 2) are unchanged.
const match = (change) => {
  const m = structuredClone(GAME_DATA.commander.match);
  change(m);
  return m;
};

test("the shipped match data is accepted", () => {
  assert.doesNotThrow(() => validateCommanderMatch(match(() => {})));
});

test("zero starting drones or zero defenders are refused", () => {
  assert.throws(() => validateCommanderMatch(match((m) => { m.startMachines = 0; })), /startMachines/);
  assert.throws(() => validateCommanderMatch(match((m) => { m.defenders = 0; })), /defenders/);
});

test("one of each is the smallest accepted match", () => {
  assert.doesNotThrow(() => validateCommanderMatch(match((m) => { m.startMachines = 1; m.defenders = 1; })));
});
