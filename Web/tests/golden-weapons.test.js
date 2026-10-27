import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { freshMarked, validMarked, copyMarked } from "../src/engine/marked.js";
import {
  GOLDEN_WEAPON_OUTCOME,
  lootOutcome,
  planGoldenWeapon,
  grantGoldenWeapon,
  isGolden,
  isGoldenItem,
  goldenRoll,
  rollBossGolden,
  goldMaterial,
  createGoldSkin,
} from "../src/engine/golden-weapons.js";
import { validateGoldenWeapons } from "../src/engine/game-data-golden.js";
import * as THREE from "three";

const run = (owned = ["pistol", "rifle"]) => ({
  time: 10,
  kills: 3,
  events: [],
  world: { markedData: { maxMoney: 100000 } },
  marked: freshMarked(),
  pistol: { collected: owned.includes("pistol"), magazine: 8, reserve: 12, damage: 1 },
  rifle: { status: owned.includes("rifle") ? "owned" : "none", magazine: 5, reserve: 9 },
  bossEquipment: { shotgun: { status: owned.includes("shotgun") ? "owned" : "none", magazine: 2, reserve: 6 } },
});

test("the loot outcome golden-weapon is registered and grants an owned gun that is not gold yet", () => {
  assert.equal(GOLDEN_WEAPON_OUTCOME, "golden-weapon");
  const g = run();
  assert.equal(lootOutcome(GOLDEN_WEAPON_OUTCOME)(g,{ id: "golden-weapon" }), true);
  assert.equal(g.marked.golden.length, 1);
  assert(["pistol", "rifle"].includes(g.marked.golden[0]));
  assert(g.message.startsWith("Golden "));
  assert.equal(g.events.at(-1).type, "golden-weapon");
  const second = grantGoldenWeapon(g, 0.99);
  assert.equal(second.kind, "golden");
  assert.deepEqual([...g.marked.golden].sort(), ["pistol", "rifle"]);
});

test("a gun the player does not own is never made gold; with every owned gun gold the outcome pays cash instead", () => {
  const g = run(["pistol"]);
  for (let roll = 0; roll < 1; roll += 0.2) assert.equal(planGoldenWeapon(g, roll).weaponKey, "pistol");
  grantGoldenWeapon(g, 0.5);
  assert(isGolden(g, "pistol") && !isGolden(g, "rifle"));
  const plan = grantGoldenWeapon(g, 0.5);
  assert.equal(plan.kind, "cash");
  assert.equal(g.marked.carried, GAME_DATA.goldenWeapons.fallbackCash);
  assert.deepEqual(g.marked.golden, ["pistol"]);
  const none = run([]);
  assert.equal(planGoldenWeapon(none, 0.3).kind, "cash");
});

test("gold is cosmetic: no weapon stat, ammo or ownership changes", () => {
  const g = run(["pistol", "rifle", "shotgun"]),
    before = structuredClone({ pistol: g.pistol, rifle: g.rifle, bossEquipment: g.bossEquipment });
  for (let n = 0; n < 3; n++) grantGoldenWeapon(g, n / 3);
  assert.equal(g.marked.golden.length, 3);
  assert.deepEqual({ pistol: g.pistol, rifle: g.rifle, bossEquipment: g.bossEquipment }, before);
  assert.equal(g.marked.carried, 0);
});

test("the golden list persists through the Marked save validator and copy; old saves without it still load", () => {
  const g = run();
  grantGoldenWeapon(g, 0);
  assert(validMarked(g.marked));
  const loaded = copyMarked(JSON.parse(JSON.stringify(g.marked)));
  assert.deepEqual(loaded, g.marked);
  assert(validMarked({ version: 1, carried: 0, bank: 0, bounty: 0 }));
  assert.deepEqual(copyMarked(freshMarked()), freshMarked());
  for (const bad of [["pistol", "pistol"], ["laser"], "pistol", [1]]) assert(!validMarked({ ...freshMarked(), golden: bad }), JSON.stringify(bad));
  assert(!validMarked({ ...freshMarked(), extra: 1 }));
});

test("a golden tile is found by item id", () => {
  const g = run();
  g.marked.golden = ["rifle"];
  assert(isGoldenItem(g, "bridge-warden-rifle-v1"));
  assert(!isGoldenItem(g, "westminster-start-pistol-v1"));
  assert(!isGoldenItem(g, "knife"));
});

test("the boss roll is repeatable, honours the data chance and grants through the same outcome", () => {
  const g = run(),
    chance = GAME_DATA.goldenWeapons.bossChance;
  assert.equal(goldenRoll(g, "x"), goldenRoll(g, "x"));
  let hits = 0;
  const trials = 4000;
  for (let n = 0; n < trials; n++) {
    const probe = run();
    probe.kills = n;
    if (rollBossGolden(probe, "boss-a")) {
      hits++;
      assert.equal(probe.marked.golden.length, 1);
    } else assert.equal(probe.marked.golden, undefined);
  }
  assert(Math.abs(hits / trials - chance) < 0.03, `rate ${hits / trials} vs ${chance}`);
});

test("the gold material is a copy: the plain material is untouched and the skin swaps both ways", () => {
  const plain = new THREE.MeshStandardMaterial({ color: "#222222", metalness: 0.1, roughness: 0.9 }),
    mesh = new THREE.Mesh(new THREE.BoxGeometry(), plain),
    gold = goldMaterial(plain);
  assert.notEqual(gold, plain);
  assert.equal(plain.color.getHexString(), "222222");
  assert.equal(gold.color.getHexString(), GAME_DATA.goldenWeapons.material.color.slice(1));
  assert(gold.emissiveIntensity > 0, "emissive keeps gold readable without an environment map");
  const root = new THREE.Group();
  root.add(mesh);
  const skin = createGoldSkin(root);
  skin.set(true);
  assert.notEqual(mesh.material, plain);
  skin.set(false);
  assert.equal(mesh.material, plain);
});

test("the validator refuses a bad golden table", () => {
  validateGoldenWeapons(structuredClone(GAME_DATA.goldenWeapons));
  for (const edit of [(d) => (d.bossChance = 2), (d) => (d.material.color = "gold"), (d) => (d.extra = 1), (d) => (d.weapons.pistol.mount = [])]) {
    const bad = structuredClone(GAME_DATA.goldenWeapons);
    edit(bad);
    assert.throws(() => validateGoldenWeapons(bad));
  }
});
