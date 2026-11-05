// Permanent safehouse upgrades (data/safehouseUpgrades.json): the data and its validator, the pin to the migration's seed, the effect math and hooks
// (carry cap, stamina, dodge recovery), the controller against a mock server, the api adapter, the panel view and the per-frame wiring.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateUpgrades } from "../src/engine/game-data-upgrades.js";
import { createUpgradesApi } from "../src/engine/upgrades-api.js";
import { createUpgradesController, effectText, readCachedLevels, upgradesOn } from "../src/engine/upgrades-core.js";
import { createUpgradesView } from "../src/engine/upgrades-view.js";
import { createUpgrades } from "../src/engine/upgrades.js";
import {
  applyStaminaUpgrade,
  dodgeCooldown,
  dodgeRecoveryCut,
  reserveBonus,
  reserveBonusMax,
  rollTicks,
  setUpgradeLevels,
  staminaBonus,
  upgradeLevel,
} from "../src/engine/upgrades-state.js";
import { LOCKER_RESOURCE_RULES, carryCapOf, createLockerModel } from "../src/engine/locker-state.js";
import { createAmmoRewardModel } from "../src/engine/rifle-state.js";
import { RIFLE_PROFILE } from "../src/engine/weapon-catalog.js";
import { webText } from "../src/engine/web-text.js";

const DATA = GAME_DATA.safehouseUpgrades;
const clone = () => structuredClone(DATA);
const wait = () => new Promise((resolve) => setImmediate(resolve));
afterEach(() => setUpgradeLevels({}));

test("the data: three upgrades with a price per level, all words present in webText.json", () => {
  assert.deepEqual(DATA.upgrades.map((r) => r.id), ["reserve-magazine", "stamina", "dodge-recovery"]);
  for (const row of DATA.upgrades) {
    assert.equal(row.prices.length, row.maxLevel, row.id);
    for (const key of [`upgrades.name.${row.id}`, `upgrades.desc.${row.id}`, `upgrades.effect.${row.effect.kind}`]) assert.ok(GAME_DATA.webText.texts[key], key);
  }
  for (const code of ["insufficient-cash", "offline", "refused", "guest", "O0007", "max-level"]) assert.ok(GAME_DATA.webText.texts[`upgrades.error.${code}`], code);
  assert.deepEqual(Object.keys(DATA.api.calls), ["get", "buy"]);
});

test("the rounds per magazine are the real magazine sizes of the starting pistol and the bridge rifle", () => {
  const rounds = DATA.upgrades[0].effect.roundsPerMagazine,
    ranged = GAME_DATA.weapons.ranged;
  assert.equal(rounds["pistol-reserve"], ranged["westminster-start-pistol-v1"].rules.capacity);
  assert.equal(rounds["rifle-reserve"], ranged["bridge-warden-rifle-v1"].rules.capacity);
});

test("the migration seeds arma_upgrade_defs with exactly these ids, max levels and prices (change one, change both)", () => {
  const sql = fs.readFileSync(new URL("../../supabase/migrations/20261105000032_arma_safehouse_upgrades.sql", import.meta.url), "utf8");
  const block = /insert into public\.arma_upgrade_defs[^;]*;/.exec(sql)[0];
  const seeded = [...block.matchAll(/\('([a-z0-9-]+)',\s*(\d+),\s*array\[([\d,\s]+)\]\)/g)].map((m) => ({ id: m[1], maxLevel: Number(m[2]), prices: m[3].split(",").map(Number) }));
  assert.deepEqual(seeded, DATA.upgrades.map(({ id, maxLevel, prices }) => ({ id, maxLevel, prices })));
});

test("the validator refuses unknown fields, a short price list, a price that does not rise, a repeated kind and a runaway dodge cut", () => {
  validateUpgrades(clone());
  const bad = (change) => {
    const d = clone();
    change(d);
    assert.throws(() => validateUpgrades(d));
  };
  bad((d) => (d.extra = 1));
  bad((d) => d.upgrades[0].prices.pop());
  bad((d) => (d.upgrades[1].prices[1] = d.upgrades[1].prices[0]));
  bad((d) => (d.upgrades[1].prices[0] = 0));
  bad((d) => (d.upgrades[1].prices[0] = d.limits.maxPrice + 1));
  bad((d) => (d.upgrades[1].id = "Bad Id"));
  bad((d) => (d.upgrades[2].id = d.upgrades[1].id));
  bad((d) => (d.upgrades[2].effect.kind = "maxStamina"));
  bad((d) => (d.upgrades[2].effect.kind = "damage"));
  bad((d) => (d.upgrades[2].effect.perLevel = 0.2));
  bad((d) => (d.upgrades[1].effect.perLevel = 0));
  bad((d) => (d.upgrades[0].effect.roundsPerMagazine["shotgun-reserve"] = 2));
  bad((d) => (d.upgrades[0].maxLevel = d.limits.maxLevels + 1));
  bad((d) => (d.api.calls.extra = "x"));
  bad((d) => (d.limits.maxDodgeCut = 1));
});

