import test from "node:test";
import assert from "node:assert/strict";
import { webText } from "../src/engine/web-text.js";
import { GAME_DATA } from "../src/engine/game-data.js";

const RANGED = GAME_DATA.weapons.ranged,
  GRENADE = RANGED["standard-grenade-v1"],
  ROCKET = RANGED["borough-butchers-rocket-launcher-v1"],
  SHOTGUN = RANGED["south-stalker-shotgun-v1"];

// The strings run-views.js, remote-players-view.js and effects.js built in code before they moved to data/webText.json.
const LINES = [
  [
    "summary.boneSaw",
    { name: "The Bone Saw", damage: 12.5, interval: 0.4 },
    "The Bone Saw · Hold CUT · 12.5 damage / 0.4s contact · slowed while cutting",
  ],
  ["summary.melee", { name: "Knife", slash: 8, heavy: 14.5 }, "Knife · Slash 8 · Heavy 14.5"],
  ["summary.vestWorn", { percent: 10 }, "Worn vest · 10% hit protection"],
  ["summary.vestNone", { kills: 5 }, "No vest · Westminster stash after 5 kills; pickup equips it."],
  [
    "summary.flame",
    { name: "Ember Projector", fuel: 80, damage: 6, interval: 0.25 },
    "Ember Projector · 80% fuel · 6 damage per 0.25s contact",
  ],
  [
    "summary.lmg",
    { name: "Light Machine Gun", damage: 5, range: 14, magazine: 2, capacity: 3, reserve: 9 },
    "Light Machine Gun · 5 damage per bullet · 14m · hold to fire · 2/3 loaded · 9 reserve",
  ],
  // The weapon stats in these three lines are filled from data/weapons.json; the expected text is the old literal, so a data change
  // that no longer matches today's text shows up here.
  [
    "summary.grenade",
    { name: "Grenade", magazine: 4, fuse: GRENADE.payload.fuseSeconds, radius: GRENADE.payload.radius },
    "Grenade · 4 charges · 1s fuse · 3m radius",
  ],
  [
    "summary.rocket",
    {
      name: "Rocket Launcher",
      magazine: 1,
      reserve: 3,
      damage: ROCKET.payload.maxDamage,
      radius: ROCKET.payload.radius,
      capacity: ROCKET.rules.capacity,
      reload: ROCKET.rules.reload,
    },
    "Rocket Launcher · 80 blast damage · 3m radius · 1/1 loaded · 3 reserve · 3.2s reload",
  ],
  [
    "summary.shotgun",
    {
      name: "Stalker Shotgun",
      magazine: 2,
      reserve: 8,
      pellets: SHOTGUN.payload.pelletCount,
      pelletDamage: SHOTGUN.payload.pelletDamage,
      capacity: SHOTGUN.rules.capacity,
    },
    "Stalker Shotgun · 8 × 8 pellets · 2/2 loaded · 8 reserve",
  ],
  ["summary.rifle", { name: "Bridge Rifle", damage: 30, magazine: 5, capacity: 8, reserve: 16 }, "Bridge Rifle · 30 damage · 5/8 loaded · 16 reserve"],
  ["summary.pistol", { name: "Starting Pistol", damage: 9.5, magazine: 6, capacity: 6, reserve: 12 }, "Starting Pistol · 9.5 damage · 6/6 loaded · 12 reserve"],
  ["summary.pistolDefaultName", {}, "Starting Pistol"],
  ["summary.flameDefaultName", {}, "Flamethrower"],
  ["remote.guest", { id: "abc" }, "Guest abc"],
  ["effects.pistolDropLabel", {}, "Starting pistol"],
];

test("run-views, remote-players and effects lines read from data are string-equal to the old literals", () => {
  for (const [id, vars, expected] of LINES) assert.equal(webText(id, vars), expected, id);
});
