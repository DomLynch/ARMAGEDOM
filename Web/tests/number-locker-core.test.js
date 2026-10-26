import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lockerInventory } from "../src/engine/locker-core.js";
import { LOCKER_WEAPON_IDS } from "../src/engine/locker-state.js";
import { REAPER_ITEM_ID, REAPER_RECEIPT } from "../src/engine/reaper.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/locker-core.js 9 to 0 (value-identical). The weapon slots were bare indices (set(2, ...), { 4: "shotgun" ... }); they are now
// named from LOCKER_WEAPON_IDS, so the order of the saved weapon list is the only place the slots live. The save format version 12 stays,
// marked. The old function is pinned below from origin/main (6ef69996) and compared on a spread of game states.
const oldInventory = (g) => {
  const bossFields = { 4: "shotgun", 5: "grenade", 6: "surgicalKnife", 7: "rocketLauncher" };
  const weapons = Object.fromEntries(LOCKER_WEAPON_IDS.map((id) => [id, { owned: false, equipped: false }]));
  const set = (i, owned, equipped) => (weapons[LOCKER_WEAPON_IDS[i]] = { owned: !!owned, equipped: !!equipped });
  set(0, g.pistol?.collected, g.pistol?.equipped);
  set(1, g.rifle?.status === "owned", g.rifle?.selected);
  set(2, g.flameFuel?.collected, g.flame?.equipped || g.bossEquipment?.emberProjector?.selected);
  set(3, g.uniqueReward?.status === "owned", g.uniqueReward?.selectedMeleeVariant === LOCKER_WEAPON_IDS[3]);
  for (const [i, field] of Object.entries(bossFields))
    set(+i, g.bossEquipment?.[field]?.status === "owned", g.bossEquipment?.[field]?.selected);
  set(
    8,
    g.expedition?.status === "claimed" && g.expedition.rewardReceipt === REAPER_RECEIPT,
    g.expedition?.status === "claimed" && g.expedition.selectedPistolVariant === REAPER_ITEM_ID,
  );
  set(9, g.bossEquipment?.commanderPistol?.status === "owned", g.bossEquipment?.commanderPistol?.selected);
  return {
    weapons,
    ammo: {
      "railgun-reserve": g.bossEquipment?.commanderPistol?.reserve ?? 0,
      "pistol-reserve": g.pistol?.reserve ?? 0,
      "rifle-reserve": g.rifle?.reserve ?? 0,
      "shotgun-reserve": g.bossEquipment?.shotgun?.reserve ?? 0,
      "rocket-reserve": g.bossEquipment?.rocketLauncher?.reserve ?? 0,
      "grenade-charges": g.bossEquipment?.grenade?.magazine ?? 0,
      "flame-fuel": g.flameFuel?.fuelUnits ?? 0,
    },
  };
};

const owned = (extra = {}) => ({ status: "owned", selected: true, reserve: 5, magazine: 2, ...extra });
const states = {
  empty: {},
  starter: { pistol: { collected: true, equipped: true, reserve: 12 } },
  rifle: { pistol: { collected: true }, rifle: { status: "owned", selected: true, reserve: 7 } },
  flame: { flameFuel: { collected: true, fuelUnits: 345.5 }, flame: { equipped: true } },
  flameByProjector: { flameFuel: { collected: true }, bossEquipment: { emberProjector: { selected: true } } },
  cleaver: { uniqueReward: { status: "owned", selectedMeleeVariant: LOCKER_WEAPON_IDS[3] } },
  cleaverOtherVariant: { uniqueReward: { status: "owned", selectedMeleeVariant: "something-else" } },
  bossAll: {
    bossEquipment: {
      shotgun: owned(),
      grenade: owned(),
      surgicalKnife: owned({ selected: false }),
      rocketLauncher: owned({ reserve: 3 }),
      commanderPistol: owned({ reserve: 2 }),
    },
  },
  reaperClaimed: { expedition: { status: "claimed", rewardReceipt: REAPER_RECEIPT, selectedPistolVariant: REAPER_ITEM_ID } },
  reaperOther: { expedition: { status: "claimed", rewardReceipt: "other", selectedPistolVariant: "other" } },
  reaperPending: { expedition: { status: "open", rewardReceipt: REAPER_RECEIPT, selectedPistolVariant: REAPER_ITEM_ID } },
};

test("lockerInventory gives the old answer on every state, weapon order included", () => {
  for (const [name, g] of Object.entries(states)) {
    const now = lockerInventory(g);
    assert.deepEqual(now, oldInventory(g), name);
    assert.deepEqual(Object.keys(now.weapons), [...LOCKER_WEAPON_IDS], `${name}: weapon order`);
  }
});

test("the gate counts 0 in locker-core.js (one marked save version) and the baseline entry is gone", () => {
  const r = countNumberLiterals(fs.readFileSync(new URL("../src/engine/locker-core.js", import.meta.url), "utf8"));
  assert.equal(r.count, 0);
  assert.equal(r.reasons.length, 1);
  assert(/save format version/.test(r.reasons[0]));
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  assert(!("engine/locker-core.js" in baseline.numberLiterals));
});