test("level 0 changes nothing; each level adds its own amount; levels outside the data are dropped", () => {
  assert.deepEqual([reserveBonus("pistol-reserve"), reserveBonus("rifle-reserve"), staminaBonus(), dodgeRecoveryCut()], [0, 0, 0, 0]);
  setUpgradeLevels([{ id: "reserve-magazine", level: 2 }, { id: "stamina", level: 3 }, { id: "dodge-recovery", level: 4 }]);
  assert.deepEqual([reserveBonus("pistol-reserve"), reserveBonus("rifle-reserve"), reserveBonus("shotgun-reserve")], [12, 16, 0]);
  assert.equal(staminaBonus(), 30);
  assert.ok(Math.abs(dodgeRecoveryCut() - 0.4) < 1e-9);
  setUpgradeLevels([{ id: "stamina", level: 99 }, { id: "nonesuch", level: 2 }, { id: "reserve-magazine", level: -1 }, { id: "dodge-recovery", level: 1.5 }]);
  assert.deepEqual([upgradeLevel("stamina"), upgradeLevel("nonesuch"), upgradeLevel("reserve-magazine"), upgradeLevel("dodge-recovery")], [5, 0, 0, 0]);
  setUpgradeLevels({ stamina: 1 });
  assert.equal(staminaBonus(), 10);
  setUpgradeLevels(null);
  assert.equal(staminaBonus(), 0);
});

test("the top level is the bound a saved run is valid up to: three magazines of 6 and of 8", () => {
  assert.deepEqual([reserveBonusMax("pistol-reserve"), reserveBonusMax("rifle-reserve"), reserveBonusMax("flame-fuel")], [18, 24, 0]);
});

test("the knife roll keeps its safe interval and shortens only the recovery after it; the legacy cooldown shrinks by the same cut", () => {
  const roll = 36, safeEnd = 20; // the knife's real values (data/weapons.json)
  assert.equal(rollTicks(roll, safeEnd, 0), roll);
  assert.equal(rollTicks(roll, safeEnd), roll, "level 0 is the roll as it was");
  assert.ok(Math.abs(rollTicks(roll, safeEnd, 0.5) - 28) < 1e-9);
  assert.equal(rollTicks(10, 20, 0.5), 10, "a roll with no recovery is untouched");
  assert.ok(rollTicks(roll, safeEnd, 0.5) > safeEnd);
  assert.ok(Math.abs(dodgeCooldown(1.05, 0.2) - 0.84) < 1e-9);
  setUpgradeLevels({ "dodge-recovery": 5 });
  assert.ok(Math.abs(rollTicks(roll, safeEnd) - 28) < 1e-9);
  assert.ok(Math.abs(dodgeCooldown(1) - 0.5) < 1e-9);
});

test("stamina: the bonus moves the maximum, a full bar stays full, a part-full bar keeps its amount, and a reset maximum gets it back", () => {
  const player = { maxStamina: 100, stamina: 100 };
  assert.equal(applyStaminaUpgrade(player), false);
  setUpgradeLevels({ stamina: 2 });
  assert.equal(applyStaminaUpgrade(player), true);
  assert.deepEqual([player.maxStamina, player.stamina], [120, 120]);
  assert.equal(applyStaminaUpgrade(player), false, "a no-op while the bonus is unchanged");
  player.stamina = 50;
  setUpgradeLevels({ stamina: 3 });
  applyStaminaUpgrade(player);
  assert.deepEqual([player.maxStamina, player.stamina], [130, 50]);
  setUpgradeLevels({});
  applyStaminaUpgrade(player);
  assert.deepEqual([player.maxStamina, player.stamina], [100, 50]);
  setUpgradeLevels({ stamina: 1 });
  player.maxStamina = 100; // the saved-run restore resets the maximum to the progression base
  player.stamina = 100;
  applyStaminaUpgrade(player, undefined, 0);
  assert.deepEqual([player.maxStamina, player.stamina], [110, 110]);
  assert.equal(applyStaminaUpgrade({}), false);
  assert.equal(applyStaminaUpgrade(null), false);
  const noBar = { maxStamina: 100 };
  applyStaminaUpgrade(noBar, 10, 0);
  assert.deepEqual(noBar, { maxStamina: 110 });
});

