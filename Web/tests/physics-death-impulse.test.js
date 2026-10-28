import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validatePhysicsDeath } from "../src/engine/game-data-hunters.js";
import { bulletImpulseEnabled, deathImpactOf, impulseRow } from "../src/engine/physics-death-impulse.js";
import { killVector } from "../src/engine/physics-death-impl.js";

const CFG = GAME_DATA.physicsDeath,
  BI = CFG.bulletImpulse,
  clone = () => JSON.parse(JSON.stringify(CFG));

test("the bullet impulse is on by default and ?bulletimpulse=0 is the off switch", () => {
  assert.equal(BI.defaultOn, true);
  assert.equal(bulletImpulseEnabled(""), true);
  assert.equal(bulletImpulseEnabled("?qa=1"), true);
  assert.equal(bulletImpulseEnabled("?bulletimpulse=0"), false);
  assert.equal(bulletImpulseEnabled("?physics=0&bulletimpulse=1"), true);
});

test("the dying entity records the killing hit's direction, weapon, attack class and zone", () => {
  const impact = deathImpactOf({ impactDirection: { x: 1, z: -2 }, weapon: "shotgun", attackClass: "bullet", zone: "head" });
  assert.deepEqual(impact, { x: 1, z: -2, weapon: "shotgun", attackClass: "bullet", zone: "head" });
  assert.deepEqual(deathImpactOf({}), { x: 0, z: 0, weapon: undefined, attackClass: undefined, zone: undefined });
});

test("pistol and rifle shove the body back with lift, the shotgun launches it harder, a knife barely moves it", () => {
  const row = (weapon, attackClass) => impulseRow({ x: 0, z: 1, weapon, attackClass }, true);
  const { pistol, rifle, shotgun, knife } = {
    pistol: row("pistol", "bullet"),
    rifle: row("rifle", "bullet"),
    shotgun: row("shotgun", "bullet"),
    knife: row("knife", undefined),
  };
  assert.ok(pistol.horizontal > CFG.killImpulse.horizontal && pistol.up > CFG.killImpulse.up);
  assert.ok(rifle.horizontal > pistol.horizontal);
  assert.ok(shotgun.horizontal > rifle.horizontal && shotgun.up > rifle.up);
  assert.ok(knife.horizontal < CFG.killImpulse.horizontal && knife.horizontal > 0);
});

test("grenades and rockets throw the body with the strongest lift; an unknown blast weapon uses the blast class row", () => {
  const grenade = impulseRow({ weapon: "grenade", attackClass: "blast" }, true),
    rocket = impulseRow({ weapon: "rocket", attackClass: "blast" }, true),
    other = impulseRow({ weapon: "future-launcher", attackClass: "blast" }, true),
    shotgun = impulseRow({ weapon: "shotgun", attackClass: "bullet" }, true);
  assert.ok(grenade.up > shotgun.up && rocket.up >= grenade.up);
  assert.deepEqual(
    [other.horizontal, other.up],
    [BI.byAttackClass.blast.horizontal, BI.byAttackClass.blast.up],
  );
});

test("an unknown weapon or no weapon at all keeps the fixed default row, and so does the off switch", () => {
  const base = CFG.killImpulse;
  assert.deepEqual(impulseRow({ weapon: "mystery", attackClass: "mystery" }, true), base);
  assert.deepEqual(impulseRow(undefined, true), base);
  assert.deepEqual(impulseRow({ weapon: "shotgun", attackClass: "bullet", zone: "head" }, false), base);
});

test("a known zone picks the struck part, an unknown one keeps the row's part", () => {
  assert.equal(impulseRow({ weapon: "pistol", attackClass: "bullet", zone: "head" }, true).part, BI.zoneParts.head);
  assert.equal(impulseRow({ weapon: "pistol", attackClass: "bullet", zone: "legs" }, true).part, BI.zoneParts.legs);
  assert.equal(impulseRow({ weapon: "pistol", attackClass: "bullet" }, true).part, CFG.killImpulse.part);
  assert.equal(impulseRow({ weapon: "pistol", attackClass: "bullet", zone: "unknown-zone" }, true).part, CFG.killImpulse.part);
  for (const part of Object.values(BI.zoneParts)) assert.ok(Object.hasOwn(CFG.parts, part));
});

test("killVector carries the weapon's row, aimed along the blow, and stays deterministic", () => {
  const root = new THREE.Group(),
    shot = { deathImpact: { x: 0, z: 2, weapon: "shotgun", attackClass: "bullet" } },
    v = killVector(root, shot);
  assert.deepEqual(v.map((n) => +n.toFixed(6)), [0, BI.byWeapon.shotgun.up, BI.byWeapon.shotgun.horizontal]);
  assert.deepEqual(killVector(root, shot), v);
  const blast = killVector(root, { deathImpact: { x: -1, z: 0, weapon: "grenade", attackClass: "blast" } });
  assert.deepEqual(blast.map((n) => +n.toFixed(6)), [-BI.byWeapon.grenade.horizontal, BI.byWeapon.grenade.up, 0]);
  const legacy = killVector(root, { deathImpact: { x: 0, z: 1 } });
  assert.deepEqual(legacy.map((n) => +n.toFixed(6)), [0, CFG.killImpulse.up, CFG.killImpulse.horizontal]);
});

test("the validator accepts the shipped rows and rejects bad ones", () => {
  assert.doesNotThrow(() => validatePhysicsDeath(clone()));
  const a = clone();
  a.bulletImpulse.byWeapon.pistol.horizontal = -1;
  assert.throws(() => validatePhysicsDeath(a));
  const b = clone();
  b.bulletImpulse.zoneParts.head = "notAPart";
  assert.throws(() => validatePhysicsDeath(b));
  const c = clone();
  c.bulletImpulse.offValue = c.bulletImpulse.onValue;
  assert.throws(() => validatePhysicsDeath(c));
  const d = clone();
  d.bulletImpulse.byWeapon.rifle.part = "head";
  assert.throws(() => validatePhysicsDeath(d));
  const e = clone();
  delete e.bulletImpulse;
  assert.throws(() => validatePhysicsDeath(e));
});
