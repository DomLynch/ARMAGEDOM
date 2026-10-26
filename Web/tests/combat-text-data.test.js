import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { fillText, validateCombatText } from "../src/engine/game-data-combat-text.js";

const text = () => structuredClone(GAME_DATA.combatText);

test("exit gate prompts read string-equal to the text that was in code", () => {
  const t = GAME_DATA.combatText.exitGate;
  assert.equal(fillText(t.needsKill, { name: "Witch" }), "Kill the Witch");
  assert.equal(fillText(t.needsVisit, { destination: "Central Hub" }), "Visit Central Hub first");
  assert.equal(t.saveUnavailable, "Saving unavailable. Exit locked.");
});

test("save-layer rejection messages read string-equal to the text that was in code", () => {
  assert.deepEqual({ ...GAME_DATA.combatText.layerMessages.bossEquipment }, {
    envelope: "Invalid boss equipment envelope",
    base: "Boss equipment requires existing v9",
    snapshot: "Invalid equipment snapshot",
  });
  assert.deepEqual({ ...GAME_DATA.combatText.layerMessages.rifle }, {
    envelope: "Invalid rifle envelope",
    base: "Rifle requires existing v8",
    snapshot: "Invalid rifle snapshot",
  });
  assert.deepEqual({ ...GAME_DATA.combatText.layerMessages.uniqueReward }, {
    envelope: "Invalid unique reward envelope",
    base: "Unique reward requires base v6",
    snapshot: "Invalid unique reward snapshot",
  });
});

test("HUD and gear text read string-equal to the text that was in code", () => {
  const { hud, gear } = GAME_DATA.combatText;
  assert.equal(hud.emptyReload, "EMPTY · Reload.");
  assert.equal(hud.outOfAmmo, "OUT OF AMMO · Switch to melee.");
  assert.equal(hud.parry, "PARRY · Counter while they recover.");
  assert.equal(hud.guardBroken, "GUARD BROKEN · Dodge or make space.");
  assert.equal(hud.hollowCleared, "LONDON · Hollow encounter cleared.");
  assert.equal(fillText(hud.bossDefeated, { name: "Witch" }) + hud.suppliesAwait, "Witch defeated. Supplies await near the body.");
  assert.equal(fillText(hud.waveCleared, { hp: 5 }), "WAVE CLEARED · +5 HP");
  assert.equal(fillText(hud.wave, { wave: 2, final: 3 }), "WESTMINSTER · Wave 2/3");
  assert.equal(fillText(hud.blade, { pct: 12 }), "BLADE +12% damage");
  assert.equal(fillText(hud.armour, { hp: 8 }), "ARMOUR +8 max HP");
  assert.equal(fillText(hud.tonic, { hp: 9 }), "TONIC +9 HP");
  assert.equal(hud.warlord, "ORC WARLORD · Dodge, then strike.");
  assert.equal(hud.enterCombat, "Move to enter combat. Survive three waves.");
  assert.equal(fillText(gear.charges, { count: 2 }), "2 charges");
  assert.equal(fillText(gear.empty, { name: "Rifle" }), "Rifle is empty.");
  assert.equal(gear.equippedSuffix + gear.tapToEquip, " · equipped · tap to equip");
  assert.equal(fillText(gear.collected, { name: "Rifle" }), "Rifle collected.");
  assert.equal(fillText(gear.collectedEquipInGear, { name: "Rifle" }), "Rifle collected. Equip it in Gear.");
  assert.equal(fillText(gear.equipped, { name: "Rifle" }), "Rifle equipped.");
  assert.equal(gear.startPistolLabel, "Collect Starting Pistol");
  assert.equal(gear.iconCaptions["surgeons-knife-v1"], "BONE SAW");
  assert.equal(gear.iconCaptions["borough-marshals-pistol-v1"], "ARC GUN");
});

test("hunter, flame boss and reward text read string-equal to the text that was in code", () => {
  const t = GAME_DATA.combatText;
  assert.equal(t.markedHunter.warning, "HUNTER INBOUND · find cover or reach a safehouse.");
  assert.equal(t.markedHunter.arrived, "A hunter is after you");
  assert.equal(fillText(t.bossFlame.warning, { name: t.bossFlame.defaultBossName }), "SALAMANDER · FLAME BURST — MOVE ASIDE");
  assert.equal(fillText(t.bossFlame.warning, { name: "WITCH" }), "WITCH · FLAME BURST — MOVE ASIDE");
  assert.deepEqual({ ...t.rewardNames }, { cleaver: "Pitborn Cleaver", reaper: "Reaper Drone" });
});

test("the validator rejects empty text, wrong placeholders and unknown keys", () => {
  validateCombatText(text());
  const bad = [
    (d) => (d.exitGate.needsKill = ""),
    (d) => (d.exitGate.needsKill = "Kill the boss"),
    (d) => (d.exitGate.needsVisit = "Visit {place} first"),
    (d) => (d.exitGate.saveUnavailable = "Locked {name}"),
    (d) => (d.layerMessages.rifle.base = 7),
    (d) => (d.layerMessages.extra = {}),
    (d) => delete d.layerMessages.rifle.snapshot,
  ];
  for (const mutate of bad) {
    const d = text();
    mutate(d);
    assert.throws(() => validateCombatText(d));
  }
});