test("the carry cap of the pistol and rifle reserve follows the live level; every other resource keeps its cap", () => {
  const base = (key) => LOCKER_RESOURCE_RULES[key].carryCap;
  assert.equal(carryCapOf("pistol-reserve"), base("pistol-reserve"));
  setUpgradeLevels({ "reserve-magazine": 1 });
  assert.equal(carryCapOf("pistol-reserve"), base("pistol-reserve") + 6);
  assert.equal(carryCapOf("rifle-reserve"), base("rifle-reserve") + 8);
  for (const key of ["shotgun-reserve", "rocket-reserve", "grenade-charges", "flame-fuel", "railgun-reserve"]) assert.equal(carryCapOf(key), base(key), key);
});

test("the locker: a withdraw fills the carry only up to the LIVE cap, while a carried amount is valid up to the TOP cap", () => {
  const ids = GAME_DATA.locker.weaponIds;
  const model = createLockerModel({
    weaponIds: ids,
    resourceRules: LOCKER_RESOURCE_RULES,
    carryExtra: { bound: reserveBonusMax, live: reserveBonus },
  });
  const weapons = Object.fromEntries(ids.map((id) => [id, { owned: id === ids[0], equipped: false }]));
  const inventory = (pistol) => ({ weapons, ammo: { ...model.freshState().ammo, "pistol-reserve": pistol } });
  const stash = { ...model.freshState(), ammo: { ...model.freshState().ammo, "pistol-reserve": 12 } };
  const withdraw = (amount) => ({ type: "withdrawSupply", resource: "pistol-reserve", amount });
  const base = LOCKER_RESOURCE_RULES["pistol-reserve"].carryCap;
  assert.equal(model.propose(stash, inventory(0), withdraw(base + 1)), null, "level 0: the base cap");
  assert.ok(model.propose(stash, inventory(0), withdraw(base)));
  assert.ok(model.validInventory(stash, inventory(base + reserveBonusMax("pistol-reserve"))), "extra rounds already carried stay valid whatever the level is now");
  assert.ok(!model.validInventory(stash, inventory(base + reserveBonusMax("pistol-reserve") + 1)), "but never beyond the top level");
  setUpgradeLevels({ "reserve-magazine": 1 });
  const stash18 = { ...stash, ammo: { ...stash.ammo, "pistol-reserve": 12 } };
  assert.ok(model.propose(stash18, inventory(base), withdraw(6)), "level 1 lets the carry reach cap + 6");
  assert.equal(model.propose(stash18, inventory(base), withdraw(7)), null);
  assert.equal(model.propose({ ...stash, ammo: { ...stash.ammo, "pistol-reserve": 0 } }, inventory(base + 6), { type: "depositSupply", resource: "pistol-reserve", amount: base + 6 }), null, "the stash cap is unchanged");
});

test("a saved rifle with extra reserve is valid up to the top level, and the other boss rifles-style weapons keep their limit", () => {
  const model = createAmmoRewardModel(RIFLE_PROFILE);
  const owned = (reserve) => ({ ...model.freshState(), status: "owned", rewardReceipt: RIFLE_PROFILE.source.receiptId, reserve });
  const top = RIFLE_PROFILE.rules.reserve;
  assert.ok(model.valid(owned(top)));
  assert.ok(model.valid(owned(top + reserveBonusMax("rifle-reserve"))));
  assert.ok(!model.valid(owned(top + reserveBonusMax("rifle-reserve") + 1)));
});

test("effect text: none at level 0, the amount at a level, dodge recovery as a percentage", () => {
  const [reserve, stamina, dodge] = DATA.upgrades;
  assert.equal(effectText(stamina, 0), webText("upgrades.none"));
  assert.equal(effectText(reserve, 2), "Spare magazines +2");
  assert.equal(effectText(stamina, 3), "Stamina +30");
  assert.equal(effectText(dodge, 3), "Dodge recovery -30%");
});

