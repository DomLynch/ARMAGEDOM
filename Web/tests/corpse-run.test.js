import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateCorpseRun } from "../src/engine/game-data-corpse-run.js";
import { dropCorpseBag, stepCorpseRun, corpseTarget, respawnArea } from "../src/engine/corpse-run.js";
import { lockerStored } from "../src/engine/locker-core.js";
import { airdropPull } from "../src/engine/airdrop.js";
import { adoptServerCash } from "../src/engine/save-client.js";
import { make, earn, atArea, collectPistol } from "./helpers/marked-fixture.js";
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

test("gear: the weapon in hand is withheld (not removed) while the bag holds it; touching the bag or a reload gives it back, never twice", () => {
  const f = make(),
    id = "westminster-start-pistol-v1";
  earn(f);
  collectPistol(f);
  assert(f.p.dispatchPistol(f.g, { type: "equip", itemId: id, equipped: true }, true).ok);
  atArea(f, "westminster");
  f.g.time = 5; // the run has been played; a run loaded from a save has time 0 and never drops gear
  assert(f.g.pistol.equipped && !lockerStored(f.g, id));
  die(f);
  assert.equal(f.g.corpseBag.gearId, id);
  assert(lockerStored(f.g, id), "the pistol cannot be used while the bag holds it");
  assert.equal(f.p.dispatchPistol(f.g, { type: "equip", itemId: id, equipped: true }, true).ok, false);
  assert.equal(f.g.locker?.weapons?.length ?? 0, 0, "the Storage list is untouched: one owner only");
  assert(f.p.retry());
  const g = f.g;
  assert.equal(g.corpseBag.gearId, id, "Retry carries the bag");
  assert(lockerStored(g, id));
  g.player.pos = { ...g.corpseBag.at };
  stepCorpseRun(g, STEP);
  assert.equal(g.corpseBag, null);
  assert(!lockerStored(g, id), "touching the bag frees the weapon");
  assert.equal(g.pistol.collected, true, "the weapon was never removed from the run");
  const cold = make({ records: f.records });
  assert(!lockerStored(cold.g, id) && cold.g.corpseBag === undefined, "a reload never leaves a weapon withheld");
});

test("gear: a reload with the bag outstanding returns the weapon and the cash stays lost (never both)", () => {
  const f = make();
  earn(f);
  collectPistol(f);
  assert(f.p.dispatchPistol(f.g, { type: "equip", itemId: "westminster-start-pistol-v1", equipped: true }, true).ok);
  atArea(f, "westminster");
  f.g.time = 5;
  die(f);
  assert(f.g.corpseBag.gearId && f.g.corpseBag.cash === 100);
  const cold = make({ records: f.records });
  assert.equal(cold.g.corpseBag, undefined);
  assert.equal(cold.g.marked.carried, 0);
  assert.equal(cold.g.pistol.collected, true);
});

test("gear: rows keep the knife, cleaver and Reaper companion; scavengers release the weapon by row", () => {
  assert.deepEqual(RULES.gear.neverDrop, ["knife", "hale-pitborn-cleaver-v1", "watchmans-pistol-v1"]);
  const g = game();
  dropCorpseBag(g, 10, { areaId: "east", x: 0, z: 0 }, { id: "bridge-warden-rifle-v1", name: "Rifle" });
  assert.equal(g.corpseBag.gearId, "bridge-warden-rifle-v1");
  assert.equal(g.corpseBag.stealableBy, "none");
  assert.equal(RULES.gear.onScavenge, "release");
  g.time += RULES.bag.scavengerSeconds + 1;
  stepCorpseRun(g, STEP);
  assert.equal(g.corpseBag, null, "release: the cash is gone and the weapon is the player's again");
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
