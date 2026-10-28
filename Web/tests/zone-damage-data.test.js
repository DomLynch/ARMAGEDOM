import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateZoneDamage } from "../src/engine/game-data-hunters.js";
import { pickZone, zoneDamageEnabled, zoneMultiplier, zoneRoll } from "../src/engine/zone-damage.js";

const ROW = GAME_DATA.zoneDamage;
const FB = ROW.facingBonus;
const clone = () => JSON.parse(JSON.stringify(ROW));
const TRASH = 0;
const BOSS = ROW.bosses[0];
const facing = { x: 0, z: 1 }; // target looks toward +z
const off = (deg) => ({ x: -Math.sin((deg * Math.PI) / 180), z: -Math.cos((deg * Math.PI) / 180) }); // shot travelling this way, deg off a face hit
const capped = (m) => Math.min(m, ROW.cap);

test("the zoneDamage row passes its validator and stays a placeholder", () => {
  assert.doesNotThrow(() => validateZoneDamage(clone()));
  assert.equal(ROW.flagParam, "zones");
  assert.equal(ROW.flagValue, "1");
  assert.equal(ROW.bossHook, "bossZoneHook");
  assert.match(ROW.note, /PLACEHOLDER/);
  assert.deepEqual(Object.keys(ROW.zones), ["head", "torso", "legs"]);
});

test("the validator rejects bad rows", () => {
  const bad = (edit) => {
    const d = clone();
    edit(d);
    assert.throws(() => validateZoneDamage(d));
  };
  bad((d) => (d.extra = 1));
  bad((d) => delete d.cap);
  bad((d) => (d.facingBonus.back = 0)); // facing may never zero a hit
  bad((d) => (d.facingBonus.flank = "x"));
  bad((d) => (d.cap = 0.5));
  bad((d) => (d.facingBonus.arcs.frontHalfDeg = 120));
  bad((d) => (d.bosses = ["3"]));
  bad((d) => (d.flagParam = ""));
  bad((d) => (d.zones.head.multiplier = 0));
  bad((d) => delete d.weights.default);
  bad((d) => (d.weights.rifle = { head: 0, torso: 0, legs: 0 }));
  bad((d) => delete d.weights.rifle.legs);
});

test("flag is read from the query string, default off", () => {
  assert.equal(zoneDamageEnabled(""), false);
  assert.equal(zoneDamageEnabled("?zones=0"), false);
  assert.equal(zoneDamageEnabled("?zones=1"), true);
});

test("flag off: no zone and multiplier 1, whatever the weapon or angle", () => {
  const g = { tick: 5, time: 0 };
  for (const dir of [off(0), off(90), off(180)]) {
    assert.equal(pickZone(g, { id: 1, kind: TRASH }, "rifle", "bullet", "head", false), null);
    assert.equal(zoneMultiplier(facing, dir, null), 1);
  }
});

test("a supplied zone wins, an unknown one falls back to the roll", () => {
  const g = { tick: 5, time: 0 };
  const t = { id: 1, kind: TRASH };
  for (const z of Object.keys(ROW.zones)) assert.equal(pickZone(g, t, "rifle", "bullet", z, true), z);
  assert.ok(Object.hasOwn(ROW.zones, pickZone(g, t, "rifle", "bullet", "tail", true)));
});

test("zone picks are deterministic for a fixed seed and follow the weight table", () => {
  assert.equal(zoneRoll(ROW.seed, 7, 3), zoneRoll(ROW.seed, 7, 3));
  assert.notEqual(zoneRoll(ROW.seed, 7, 3), zoneRoll(ROW.seed, 8, 3));
  const run = (key) => {
    const seen = { head: 0, torso: 0, legs: 0 };
    for (let tick = 0; tick < 600; tick++)
      seen[pickZone({ tick, time: 0 }, { id: 4, kind: TRASH }, key, undefined, undefined, true)]++;
    return seen;
  };
  assert.deepEqual(run("rifle"), run("rifle"));
  const rocket = run("rocket"),
    stab = run("stab"),
    heavy = run("heavy"),
    slash = run("slash");
  assert.equal(rocket.head, 0); // rocket weight for head is 0
  assert.ok(rocket.torso > rocket.legs);
  assert.equal(stab.legs, 0);
  assert.ok(stab.head > 0 && stab.torso > 0);
  assert.deepEqual(heavy, { head: 0, torso: 600, legs: 0 });
  assert.equal(slash.head, 0);
  assert.ok(run("rifle").head > 0);
  // Weapon key, then attackClass, then default.
  const g = { tick: 11, time: 0 };
  const t = { id: 2, kind: TRASH };
  assert.equal(pickZone(g, t, "nope", "rocket", undefined, true), pickZone(g, t, "rocket", undefined, undefined, true));
  assert.equal(pickZone(g, t, "nope", "nope", undefined, true), pickZone(g, t, "default", undefined, undefined, true));
});

test("boss kinds get no zone and x1", () => {
  assert.equal(pickZone({ tick: 1, time: 0 }, { id: 9, kind: BOSS }, "rifle", "bullet", "head", true), null);
  assert.equal(zoneMultiplier(facing, off(180), null), 1);
});

test("facing only modifies: front x1, flank and back bonus, never 0", () => {
  const torso = ROW.zones.torso.multiplier;
  assert.equal(zoneMultiplier(facing, off(0), "torso"), capped(torso * FB.front));
  assert.equal(zoneMultiplier(facing, off(90), "torso"), capped(torso * FB.flank));
  assert.equal(zoneMultiplier(facing, off(-90), "torso"), capped(torso * FB.flank));
  assert.equal(zoneMultiplier(facing, off(180), "torso"), capped(torso * FB.back));
  assert.equal(zoneMultiplier(facing, off(50), "torso"), capped(torso * FB.front));
  assert.equal(zoneMultiplier(facing, off(70), "torso"), capped(torso * FB.flank));
  assert.equal(zoneMultiplier(facing, off(130), "torso"), capped(torso * FB.back));
  for (let deg = 0; deg <= 360; deg += 15)
    for (const zone of Object.keys(ROW.zones)) assert.ok(zoneMultiplier(facing, off(deg), zone) > 0);
});

test("missing or zero vectors give the zone multiplier with no facing bonus", () => {
  assert.equal(zoneMultiplier(undefined, off(180), "head"), capped(ROW.zones.head.multiplier));
  assert.equal(zoneMultiplier(facing, { x: 0, z: 0 }, "legs"), capped(ROW.zones.legs.multiplier));
});

test("the cap bounds the multiplier", () => {
  for (let deg = 0; deg <= 360; deg += 15)
    for (const zone of Object.keys(ROW.zones)) assert.ok(zoneMultiplier(facing, off(deg), zone) <= ROW.cap);
  const d = clone();
  d.cap = 1;
  assert.doesNotThrow(() => validateZoneDamage(d));
});