test("the off switch: on by default, off with ?noupgrades=1 or when the data says so", () => {
  assert.equal(upgradesOn("", true), true);
  assert.equal(upgradesOn(`?${DATA.offParam}=${DATA.offValue}`, true), false);
  assert.equal(upgradesOn("", false), false);
});

// A mock server with the same shape as engine/upgrades-api.js.
function mockServer({ cash = 5000, levels = {} } = {}) {
  const state = { cash, levels: { ...levels }, calls: [], seen: new Map(), failNext: null };
  const list = () => Object.entries(state.levels).map(([id, level]) => ({ id, level }));
  return {
    state,
    async levels() {
      state.calls.push("levels");
      if (state.failNext) return state.failNext;
      return { ok: true, levels: list(), cash: state.cash, bank: 0, ceiling: state.cash };
    },
    async buy(id, toLevel, requestId) {
      state.calls.push(`buy:${id}:${toLevel}:${requestId}`);
      if (state.failNext) return state.failNext;
      if (state.seen.has(requestId)) return { ...state.seen.get(requestId), replayed: true };
      const row = DATA.upgrades.find((r) => r.id === id),
        have = state.levels[id] ?? 0;
      if (!row || toLevel !== have + 1) return { ok: false, error: "level-order" };
      if (state.cash < row.prices[have]) return { ok: false, error: "insufficient-cash" };
      state.cash -= row.prices[have];
      state.levels[id] = toLevel;
      const reply = { ok: true, id, level: toLevel, delta: -row.prices[have], levels: list(), replayed: false };
      state.seen.set(requestId, reply);
      return reply;
    },
  };
}
function controllerSetup({ guest = false, server = mockServer(), storage = null, wallet = { cash: 5000 }, enabled = true } = {}) {
  let adapter = server,
    clock = 1_000_000;
  const views = [];
  const controller = createUpgradesController({
    api: () => adapter,
    isGuest: () => guest,
    localCash: () => wallet.cash,
    onCash: (delta) => (wallet.cash += delta),
    newId: (() => {
      let n = 0;
      return () => `req-${++n}`;
    })(),
    onChange: (v) => views.push(v),
    now: () => clock,
    storage,
    enabled,
  });
  return { controller, server, wallet, views, last: () => views.at(-1), offline: () => (adapter = null), tick: (ms) => (clock += ms), state: server.state };
}

test("controller: a guest and a missing server are locked with their own words and ask nothing; a failed ask is offline with a retry", async () => {
  const guest = controllerSetup({ guest: true });
  await guest.controller.refresh();
  assert.deepEqual([guest.last().phase, guest.last().stateText, guest.last().rows], ["closed", webText("upgrades.lockedGuest"), []]);
  assert.deepEqual(guest.state.calls, []);
  const none = controllerSetup();
  none.offline();
  await none.controller.refresh();
  assert.deepEqual([none.last().phase, none.last().stateText], ["closed", webText("upgrades.lockedOffline")]);
  const down = controllerSetup();
  down.state.failNext = { ok: false, error: "offline", offline: true };
  await down.controller.refresh();
  assert.deepEqual([down.last().phase, down.last().stateText], ["offline", webText("upgrades.lockedOffline")]);
  assert.equal(down.controller.due(), false, "a failed ask waits its retry time");
  down.tick(DATA.retryMs);
  assert.equal(down.controller.due(), true);
  down.state.failNext = null;
  await down.controller.retry();
  assert.equal(down.last().phase, "ready");
  const signedOut = controllerSetup();
  signedOut.state.failNext = { ok: false, error: "signin" };
  await signedOut.controller.refresh();
  assert.equal(signedOut.last().stateText, webText("upgrades.lockedGuest"));
});

