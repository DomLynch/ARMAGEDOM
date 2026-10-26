import test from "node:test";
import assert from "node:assert/strict";
import { webText } from "../src/engine/web-text.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// The strings hud.js built in code before they moved to data/webText.json: the on-screen text must not change.
const HUD = [
  ["hud.resetting", {}, "Starting fresh…"],
  ["hud.resetFailed", {}, "Reset failed. Your current run was kept."],
  ["hud.soundOn", {}, "Sound on"],
  ["hud.soundOff", {}, "Sound off"],
  ["hud.assistOn", {}, "Assist: 100%"],
  ["hud.assistOff", {}, "Assist: Off"],
  ["hud.retryLoading", {}, "Retry loading"],
  ["hud.guardBroken", {}, "GUARD BROKEN"],
  ["hud.lowStamina", { label: "Dodge Roll" }, "Dodge Roll · Low stamina"],
  ["hud.menuArea", { area: "WESTMINSTER" }, "WESTMINSTER · LONDON 2030"],
  ["hud.areaCleared", { area: "East" }, "East · cleared"],
  ["hud.areaEnemies", { area: "East", count: "1 enemy" }, "East · 1 enemy"],
  ["hud.enemyCount.one", { count: 1 }, "1 enemy"],
  ["hud.enemyCount.other", { count: 3 }, "3 enemies"],
  ["hud.masteryNone", { weapon: "RIFLE" }, "RIFLE · no mastery bonus"],
  ["hud.mastery", { label: "KNIFE", level: 12, bonus: 6 }, "KNIFE MASTERY 12/100 · +6%"],
  ["hud.attributes", { attributes: "Strength 5 · Intelligence 5" }, "Strength 5 · Intelligence 5. Intelligence has no effect in this pilot."],
  [
    "hud.weaponMastery",
    { knife: 10, knifeBonus: 5, pistol: 20, pistolBonus: 8, combined: 5 },
    "Knife 10/100 (+5% mastery damage) · Pistol 20/100 (+8% mastery damage). Combined damage bonus: +5%.",
  ],
  ["hud.guardUnavailable.weapon", { name: "Rocket Launcher" }, "Guard unavailable with Rocket Launcher"],
  [
    "hud.ammo.pistol",
    { name: "STARTING PISTOL", magazine: 6, capacity: 6, reserve: 12, reloading: " · RELOADING" },
    "STARTING PISTOL · 6 / 6 · 12 RESERVE · RELOADING",
  ],
  ["hud.ammo.standard", { name: "RIFLE", magazine: 5, capacity: 8, reserve: 20, reloading: "" }, "RIFLE · 5/8 · 20 RESERVE"],
  [
    "hud.ammo.grenade",
    { mode: "STICKY", magazine: 4, fuse: GAME_DATA.weapons.ranged["standard-grenade-v1"].payload.fuseSeconds },
    "STICKY GRENADES · 4 LEFT · 1s FUSE",
  ],
  ["hud.ammo.ember", { percent: 80 }, "EMBER · FUEL 80%"],
  ["hud.left", { count: 3 }, "3 left"],
  [
    "hud.fire.pistolLabel",
    { magazine: 6, capacity: 6, reserve: 12, reloading: "; reloading" },
    "Fire; 6 of 6 loaded, 12 reserve; reloading; left stick aims, Fire only shoots, mouse aims on desktop",
  ],
  ["hud.fire.rifle", { magazine: 5, reserve: 20 }, "Fire rifle once; 5 loaded and 20 reserve"],
  ["hud.fire.grenade", { magazine: 4 }, "Throw one grenade; 4 left"],
  ["hud.fire.boss", { kind: "rocket", magazine: 2 }, "Fire rocket once; 2 loaded"],
  ["hud.grenadeMode", { mode: "Sticky" }, "Switch grenade mode; Sticky selected"],
  ["hud.grenadeRange", { ranges: "3, 5 or 8" }, "Cycle touch throw range: 3, 5 or 8 metres"],
  [
    "hud.arcCharge",
    { seconds: 1.5 },
    "Hold to charge Thundercoil Arc Gun for 1.5 seconds; release when ready; early release cancels",
  ],
  ["hud.flameFire", { percent: 90 }, "Hold to fire flamethrower; fuel 90 percent"],
  ["hud.boneSawCut", {}, "Hold to cut with the Bone Saw; movement slows while cutting"],
  ["hud.safehouseLowered", {}, "SAFEHOUSE · WEAPONS LOWERED"],
  ["hud.pickUpAndEquipPistol", {}, "PICK UP & EQUIP PISTOL"],
  ["hud.ashClaimsYou", {}, "THE ASH CLAIMS YOU"],
  ["hud.deathHint", {}, "Watch their wind-up. Dodge, then strike."],
];

test("hud lines read from data are string-equal to the old literals", () => {
  for (const [id, vars, expected] of HUD) assert.equal(webText(id, vars), expected, id);
});
