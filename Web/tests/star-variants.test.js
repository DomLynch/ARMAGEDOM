import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateStarVariants } from "../src/engine/game-data-star-variants.js";
import { STAR_VARIANTS, applyStarVariant, rollStars, starDamage, starDropTier } from "../src/engine/star-variants.js";
import { applyStarTell } from "../src/engine/star-variants-view.js";
import { KILL_DROPS, tierOf } from "../src/engine/kill-drops.js";
import { createGame, spawnWave, receiveHit } from "../src/combat.js";
import { travelTo } from "../src/travel.js";

const ALL_ON = { ...STAR_VARIANTS, stars: STAR_VARIANTS.stars.map((r) => ({ ...r, chance: 0.5, bossChance: 0.5 })) };
const copy = () => structuredClone(STAR_VARIANTS);
const invalid = (mutate) => {
  const d = copy();
  mutate(d);
  assert.throws(() => validateStarVariants(d), /Invalid/);
};
const resident = (over = {}) => ({
  placementKey: "east-roamer-1",
  maxHP: 40,
  hp: 40,
  mobSize: 1,
  combatScale: 1,
  radius: 0.5,
  rig: "original-dog",
  ...over,
});

test("the star rows are valid and ordered highest star count first", () => {
  assert.equal(GAME_DATA.starVariants, STAR_VARIANTS);
  validateStarVariants(copy());
  assert.deepEqual(
    STAR_VARIANTS.stars.map((r) => r.stars),
    [2, 1],
  );
  invalid((d) => d.stars.reverse());
  invalid((d) => (d.stars[0].chance = 0.9));
  invalid((d) => (d.stars[1].hp = 0.5));
  invalid((d) => (d.stars[0].scale = 2));
  invalid((d) => (d.stars[0].dropTier = "gold"));
  invalid((d) => (d.stars[0].tell.emissive = "red"));
  invalid((d) => (d.extra = 1));
});

test("the roll depends only on area, cycle and placement and repeats", () => {
  const a = [];
  for (let i = 0; i < 400; i++) a.push(rollStars("east", "A", `east-roamer-${i}`, false));
  assert.deepEqual(
    a,
    Array.from({ length: 400 }, (_, i) => rollStars("east", "A", `east-roamer-${i}`, false)),
  );
  const share = (n) => a.filter((s) => s === n).length / a.length;
  assert.ok(share(1) > 0.06 && share(1) < 0.2, `1-star share ${share(1)}`);
  assert.ok(share(2) > 0.01 && share(2) < 0.09, `2-star share ${share(2)}`);
  const b = Array.from({ length: 400 }, (_, i) => rollStars("east", "B", `east-roamer-${i}`, false));
  assert.notDeepEqual(a, b, "the other animal cycle re-rolls");
  const boss = Array.from({ length: 400 }, (_, i) => rollStars("east", "A", `boss-${i}`, true));
  assert.ok(boss.filter(Boolean).length > a.filter(Boolean).length, "bosses roll stars more often");
});

test("the tutorial area, a switched-off table and missing keys roll nothing", () => {
  const every = (area) => Array.from({ length: 200 }, (_, i) => rollStars(area, "A", `k${i}`, false, ALL_ON));
  assert.ok(every("westminster").every((s) => s === 0));
  assert.ok(every("east").some((s) => s > 0));
  assert.ok(Array.from({ length: 50 }, (_, i) => rollStars("east", "A", `k${i}`, false, { ...ALL_ON, enabled: false })).every((s) => s === 0));
  const e = applyStarVariant(resident({ placementKey: undefined }), "east", "A", ALL_ON);
  assert.equal(e.star, undefined);
  const drone = applyStarVariant(resident({ droneState: {} }), "east", "A", ALL_ON);
  assert.equal(drone.star, undefined);
});

