import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateHeat } from "../src/engine/game-data-heat.js";
import { stepHeat, heatTier, heatFromEvents, resetHeat, addHeat } from "../src/engine/heat.js";
import { claimCash } from "../src/engine/world-pickups-core.js";

const HEAT = GAME_DATA.heat,
  V = HEAT.valuables,
  perStash = V.cash[0].perHeat,
  raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/heat.json", import.meta.url)))),
  game = () => {
    const g = { time: 0, kills: 0, enemies: [], events: [], world: { areaId: "east-bridge" } };
    stepHeat(g);
    return g;
  },
  text = GAME_DATA.webText.texts["heat.tierUp"];

test("the valuables rows are data and validate: cash stash 1 per 100, airdrop crate 2, boss kill 3", () => {
  assert.doesNotThrow(() => validateHeat(raw()));
  assert.deepEqual(V.cash, [{ sourcePrefix: "stash:", perHeat: 100 }]);
  assert.deepEqual(V.claims, [{ source: "airdrop", heat: 2 }]);
  assert.deepEqual(V.events, [{ type: "boss-defeated", heat: 3 }]);
  assert.equal(text, "The hunters are closing in.");
  for (const mutate of [
    (d) => { d.valuables.cash[0].perHeat = 0; },
    (d) => { d.valuables.claims[0].extra = 1; },
    (d) => { d.valuables.events = {}; },
    (d) => { delete d.tierMessageSeconds; },
  ]) {
    const d = raw();
    mutate(d);
    assert.throws(() => validateHeat(d));
  }
});

test("a cash stash raises heat by 1 per 100 cash collected, carrying the remainder; other cash sources do not", () => {
  const g = game();
  claimCash(g, "stash:a", perStash - 1);
  assert.equal(g.heat.count, 0);
  claimCash(g, "stash:b", 1);
  assert.equal(g.heat.count, 1);
  claimCash(g, "stash:c", perStash * 2 + 50);
  assert.equal(g.heat.count, 3);
  claimCash(g, "stash:d", 50);
  assert.equal(g.heat.count, 4, "the carried 50 and this 50 make another 100");
  claimCash(g, "creature", 9999);
  assert.equal(g.heat.count, 4, "kill coins are not valuables here");
  assert.equal(g.cashClaims.length, 5, "the server claims are untouched");
});

test("an airdrop crate raises heat by 2 and a boss kill by 3, the boss event read once", () => {
  const g = game();
  claimCash(g, "airdrop", 400);
  assert.equal(g.heat.count, 2);
  const boss = { type: "boss-defeated", placementKey: "boss-a" };
  g.events.push(boss, { type: "death" });
  heatFromEvents(g);
  assert.equal(g.heat.count, 5);
  heatFromEvents(g);
  assert.equal(g.heat.count, 5, "the same event is not counted twice");
  g.events.push({ type: "boss-defeated", placementKey: "boss-b" });
  heatFromEvents(g);
  assert.equal(g.heat.count, 8);
});

test("valuables share the cap, the off switch and the death reset with kills", () => {
  const g = game();
  for (let i = 0; i < 10; i++) claimCash(g, "airdrop", 1);
  assert.equal(g.heat.count, HEAT.maxHeat);
  const off = game();
  addHeat(off, 3, HEAT, "?noheat=1");
  assert.equal(off.heat.count, 0, "off switch: nothing is added");
  const gone = { ...game(), heat: null };
  claimCash(gone, "airdrop", 50);
  assert.equal(gone.heat, null);
  claimCash(g, "stash:z", 50);
  resetHeat(g);
  assert.equal(g.heat.count, 0);
  assert.equal(g.heat.cashBank, 0, "death also clears the cash carried toward the next mark");
});

test("reaching a new tier shows the data HUD line once; staying in a tier does not", () => {
  const g = game(),
    first = HEAT.pressure.tiers[0],
    second = HEAT.pressure.tiers[1];
  claimCash(g, "airdrop", 1); // heat 2: tier 1 for the first time
  assert.equal(heatTier(g), first);
  assert.equal(g.message, text);
  assert.equal(g.messageUntil, g.time + HEAT.tierMessageSeconds);
  g.message = "other";
  addHeat(g, 0);
  claimCash(g, "stash:x", 0);
  assert.equal(g.message, "other", "no gain, no line");
  g.heat.count = first.minHeat;
  addHeat(g, 1); // still inside the first tier
  assert.equal(g.message, "other", "a gain inside the same tier says nothing");
  g.heat.count = second.minHeat - 1;
  addHeat(g, 1);
  assert.equal(heatTier(g), second);
  assert.equal(g.message, text, "the next tier says it again");
  g.kills += 1;
  g.message = "other";
  g.heat.count = second.minHeat - 1;
  stepHeat(g);
  assert.equal(g.message, text, "a kill that crosses a tier says it too");
});
