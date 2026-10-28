import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateCorpseRun } from "../src/engine/game-data-corpse-run.js";
import { dropCorpseBag, stepCorpseRun, corpseTarget, respawnArea } from "../src/engine/corpse-run.js";
import { airdropPull } from "../src/engine/airdrop.js";
import { adoptServerCash } from "../src/engine/save-client.js";
import { make, earn, atArea } from "./helpers/marked-fixture.js";
import { receiveHit } from "../src/combat.js";

const RULES = GAME_DATA.corpseRun,
  STEP = 1 / 60,
  raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/corpseRun.json", import.meta.url)))),
  total = (g) => g.marked.carried + g.marked.bank + (g.corpseBag?.cash ?? 0),
  die = (f) => {
    const g = f.g;
    assert(receiveHit(g, { amount: 10000, origin: { x: g.player.pos.x + 1, z: g.player.pos.z }, block: false, parry: false }));
    assert(g.player.hp === 0 && g.finished);
    assert(f.p.persistRun(g));
  },
  game = (extra = {}) => ({
    time: 0,
    player: { pos: { x: 0, z: 0 }, hp: 50 },
    marked: { carried: 0, bank: 0, bounty: 0 },
    world: { areaId: "east", markedData: { maxMoney: 1000 } },
    ...extra,
  });

test("rows validate and the shipped row is on", () => {
  assert.doesNotThrow(() => validateCorpseRun(raw()));
  const bad = raw();
  bad.bag.scavengerSeconds = 0;
  assert.throws(() => validateCorpseRun(bad));
  const extra = raw();
  extra.drop.weapon = true;
  assert.throws(() => validateCorpseRun(extra));
  assert.equal(RULES.enabled, true);
});

test("death moves carried cash into a bag; the bag is never in the save record; reload loses it and never restores cash", () => {
  const f = make();
  earn(f);
  const g = f.g,
    bank = g.marked.bank;
  assert.equal(g.marked.carried, 100);
  atArea(f, "westminster");
  const before = total(g);
  die(f);
  assert.equal(g.corpseBag.cash, 100);
  assert.equal(g.corpseBag.areaId, "westminster");
  assert.equal(g.marked.carried, 0);
  assert.equal(total(g), before, "cash moved from the record to the bag, none made");
  for (const raw of f.records.values()) assert(!raw.includes("corpseBag"), "the bag is never saved");
  const cold = make({ records: f.records });
  assert.equal(cold.g.corpseBag, undefined);
  assert.equal(cold.g.marked.carried, 0);
  assert.equal(cold.g.marked.bank, bank);
  assert(f.p.retry());
  assert.equal(f.g.corpseBag.cash, 100, "Retry does not touch the bag");
  assert.equal(f.g.marked.carried, 0);
});

test("walking over the bag returns the cash exactly once; no second pickup, no duplicate after a save and cold load", () => {
  const f = make();
  earn(f);
  atArea(f, "westminster");
  die(f);
  assert(f.p.retry());
  const g = f.g,
    held = total(g);
  g.player.pos = { x: g.corpseBag.at.x + RULES.retrieve.radius * 2, z: g.corpseBag.at.z };
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 0, "outside the radius nothing happens");
  g.player.pos = { ...g.corpseBag.at };
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 100);
  assert.equal(g.corpseBag, null);
  stepCorpseRun(g, STEP);
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 100, "one bag pays once");
  assert.equal(total(g), held);
  assert(f.p.persistRun(g));
  assert.equal(make({ records: f.records }).g.marked.carried, 100);
  assert.equal(g.cashClaims, undefined, "retrieval files no server claim: it is the player's own cash");
});

test("dying twice before a pickup merges into one bag at the latest spot; a death with nothing carried makes no bag", () => {
  const g = game();
  g.time = 10;
  dropCorpseBag(g, 120, { areaId: "east", x: 1, z: 2 });
  g.time = 20;
  dropCorpseBag(g, 30, { areaId: "east", x: 5, z: 6 });
  assert.equal(g.corpseBag.cash, 150);
  assert.deepEqual(g.corpseBag.at, { x: 5, z: 6 });
  assert.equal(g.corpseBag.expiresAt, 20 + RULES.bag.scavengerSeconds);
  const empty = game();
  assert.equal(dropCorpseBag(empty, 0, { areaId: "east", x: 0, z: 0 }), null);
  assert.equal(empty.corpseBag, undefined);
});

test("the bag can never hold more than the game maximum", () => {
  const g = game();
  dropCorpseBag(g, 900, { areaId: "east", x: 0, z: 0 });
  dropCorpseBag(g, 900, { areaId: "east", x: 0, z: 0 });
  assert.equal(g.corpseBag.cash, g.world.markedData.maxMoney);
});

test("at the cap the bag keeps what does not fit and pays the rest later", () => {
  const g = game({ marked: { carried: 0, bank: 950, bounty: 0 } });
  dropCorpseBag(g, 100, { areaId: "east", x: 0, z: 0 });
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 50);
  assert.equal(g.corpseBag.cash, 50);
  g.marked.bank = 0;
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 100);
  assert.equal(g.corpseBag, null);
});

test("scavengers take the bag after the timer, wherever the player is, and the cash is gone", () => {
  const g = game();
  dropCorpseBag(g, 100, { areaId: "east", x: 50, z: 50 });
  g.time += RULES.bag.scavengerSeconds - STEP;
  stepCorpseRun(g, STEP);
  assert(g.corpseBag);
  g.world.areaId = "south";
  g.time += STEP * 2;
  stepCorpseRun(g, STEP);
  assert.equal(g.corpseBag, null);
  assert.equal(g.marked.carried, 0);
});

