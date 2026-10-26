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
