import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA, fillText } from "../src/engine/game-data.js";
import { validateWeaponViewText } from "../src/engine/game-data-weapon-view-text.js";

const text = () => structuredClone(GAME_DATA.weaponViewText);

test("unique reward (cleaver) text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.weaponViewText.uniqueReward;
  assert.equal(GAME_DATA.combatText.rewardNames.cleaver, "Pitborn Cleaver");
  assert.equal(fillText(t.equipped, { name: "Pitborn Cleaver" }), "Pitborn Cleaver equipped.");
  assert.equal(t.cleaverLoadFailed, "Cleaver loading unavailable. Pending drop kept; retry in Gear.");
  assert.equal(t.weaponLoadFailed, "Weapon loading unavailable. Selection kept; tap Equip to retry.");
  assert.equal(t.fallbackName, "Weapon");
  assert.equal(t.stateRetry, "Pitborn Cleaver loading failed. Retry loading below, then collect it in East.");
  assert.equal(t.statePending, "Hale dropped the Pitborn Cleaver. Collect it in East.");
  assert.equal(t.stateLegacyDead, "Hale was already defeated in this run. A new kill after Retry can earn his cleaver.");
  assert.equal(
    fillText(t.stateOwned, { name: "Knife", status: t.storedForMelee }),
    "Knife stored for melee. Earned weapon retained across Retry.",
  );
  assert.equal(fillText(t.stateOwned, { name: "Knife", status: t.ownedEquipped }), "Knife equipped. Earned weapon retained across Retry.");
  assert.equal(t.stateLocked, "Defeat Hale in East to earn his unique cleaver. Supply-case progress is separate.");
  assert.equal(fillText(t.buttonStored, { name: "Knife" }), "Stored · Knife");
  const button = (action) => fillText(t.button, { action: t.actions[action], name: "Knife" });
  assert.equal(button("loading"), "Loading · Knife");
  assert.equal(button("retryLoading"), "Retry loading · Knife");
  assert.equal(button("loadWeapon"), "Load weapon · Knife");
  assert.equal(button("equipped"), "Equipped · Knife");
  assert.equal(button("equip"), "Equip · Knife");
  assert.equal(button("locked"), "Locked · Knife");
  assert.equal(
    fillText(t.comparison, { name: "Knife", slash: 12.5, heavy: 30, slashCost: 8, heavyCost: 20 }),
    "Knife: Slash 12.5 / Heavy 30 damage · stamina 8/20",
  );
  assert.equal(t.collectLabel, "Collect Pitborn Cleaver");
});

test("flamethrower text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.weaponViewText.flame;
  const benefit = fillText(t.benefit, { damage: 10, interval: 0.2, range: 3 });
  assert.equal(benefit, "10 damage per 0.2s contact · 3m range");
  assert.equal(t.name, "Flamethrower");
  assert.equal(t.outOfFuel, "Flamethrower is out of fuel.");
  assert.equal(t.loadFailed, "Could not load flamethrower. Try Equip again.");
  assert.equal(t.ready, "Ember Projector ready · hold Flame to fire.");
  assert.equal(
    fillText(t.stateLocked, { benefit }),
    "Defeat the Ember Matron to earn the Ember Projector. 10 damage per 0.2s contact · 3m range.",
  );
  assert.equal(t.stateEmpty, "Fuel exhausted. Your normal weapon remains available.");
  assert.equal(
    fillText(t.stateOwned, { status: t.statusEquipped, benefit, fuel: 45, seconds: (9 / 2).toFixed(1) }),
    "Equipped · 10 damage per 0.2s contact · 3m range · fuel 45% (4.5s left). Spent fuel stays spent after Retry.",
  );
  assert.equal(
    fillText(t.stateOwned, { status: t.statusStored, benefit, fuel: 100, seconds: "12.0" }),
    "Stored · 10 damage per 0.2s contact · 3m range · fuel 100% (12.0s left). Spent fuel stays spent after Retry.",
  );
  assert.equal(t.buttonStored, "Stored in safehouse");
  assert.equal(t.buttonLoading, "Loading flamethrower…");
  assert.equal(t.buttonLower, "Return to normal weapon");
  assert.equal(t.buttonRetry, "Retry loading & equip flamethrower");
  assert.equal(t.buttonEmpty, "Empty flamethrower");
  assert.equal(t.buttonEquip, "Equip Ember Projector");
  assert.equal(t.collectLabel, "Collect Flamethrower");
});

