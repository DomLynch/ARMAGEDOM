import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";

// A weapon or combat number in a player text is a {placeholder} filled from weapons.json / combatRules.json, so the text cannot drift
// from what the weapon does. The digits left in the text files are the ones with no data source; adding another fails this test.
const NO_DATA_SOURCE = new Set([
  "webText hud.assistOn: Assist: 100%",
  "webText hud.menuArea: {area} · LONDON 2030",
  "webText hud.mastery: {label} MASTERY {level}/100 · +{bonus}%",
  "webText hud.weaponMastery: Knife {knife}/100 (+{knifeBonus}% mastery damage) · Pistol {pistol}/100 (+{pistolBonus}% mastery damage). Combined damage bonus: +{combined}%.",
  "sessionText browser.versionLabel: Three.js · Starting pistol V1 · Approved006 framing",
  "combatText layerMessages.bossEquipment.base: Boss equipment requires existing v9",
  "combatText layerMessages.rifle.base: Rifle requires existing v8",
  "combatText layerMessages.uniqueReward.base: Unique reward requires base v6",
]);

function* strings(value, path = "") {
  if (typeof value === "string") yield [path, value];
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

test("player text carries no typed weapon or combat number beyond the listed ones", () => {
  const found = new Set();
  for (const [file, data] of [
    ["webText", GAME_DATA.webText.texts],
    ["sessionText", GAME_DATA.sessionText],
    ["combatText", GAME_DATA.combatText],
  ])
    for (const [path, text] of strings(data)) if (/\d/.test(text)) found.add(`${file} ${path}: ${text}`);
  assert.deepEqual([...found].filter((line) => !NO_DATA_SOURCE.has(line)), []);
});