test("controller: ready shows one row per upgrade with its price, the cash, and the next level's effect", async () => {
  const t = controllerSetup({ server: mockServer({ levels: { stamina: 2 } }) });
  await t.controller.refresh();
  const v = t.last();
  assert.equal(v.phase, "ready");
  assert.equal(v.cashText, webText("upgrades.cash", { amount: 5000 }));
  assert.deepEqual(v.rows.map((r) => r.id), ["reserve-magazine", "stamina", "dodge-recovery"]);
  const stamina = v.rows[1];
  assert.deepEqual([stamina.level, stamina.price, stamina.levelText, stamina.nowText, stamina.nextText], [2, 1000, "Level 2 of 5", "Now: Stamina +20", "Next: Stamina +30"]);
  assert.equal(stamina.buttonText, "Buy for $1000");
  assert.equal(staminaBonus(), 20, "the server's levels are applied");
  assert.equal(v.rows[0].nowText, "Now: none yet");
});

test("controller: a purchase applies the level, moves the cash by the server's delta and says so; the hooks see it at once", async () => {
  const t = controllerSetup();
  await t.controller.refresh();
  await t.controller.buy("reserve-magazine");
  assert.equal(t.wallet.cash, 5000 - 400);
  assert.equal(upgradeLevel("reserve-magazine"), 1);
  assert.equal(carryCapOf("pistol-reserve"), LOCKER_RESOURCE_RULES["pistol-reserve"].carryCap + 6);
  assert.deepEqual([t.last().message.kind, t.last().message.text], ["ok", "Spare magazines is now level 1."]);
  assert.equal(t.last().rows[0].price, 900);
  assert.equal(t.last().cashText, webText("upgrades.cash", { amount: 4600 }));
});

test("controller: not enough cash is refused before the server is asked; the top level cannot be bought; a stale tap changes nothing", async () => {
  const t = controllerSetup({ wallet: { cash: 100 } });
  await t.controller.refresh();
  assert.equal(t.last().rows[0].canBuy, false);
  assert.equal(t.last().rows[0].buttonText, "Need $400");
  await t.controller.buy("reserve-magazine");
  assert.equal(t.last().message.text, webText("upgrades.error.insufficient-cash"));
  assert.deepEqual(t.state.calls, ["levels"]);
  const maxed = controllerSetup({ server: mockServer({ levels: { "dodge-recovery": 5 } }) });
  await maxed.controller.refresh();
  assert.deepEqual([maxed.last().rows[2].maxed, maxed.last().rows[2].canBuy, maxed.last().rows[2].buttonText], [true, false, webText("upgrades.maxed")]);
  await maxed.controller.buy("dodge-recovery");
  assert.equal(maxed.last().message.text, webText("upgrades.error.max-level"));
  await maxed.controller.buy("nonesuch");
  assert.equal(maxed.state.calls.filter((c) => c.startsWith("buy")).length, 0);
});

test("controller: a server refusal shows its words and an unknown code shows the general line; cash does not move", async () => {
  const t = controllerSetup();
  await t.controller.refresh();
  t.state.failNext = { ok: false, error: "rate-limited" };
  await t.controller.buy("stamina");
  assert.equal(t.last().message.text, webText("upgrades.error.rate-limited"));
  t.state.failNext = { ok: false, error: "something-new" };
  await t.controller.buy("stamina");
  assert.equal(t.last().message.text, webText("upgrades.error.refused"));
  assert.equal(t.wallet.cash, 5000);
  t.state.failNext = { ok: false, error: "guest" };
  await t.controller.buy("stamina");
  assert.equal(t.last().phase, "closed");
});

test("controller: an order with no verdict keeps its request id, so the retry replays and never charges twice", async () => {
  const t = controllerSetup();
  await t.controller.refresh();
  t.state.failNext = { ok: false, error: "offline", offline: true };
  await t.controller.buy("stamina");
  assert.equal(t.last().message.text, webText("upgrades.error.offline"));
  t.state.failNext = null;
  await t.controller.buy("stamina");
  const asked = t.state.calls.filter((c) => c.startsWith("buy"));
  assert.equal(asked.length, 2);
  assert.equal(asked[0], asked[1], "the same request id");
  assert.equal(t.wallet.cash, 5000 - 300);
  assert.equal(upgradeLevel("stamina"), 1);
  // a replayed answer (the first call did go through) is not charged again and the present levels are read
  const again = controllerSetup();
  await again.controller.refresh();
  const first = await again.server.buy("stamina", 1, "req-1");
  again.state.cash += 0;
  const wallet = again.wallet;
  await again.controller.buy("stamina");
  assert.equal(first.ok, true);
  assert.equal(again.last().message.text, webText("upgrades.replayed"));
  assert.equal(again.state.cash, 5000 - 300, "charged once");
  assert.equal(wallet.cash, 5000 - 300);
  await wait();
  assert.equal(again.state.calls.filter((c) => c === "levels").length, 2, "the present levels were read after the replay");
});

