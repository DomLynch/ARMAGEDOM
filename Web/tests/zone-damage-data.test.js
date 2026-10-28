import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateZoneDamage } from "../src/engine/game-data-hunters.js";
import { zoneMultiplier, zoneDamageEnabled } from "../src/engine/zone-damage.js";

const ROW = GAME_DATA.zoneDamage;
const clone = () => JSON.parse(JSON.stringify(ROW));
const TRASH = 0;
const BOSS = ROW.bosses[0];
const facing = { x: 0, z: 1 }; // target looks toward +z

test("the zoneDamage row passes its validator and stays a placeholder", () => {
  assert.doesNotThrow(() => validateZoneDamage(clone()));
  assert.equal(ROW.flagParam, "zones");
  assert.equal(ROW.flagValue, "1");
  assert.equal(ROW.bossHook, "bossZoneHook");
  assert.match(ROW.note, /PLACEHOLDER/);
});

test("the validator rejects bad rows", () => {
  const bad = (edit) => {
    const d = clone();
    edit(d);
    assert.throws(() => validateZoneDamage(d));
  };
  bad((d) => (d.extra = 1));
  bad((d) => delete d.cap);
  bad((d) => (d.multiplier.back = -1));
  bad((d) => (d.multiplier.flank = "x"));
  bad((d) => (d.cap = 0.5));
  bad((d) => (d.arcs.frontHalfDeg = 120));
  bad((d) => (d.bosses = ["3"]));
  bad((d) => (d.flagParam = ""));
});

test("flag is read from the query string, default off", () => {
  assert.equal(zoneDamageEnabled(""), false);
  assert.equal(zoneDamageEnabled("?zones=0"), false);
  assert.equal(zoneDamageEnabled("?zones=1"), true);
});

test("multiplier is 1 with the flag off, whatever the angle", () => {
  for (const dir of [
    { x: 0, z: -1 },
    { x: 0, z: 1 },
    { x: 1, z: 0 },
  ])
    assert.equal(zoneMultiplier(facing, dir, TRASH, false), 1);
});

test("front, flank and back values by angle to the target's facing", () => {
  // Shot travelling -z hits a target facing +z in the face; shot travelling +z hits it in the back.
  assert.equal(zoneMultiplier(facing, { x: 0, z: -1 }, TRASH, true), ROW.multiplier.front);
  assert.equal(zoneMultiplier(facing, { x: 1, z: 0 }, TRASH, true), ROW.multiplier.flank);
  assert.equal(zoneMultiplier(facing, { x: -1, z: 0 }, TRASH, true), ROW.multiplier.flank);
  assert.equal(zoneMultiplier(facing, { x: 0, z: 1 }, TRASH, true), Math.min(ROW.multiplier.back, ROW.cap));
  // Arc edges: 50 degrees off the face is still front, 70 is flank, 130 off the face is back.
  const off = (deg) => ({ x: -Math.sin((deg * Math.PI) / 180), z: -Math.cos((deg * Math.PI) / 180) });
  assert.equal(zoneMultiplier(facing, off(50), TRASH, true), ROW.multiplier.front);
  assert.equal(zoneMultiplier(facing, off(70), TRASH, true), ROW.multiplier.flank);
  assert.equal(zoneMultiplier(facing, off(130), TRASH, true), Math.min(ROW.multiplier.back, ROW.cap));
});

test("boss kinds, missing vectors and zero vectors fall through to 1", () => {
  assert.equal(zoneMultiplier(facing, { x: 0, z: 1 }, BOSS, true), 1);
  assert.equal(zoneMultiplier(undefined, { x: 0, z: 1 }, TRASH, true), 1);
  assert.equal(zoneMultiplier(facing, { x: 0, z: 0 }, TRASH, true), 1);
});

test("the cap bounds the multiplier", () => {
  for (const dir of [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ])
    assert.ok(zoneMultiplier(facing, dir, TRASH, true) <= ROW.cap);
});