test("boss equipment text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.weaponViewText.bossEquipment;
  assert.equal(t.loadFailed, "Weapon loading unavailable. Your reward is kept; retry in Gear.");
  assert.equal(fillText(t.equipped, { name: "Thundercoil Arc Gun" }), "Thundercoil Arc Gun equipped.");
  assert.equal(t.returned, "Returned to your normal weapon.");
  assert.equal(
    fillText(t.railgunStats, {
      damage: 60, jumps: 3, range: 18, charge: 0.8, cadence: 1.5, magazine: 2, capacity: 4, reserve: 6, reload: 2.4,
    }),
    "60 arc damage, jumps 3x and stuns · 18m · 0.8s charge · 1.5s recovery · 2/4 loaded · 6 reserve · 2.4s reload. Hold FIRE; release when ready. Early release or cancellation does not fire. Cover blocks the bolt; pistol ammunition is kept.",
  );
  assert.equal(
    fillText(t.sawStats, { damage: 7, interval: 0.25 }),
    "Hold CUT · close saw contact · 7 damage / 0.25s · slowed while cutting · sustained contact staggers",
  );
  assert.equal(t.legacyPending, " · Witch drop awaiting collection.");
  assert.equal(t.legacyUnclaimed, " · Witch reward unclaimed.");
  assert.equal(fillText(t.statePending, { boss: "Witch" }), "Dropped by Witch. Approach and collect it.");
  assert.equal(
    fillText(t.stateLegacyDead, { boss: "Witch" }),
    "Witch was already defeated. A new defeat after Retry can earn this reward.",
  );
  assert.equal(fillText(t.stateLocked, { boss: "Witch" }), "Defeat Witch to earn this weapon.");
  assert.equal(fillText(t.stateLocked, { boss: undefined }), "Defeat " + undefined + " to earn this weapon.");
  assert.equal(t.buttonStored, "Stored in safehouse");
  assert.equal(t.buttonLoading, "Loading weapon…");
  assert.equal(t.buttonRetry, "Retry weapon loading");
  assert.equal(t.buttonLower, "Return to normal weapon");
  assert.equal(fillText(t.buttonEquip, { name: "Bone Saw" }), "Equip Bone Saw");
});

test("rifle text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.weaponViewText.rifle;
  assert.equal(t.name, "Bridge Rifle");
  assert.equal(t.loadFailed, "Rifle loading unavailable. Selection and ammunition kept; retry in Gear.");
  assert.equal(t.equipped, "RIFLE EQUIPPED");
  assert.equal(t.returned, "Returned to melee.");
  assert.equal(
    fillText(t.stateOwned, { name: "Bridge Rifle", damage: 45, magazine: 3, capacity: 5, reserve: 10 }),
    "Bridge Rifle · 45 damage · 3/5 loaded · 10 reserve. Spent ammunition stays spent on Retry.",
  );
  assert.equal(t.statePending, "Bridge Warden dropped a Rifle. Approach it and collect it.");
  assert.equal(t.stateLegacyDead, "Bridge Warden was already defeated. A new defeat after Retry can drop the Rifle.");
  assert.equal(t.stateLocked, "Defeat Bridge Warden to earn the Rifle.");
  assert.equal(t.buttonStored, "Stored in safehouse");
  assert.equal(t.buttonLoading, "Preparing rifle…");
  assert.equal(t.buttonRetry, "Retry rifle loading");
  assert.equal(t.buttonLower, "Return to melee");
  assert.equal(t.buttonEquip, "Equip rifle");
});

test("reaper drone text reads string-equal to the text that was in code", () => {
  const t = GAME_DATA.weaponViewText.reaper;
  assert.equal(
    fillText(t.stateOwned, { damage: 12, range: 16, cadence: 1.2 }),
    "12 damage · 16m · 1.2s firing interval. Autonomous companion; prefers your selected target. Uses its own powered bolts; pistol ammunition is kept.",
  );
  assert.equal(t.stateLocked, "Complete Stolen Supplies to earn this companion.");
  assert.equal(t.buttonStored, "Stored in safehouse");
  assert.equal(t.buttonRecall, "Recall Reaper Drone");
  assert.equal(t.buttonDeploy, "Deploy Reaper Drone");
});

test("the validator rejects a missing key, wrong placeholders, empty text and unknown keys", () => {
  validateWeaponViewText(text());
  const bad = [
    (d) => delete d.rifle.buttonEquip,
    (d) => delete d.uniqueReward.actions.locked,
    (d) => delete d.reaper,
    (d) => (d.rifle.stateOwned = "{name} · {damage} damage"),
    (d) => (d.bossEquipment.statePending = "Dropped by {name}. Approach and collect it."),
    (d) => (d.flame.buttonEquip = "Equip {name}"),
    (d) => (d.flame.outOfFuel = ""),
    (d) => (d.reaper.buttonDeploy = 7),
    (d) => (d.flame.extra = "Extra text"),
    (d) => (d.extraSection = {}),
  ];
  for (const mutate of bad) {
    const d = text();
    mutate(d);
    assert.throws(() => validateWeaponViewText(d));
  }
});