test("the bag cannot be taken from another area, or by a dead player", () => {
  const g = game();
  dropCorpseBag(g, 100, { areaId: "east", x: 0, z: 0 });
  g.world.areaId = "south";
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 0);
  g.world.areaId = "east";
  g.player.hp = 0;
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 0);
  assert.equal(g.corpseBag.hud, "");
  g.player.hp = 50;
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried, 100);
});

test("server clamp: a bag cannot lift the total above what was held, and the clamp reply still wins over a retrieved sum", () => {
  const g = game({ marked: { carried: 0, bank: 40, bounty: 0 } });
  dropCorpseBag(g, 60, { areaId: "east", x: 0, z: 0 });
  stepCorpseRun(g, STEP);
  assert.equal(g.marked.carried + g.marked.bank, 100, "back to the pre-death total, no more");
  // The server (enforce_cash) lowered the record it was sent to carried 20 / bank 40: that drop is applied to the live run.
  assert(adoptServerCash(g, { clamped: true, carried: 20, bank: 40 }, { run: g, sent: { carried: 60, bank: 40 } }));
  assert.equal(g.marked.carried, 20);
});

test("bosses converge on the bag like an airdrop; the crate wins while one is in the air; off row means no pull", () => {
  const g = game();
  dropCorpseBag(g, 100, { areaId: "east", x: 30, z: 0 });
  g.world.lineClear = () => false;
  const boss = () => ({ bossProfile: { wakeDistance: 5 }, hp: 10, pos: { x: 0, z: 0 }, moveSpeed: 2, alerted: false, residentIntent: { homeLeash: 1 } });
  const moves = [];
  const move = (_g, e, dir) => moves.push(dir);
  assert(corpseTarget(g));
  assert.equal(airdropPull(g, boss(), STEP, move), true);
  assert.equal(moves.length, 1);
  assert(moves[0].x > 0);
  g.airdrop = { phase: "landed", crate: { x: 0, z: 40 } };
  assert.equal(airdropPull(g, boss(), STEP, move), true);
  assert(moves[1].z > 0 && moves[1].x === 0, "the crate takes the pull while it lies on the ground");
  g.airdrop = null;
  g.world.areaId = "south";
  assert.equal(corpseTarget(g), null);
  assert.equal(airdropPull(g, boss(), STEP, move), false);
});

test("Retry while alive drops no bag and moves no cash (it zeroes carried as it always did); an existing bag stays", () => {
  const f = make();
  earn(f);
  atArea(f, "westminster");
  const g = f.g,
    held = total(g);
  assert.equal(g.player.hp > 0, true);
  assert(f.p.retry());
  assert.equal(f.g.corpseBag, undefined, "no bag from an alive Retry");
  assert.equal(f.g.marked.carried, 0);
  assert(total(f.g) < held, "the carried cash is simply gone, as before: Retry is not a way to park it");
  const second = make();
  earn(second);
  atArea(second, "westminster");
  die(second);
  const bag = second.g.corpseBag;
  assert(bag);
  assert(second.p.retry());
  assert.equal(second.g.corpseBag.cash, bag.cash);
  assert(second.p.retry(), "an alive Retry with a bag out keeps the bag");
  assert.equal(second.g.corpseBag.cash, bag.cash);
});

test("the bag drops where the player fell, read before the respawn travel (g.corpseFell), not at the respawn spot", () => {
  const f = make();
  earn(f);
  atArea(f, "south");
  const g = f.g,
    died = { ...g.player.pos };
  assert(receiveHit(g, { amount: 10000, origin: { x: died.x + 1, z: died.z }, block: false, parry: false }));
  g.corpseFell = { areaId: "south", x: died.x, z: died.z };
  atArea(f, "central-hub"); // restart() travels to the safehouse before the Retry commit
  assert(f.p.retry());
  assert.equal(f.g.corpseBag.areaId, "south");
  assert.deepEqual(f.g.corpseBag.at, { x: died.x, z: died.z });
});

test("Retry restarts the run clock; the scavenger timer keeps counting from the new clock with the time that was left", () => {
  const f = make();
  earn(f);
  atArea(f, "westminster");
  f.g.time = 100;
  die(f);
  assert.equal(f.g.corpseBag.expiresAt, 100 + RULES.bag.scavengerSeconds);
  f.g.time = 130; // 30 s later, still dead: 210 s left
  assert(f.p.retry());
  const g = f.g;
  assert(g.time < 130, "the fresh run's clock started again");
  assert.equal(g.corpseBag.expiresAt, g.time + RULES.bag.scavengerSeconds - 30);
  g.player.pos = { x: 1e6, z: 1e6 };
  g.time = g.corpseBag.expiresAt - STEP;
  stepCorpseRun(g, STEP);
  assert(g.corpseBag, "not yet");
  g.time += STEP * 2;
  stepCorpseRun(g, STEP);
  assert.equal(g.corpseBag, null, "scavengers take it when the remaining time runs out");
});

test("respawn row: a death in the field restarts in the safehouse area, a death at home as it always did", () => {
  assert.equal(respawnArea("east", "westminster"), RULES.respawn.safehouseAreaId);
  assert.equal(respawnArea("westminster", "westminster"), "westminster");
  assert.equal(RULES.respawn.safehouseAreaId, "central-hub");
});