test("controller: the levels are kept in storage so they apply offline, and a later server answer replaces them", async () => {
  const records = new Map();
  const storage = { getItem: (k) => records.get(k) ?? null, setItem: (k, v) => records.set(k, v) };
  const first = controllerSetup({ storage, server: mockServer({ levels: { stamina: 2, "dodge-recovery": 1 } }) });
  await first.controller.refresh();
  assert.deepEqual(JSON.parse(records.get(DATA.cacheKey)), { stamina: 2, "dodge-recovery": 1 });
  setUpgradeLevels({});
  const second = controllerSetup({ storage, guest: true });
  assert.equal(staminaBonus(), 20, "a guest or offline start still applies the last known levels");
  assert.equal(second.last(), undefined);
  const third = controllerSetup({ storage, server: mockServer({ levels: {} }) });
  await third.controller.refresh();
  assert.equal(staminaBonus(), 0, "the server is the truth: a rolled-back account loses them");
  assert.deepEqual(JSON.parse(records.get(DATA.cacheKey)), {});
  assert.equal(readCachedLevels({ getItem: () => "{not json" }), null);
  assert.equal(readCachedLevels({ getItem: () => { throw new Error("blocked"); } }), null);
  assert.equal(readCachedLevels(null), null);
  const blocked = controllerSetup({ storage: { getItem: () => null, setItem: () => { throw new Error("full"); } }, server: mockServer({ levels: { stamina: 1 } }) });
  await blocked.controller.refresh();
  assert.equal(blocked.last().phase, "ready", "a full storage is never fatal");
});

test("controller: an answer is trusted for refreshSeconds, then the next safehouse visit asks again; disabled does nothing", async () => {
  const t = controllerSetup();
  assert.equal(t.controller.due(), true);
  await t.controller.refresh();
  assert.equal(t.controller.due(), false);
  t.tick(DATA.refreshMs - 1);
  assert.equal(t.controller.due(), false);
  t.tick(1);
  assert.equal(t.controller.due(), true);
  const off = controllerSetup({ enabled: false });
  assert.equal(off.controller.due(), false);
  await off.controller.refresh();
  assert.deepEqual(off.state.calls, []);
});

test("the api adapter: shapes both answers, maps 401 to signin, a 5xx and a thrown fetch to offline, and sends the bearer token", async () => {
  const sent = [];
  const answer = (status, body) => async (url, init) => {
    sent.push({ url, init });
    return { ok: status < 400, status, json: async () => body };
  };
  const make = (fetchImpl, token = "tok-123") => createUpgradesApi({ baseUrl: "/arma/api", getToken: async () => token, fetchImpl });
  const got = make(answer(200, { upgrades: [{ upgrade_id: "stamina", level: 2 }], cash: 7, bank: 3, ceiling: 10 }));
  assert.deepEqual(await got.levels(), { ok: true, levels: [{ id: "stamina", level: 2 }], cash: 7, bank: 3, ceiling: 10 });
  assert.equal(sent[0].url, `/arma/api/${DATA.api.calls.get}`);
  assert.equal(sent[0].init.headers.Authorization, "Bearer tok-123");
  const bought = make(answer(200, { ok: true, upgrade: "stamina", level: 3, delta: -600, upgrades: [{ upgrade_id: "stamina", level: 3 }], replayed: false }));
  assert.deepEqual(await bought.buy("stamina", 3, "req-aaaa-0001"), { ok: true, id: "stamina", level: 3, delta: -600, levels: [{ id: "stamina", level: 3 }], replayed: false, error: undefined });
  assert.deepEqual(JSON.parse(sent.at(-1).init.body), { upgrade_id: "stamina", to_level: 3, request_id: "req-aaaa-0001" });
  assert.equal(sent.at(-1).url, `/arma/api/${DATA.api.calls.buy}`);
  const refused = await make(answer(200, { ok: false, error: "insufficient-cash" })).buy("stamina", 1, "req-aaaa-0002");
  assert.deepEqual([refused.ok, refused.error], [false, "insufficient-cash"]);
  assert.deepEqual(await make(answer(401, {})).levels(), { ok: false, error: "signin" });
  assert.deepEqual(await make(answer(429, { error: "rate-limited" })).levels(), { ok: false, error: "rate-limited", offline: false });
  assert.deepEqual(await make(answer(503, null)).levels(), { ok: false, error: "refused", offline: true });
  assert.deepEqual(await make(async () => { throw new Error("down"); }).levels(), { ok: false, error: "offline", offline: true });
  assert.deepEqual(await make(answer(200, {}), null).levels(), { ok: false, error: "signin" });
  assert.equal(createUpgradesApi({ baseUrl: "", getToken: async () => "x" }), null);
  assert.equal(createUpgradesApi({ baseUrl: "/a" }), null);
});