test("a starred resident scales HP, size and reach from its own row and keeps unstarred bodies untouched", () => {
  const keys = Array.from({ length: 300 }, (_, i) => `east-roamer-${i}`);
  const seen = new Set();
  for (const placementKey of keys) {
    const e = applyStarVariant(resident({ placementKey }), "east", "A", ALL_ON);
    if (!e.star) {
      assert.deepEqual([e.maxHP, e.hp, e.mobSize, e.combatScale, e.radius], [40, 40, 1, 1, 0.5]);
      continue;
    }
    seen.add(e.star.stars);
    const row = STAR_VARIANTS.stars.find((r) => r.stars === e.star.stars);
    assert.equal(e.maxHP, Math.round(40 * row.hp));
    assert.equal(e.hp, e.maxHP);
    assert.equal(e.mobSize, row.scale);
    assert.equal(e.combatScale, row.scale);
    assert.equal(e.radius, 0.5 * row.scale);
    assert.equal(starDamage(e), row.damage);
    assert.ok(e.mobSize <= 1.5, "stays inside the scale the ragdoll rows allow");
  }
  assert.deepEqual([...seen].sort(), [1, 2]);
  assert.equal(starDamage({}), 1);
  const boss = applyStarVariant(resident({ bossProfile: {}, contactScale: 2, placementKey: "x" }), "east", "A", {
    ...ALL_ON,
    stars: [{ ...ALL_ON.stars[0], bossChance: 0.99 }],
  });
  assert.equal(boss.contactScale, 2 * ALL_ON.stars[0].scale);
});

test("a star pays at its row's drop tier only when that is higher", () => {
  const order = Object.keys(KILL_DROPS.tiers);
  const one = STAR_VARIANTS.stars.find((r) => r.stars === 1),
    two = STAR_VARIANTS.stars.find((r) => r.stars === 2);
  assert.equal(tierOf({ rig: "original-rat", star: one }), "creature");
  assert.equal(tierOf({ rig: "original-rat", star: two }), "boss");
  assert.equal(tierOf({ rig: "original-dog", star: one }), "creature");
  assert.equal(tierOf({ bossProfile: {}, star: one }), "boss");
  assert.equal(tierOf({ rig: "original-rat" }), "trash");
  assert.equal(starDropTier({ star: two }, "creature", order), "boss");
  assert.equal(starDropTier({}, "creature", order), "creature");
});

test("the tell changes only the actor's own material colour and glow", () => {
  const two = STAR_VARIANTS.stars.find((r) => r.stars === 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x808080 });
  applyStarTell(m, two);
  assert.equal(m.emissive.getHexString(), two.tell.emissive);
  assert.equal(m.emissiveIntensity, two.tell.intensity);
  assert.notEqual(m.color.getHexString(), "808080");
  const flat = { color: new THREE.Color(0x808080) };
  applyStarTell(flat, two);
  assert.notEqual(flat.color.getHexString(), "808080");
});

test("a starred attacker hits harder through the player's hit path", async () => {
  const w = {
    areaId: "westminster",
    spawn: { x: 0, z: -6 },
    layout: { characterScale: 1 },
    move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
    lineClear: () => true,
    async loadArea(id) {
      this.areaId = id;
      return { x: 0, z: -6 };
    },
  };
  const encounter = { id: "hollow-scavengers", character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 } };
  const g = createGame(w, { pilot: "donor-knife", encounter, pistol: true, areaResidents: true, animalVariants: true });
  spawnWave(g);
  await travelTo(g, { areaId: "east" });
  const hurt = (attacker) => {
    g.player.hp = g.player.maxHP;
    g.player.dodgeUntil = g.player.invulnerableUntil = 0;
    g.player.guarding = false;
    receiveHit(g, { amount: 10, origin: { x: g.player.pos.x + 1, z: g.player.pos.z }, attacker, moveId: "rat_bite" });
    return g.player.maxHP - g.player.hp;
  };
  const plain = hurt({ id: -1 }),
    starred = hurt({ id: -2, star: STAR_VARIANTS.stars[0] });
  assert.ok(plain > 0);
  assert.ok(Math.abs(starred - plain * STAR_VARIANTS.stars[0].damage) < 1e-9, `${plain} -> ${starred}`);
  for (const e of g.enemies.filter((x) => x.star)) assert.ok(e.hp === e.maxHP && e.maxHP > 0 && e.placementKey && !e.droneState);
  const rolled = g.enemies.filter((e) => e.star).map((e) => e.placementKey);
  assert.deepEqual(
    rolled,
    g.enemies.filter((e) => rollStars("east", g.animalCycle, e.placementKey, !!e.bossProfile)).map((e) => e.placementKey),
    "a starred resident is exactly one the roll picked",
  );
  assert.ok(rolled.length > 0, "east spawns at least one starred resident");
  await travelTo(g, { areaId: "westminster" });
  assert.ok(g.enemies.every((e) => !e.star), "the tutorial area has no stars");
});
