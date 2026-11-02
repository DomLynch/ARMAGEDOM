import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA, fillText } from "../src/engine/game-data.js";
import { checkSafehouseNameIds, validateSafehouseText } from "../src/engine/game-data-safehouse-text.js";
import { LOCKER_RESOURCE_RULES, LOCKER_WEAPON_IDS } from "../src/engine/locker-state.js";

const text = () => structuredClone(GAME_DATA.safehouseText);

test("safehouse locker text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.safehouseText.safehouse;
  assert.equal(t.interactAria, "Open safehouse");
  assert.equal(t.interactLabel, "Open Safehouse");
  assert.equal(t.statusUnavailable, "Storage is available anywhere on the safehouse landing.");
  assert.equal(t.statusReady, "Transfers save immediately. Equipped weapons must be put away first.");
  assert.equal(t.saveUnavailable, "Saving unavailable. Everything was kept.");
  assert.equal(t.transferUnavailable, "Transfer unavailable. Your equipment was kept.");
  assert.equal(t.amountUnavailable, "Choose an available amount within the carrying and locker limits.");
  assert.deepEqual([t.stored, t.equipped, t.carried, t.store, t.retrieve], ["Stored", "Equipped", "Carried", "Store", "Retrieve"]);
  assert.equal(fillText(t.weaponRow, { name: "Bridge Rifle", state: t.stored }), "Bridge Rifle · Stored");
  assert.equal(
    fillText(t.resourceRow, { title: "Flame fuel", carried: 12.5, stored: 0 }),
    "Flame fuel · carried 12.5 · stored 0",
  );
  assert.equal(fillText(t.amountAria, { title: "Rifle reserve" }), "Rifle reserve transfer amount");
});

test("locker weapon and supply names keep the old order and wording", () => {
  const t = GAME_DATA.safehouseText.safehouse;
  assert.deepEqual(
    LOCKER_WEAPON_IDS.map((id) => t.weaponNames[id]),
    [
      "Starting pistol · shared variants",
      "Bridge Rifle",
      "Ember Projector",
      "Pitborn Cleaver",
      "Stalker Shotgun",
      "Grenades",
      "The Bone Saw",
      "Rocket Launcher",
      "Reaper Drone",
      "Light Machine Gun",
    ],
  );
  assert.deepEqual(Object.keys(LOCKER_RESOURCE_RULES).map((id) => [id, t.resourceNames[id]]), [
    ["railgun-reserve", "Railgun reserve"],
    ["pistol-reserve", "Pistol reserve"],
    ["rifle-reserve", "Rifle reserve"],
    ["shotgun-reserve", "Shotgun reserve"],
    ["rocket-reserve", "Rocket reserve"],
    ["grenade-charges", "Grenade charges"],
    ["flame-fuel", "Flame fuel"],
  ]);
});

test("marked cash and supplies text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.safehouseText.marked;
  assert.equal(t.saveUnavailable, "Saving unavailable. Cash and supplies were kept.");
  assert.equal(t.purchaseUnavailable, "This purchase is unavailable. Bank cash and check supply capacity.");
  assert.equal(t.title, "Cash & supplies");
  assert.equal(t.bank, "Bank carried cash");
  assert.equal(
    t.hint,
    "Banking does not clear your bounty. Death loses carried cash and clears the hunt; banked cash and earned gear stay.",
  );
  assert.equal(
    fillText(t.summary, { carried: "$1,200", bank: "$50" }) + fillText(t.bountySuffix, { bounty: "$300" }),
    "Carried $1,200 · Bank $50 · Bounty $300",
  );
  assert.deepEqual(Object.entries(t.shopNames), [
    ["pistol", "Pistol reserve"],
    ["rifle", "Rifle reserve"],
    ["dressing", "Heal"],
  ]);
  assert.equal(
    fillText(t.shopButton, { name: "Pistol reserve", amount: 12, unit: t.roundsUnit, price: "$40" }),
    "Pistol reserve +12 rounds · $40",
  );
  assert.equal(fillText(t.shopButton, { name: "Heal", amount: 25, unit: t.healUnit, price: "$60" }), "Heal +25 HP · $60");
  assert.equal(t.statusUnavailable, "Banking and purchases are available inside a protected safehouse.");
  assert.equal(t.statusReady, "Purchases use banked cash and save immediately.");
});

test("the validator rejects a missing key, a wrong placeholder and unknown keys", () => {
  validateSafehouseText(text());
  const bad = [
    (d) => delete d.safehouse.interactLabel,
    (d) => (d.marked.shopNames = {}),
    (d) => (d.safehouse.weaponNames["standard-grenade-v1"] = ""),
    (d) => (d.safehouse.resourceRow = "{title} · carried {carried}"),
    (d) => (d.safehouse.amountAria = "{name} transfer amount"),
    (d) => (d.marked.title = "Cash {name}"),
    (d) => (d.marked.bank = ""),
    (d) => (d.marked.extra = "Extra"),
  ];
  for (const mutate of bad) {
    const d = text();
    mutate(d);
    assert.throws(() => validateSafehouseText(d));
  }
});

test("weapon and supply names must cover exactly the locker's own ids", () => {
  const { weaponNames, resourceNames } = text().safehouse;
  const resourceIds = Object.keys(GAME_DATA.locker.resourceCaps);
  checkSafehouseNameIds(weaponNames, LOCKER_WEAPON_IDS, "weaponNames");
  checkSafehouseNameIds(resourceNames, resourceIds, "resourceNames");
  const missing = { ...weaponNames };
  delete missing["standard-grenade-v1"];
  assert.throws(() => checkSafehouseNameIds(missing, LOCKER_WEAPON_IDS, "weaponNames"));
  assert.throws(() => checkSafehouseNameIds({ ...resourceNames, extra: "Extra" }, resourceIds, "resourceNames"));
  assert.throws(() => checkSafehouseNameIds(resourceNames, [...resourceIds, "new-reserve"], "resourceNames"));
});