class Node {
  constructor(tag) {
    Object.assign(this, { tag, children: [], hidden: false, textContent: "", className: "", disabled: false, listeners: {}, attrs: {}, type: "" });
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  all() {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  byClass(name) {
    return this.all().filter((n) => n.className.split(" ").includes(name));
  }
}
const doc = { createElement: (tag) => new Node(tag) };

test("the panel: cards for each upgrade with a 44px-class buy button, locked text when closed, and taps go to the controller", async () => {
  const t = controllerSetup();
  const host = new Node("section");
  const view = createUpgradesView({ doc, host, controller: t.controller });
  view.render(t.controller.view());
  assert.equal(host.byClass("upgrades-state")[0].textContent, webText("upgrades.loading"));
  assert.equal(host.byClass("upgrades-cash")[0].hidden, true);
  await t.controller.refresh();
  view.render(t.last());
  const buttons = host.byClass("upgrades-buy");
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => b.disabled), [false, false, false]);
  assert.equal(host.byClass("upgrades-cash")[0].textContent, webText("upgrades.cash", { amount: 5000 }));
  buttons[1].listeners.click();
  await wait();
  view.render(t.last());
  assert.equal(upgradeLevel("stamina"), 1);
  assert.equal(host.byClass("upgrades-note")[0].textContent, "Stamina is now level 1.");
  assert.equal(host.byClass("upgrades-note")[0].className, "upgrades-note ok");
  const down = controllerSetup();
  down.state.failNext = { ok: false, error: "offline", offline: true };
  await down.controller.refresh();
  const h2 = new Node("section");
  const v2 = createUpgradesView({ doc, host: h2, controller: down.controller });
  v2.render(down.last());
  assert.equal(h2.byClass("upgrades-buy").length, 0);
  assert.equal(h2.byClass("upgrades-retry").length, 1);
  assert.equal(createUpgradesView({ doc, host: null, controller: t.controller }).render(), undefined, "no host, no panel");
});

test("the wiring: the panel shows only at the safehouse, the stamina hook runs every frame even when the panel is off, and a guest asks nothing", async () => {
  const server = mockServer({ levels: { stamina: 1 } });
  const host = new Node("section");
  let guest = false;
  const wallet = { cash: 5000 };
  const make = (extra = {}) =>
    createUpgrades({ doc, host, api: () => server, isGuest: () => guest, localCash: () => wallet.cash, onCash: () => {}, storage: null, search: "", enabled: true, ...extra });
  const player = { maxStamina: 100, stamina: 100 };
  const away = { loaded: true, game: { player, world: {} } };
  const ups = make();
  ups.update({ loaded: false, game: null });
  assert.equal(host.hidden, true);
  ups.update({ ...away, game: { player, world: {} } });
  assert.equal(host.hidden, true, "no safehouse region in this fake game: the panel stays hidden");
  assert.equal(player.maxStamina, 100);
  await wait();
  assert.equal(server.state.calls.length, 1, "a signed-in player's levels are fetched in the background");
  assert.equal(staminaBonus(), 10);
  ups.update(away);
  assert.equal(player.maxStamina, 110, "the stamina upgrade reaches the player on the next frame");
  guest = true;
  server.state.calls.length = 0;
  const g = make();
  g.update(away);
  await wait();
  assert.deepEqual(server.state.calls, [], "a guest asks nothing in the background");
  const off = make({ search: `?${DATA.offParam}=${DATA.offValue}` });
  const p2 = { maxStamina: 100, stamina: 100 };
  off.update({ loaded: true, game: { player: p2, world: {} } });
  assert.equal(p2.maxStamina, 110, "switching the panel off keeps the levels already known");
  assert.equal(host.hidden, true);
});
