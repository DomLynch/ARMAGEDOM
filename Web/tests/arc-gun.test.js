import test from "node:test";
import assert from "node:assert/strict";
import { railgunIntent } from "../src/engine/railgun.js";
import { MARSHAL_PISTOL_PROFILE as profile } from "../src/engine/weapon-catalog.js";
import { createAmmoRewardModel } from "../src/engine/rifle-state.js";

// Thundercoil Arc Gun sim table: the bolt strikes the first body on the ray, then jumps to the nearest clear, living, unhit enemy
// within hopRange, up to `jumps` times, each hop at hopDamageFactor of the last, stunning everyone it hits.
const model = createAmmoRewardModel(profile),
  edge = { kind: "fire", lifetime: 1 },
  intent = (started = [], held = [], released = []) => ({
    actionEdges: { started, held, released },
    actions: [],
    held: [],
  });

function enemy(id, z, extra = {}) {
  return { id, hp: 500, hostile: true, areaId: "area8", pos: { x: 0, z }, ...extra };
}

// Fires one bolt at the first enemy in `enemies` and returns the damage dealt per target id, in hit order, plus the events.
function shoot(enemies, { lineClear = () => true } = {}) {
  const state = {
      ...model.freshState(),
      status: "owned",
      rewardReceipt: profile.source.receiptId,
      magazine: 4,
      reserve: 8,
      selected: true,
    },
    g = {
      time: 0,
      tick: 0,
      events: [],
      world: { areaId: "area8", bossEquipmentData: { commanderPistol: profile }, lineClear },
      player: {
        id: 0,
        hp: 72,
        weapon: "railgun",
        pos: { x: 0, z: 0 },
        facing: { x: 0, z: 1 },
        ready: 0,
        hurtUntil: 0,
        dodgeUntil: 0,
      },
      bossEquipment: { commanderPistol: state },
      bossEquipmentAssetReady: { commanderPistol: true },
      enemies,
    },
    hits = [],
    dispatch = (game, command) => {
      const next = model.transition(game.bossEquipment.commanderPistol, { type: command.type });
      if (!next) return { ok: false };
      game.bossEquipment.commanderPistol = next;
      return { ok: true };
    },
    services = {
      railgunSource: () => ({ x: 0, y: 1, z: 0 }),
      railgunTrace: () => [{ enemy: enemies[0] }],
    },
    step = (i) =>
      railgunIntent(g, i, dispatch, (hit, weapon, item, damage) => hits.push([hit.targetId, damage]), services);
  step(intent([edge], [edge]));
  g.time = 1;
  step(intent([], [], [edge]));
  return { g, hits };
}

test("the bolt jumps three times along a line of enemies, losing a quarter of its damage each hop", () => {
  const line = [enemy(1, 3), enemy(2, 6), enemy(3, 9), enemy(4, 12), enemy(5, 15)],
    { g, hits } = shoot(line);
  const { damage } = profile.rules,
    { hopDamageFactor } = profile.arc,
    expected = [damage];
  for (let i = 0; i < profile.arc.jumps; i++) expected.push(Math.round(expected.at(-1) * hopDamageFactor));
  assert.deepEqual(hits, [
    [1, expected[0]],
    [2, expected[1]],
    [3, expected[2]],
    [4, expected[3]],
  ]);
  assert.deepEqual(expected, [45, 34, 26, 20]);
  const chain = g.events.find((e) => e.type === "arc-chain");
  assert.equal(chain.links.length, 4);
  assert.deepEqual(
    chain.links.map((l) => l.targetId),
    [1, 2, 3, 4],
  );
  assert.equal(g.bossEquipment.commanderPistol.magazine, 3);
});

test("a hop never reaches past hopRange, through a wall, into another area, or onto the dead", () => {
  const far = shoot([enemy(1, 3), enemy(2, 3 + profile.arc.hopRange + 0.5)]);
  assert.deepEqual(
    far.hits.map((h) => h[0]),
    [1],
  );
  const walled = shoot([enemy(1, 3), enemy(2, 6)], { lineClear: (a, b) => !(a.z < 4.5 && b.z > 4.5) });
  assert.deepEqual(
    walled.hits.map((h) => h[0]),
    [1],
  );
  const elsewhere = shoot([enemy(1, 3), enemy(2, 5, { areaId: "area1" }), enemy(3, 5.5, { hp: 0 })]);
  assert.deepEqual(
    elsewhere.hits.map((h) => h[0]),
    [1],
  );
});

test("each hop takes the nearest enemy and never strikes the same one twice", () => {
  const { hits } = shoot([enemy(1, 3), enemy(2, 6, { pos: { x: 3.5, z: 3 } }), enemy(3, 5)]);
  assert.deepEqual(
    hits.map((h) => h[0]),
    [1, 3, 2],
  );
});

test("everyone hit is stunned: normal enemies lose their swing, bosses are held only briefly and keep it", () => {
  const swing = { until: 9 },
    grunt = enemy(1, 3, { swing: { ...swing }, ready: 0 }),
    boss = enemy(2, 5, { bossProfile: {}, swing: { ...swing } }),
    { g } = shoot([grunt, boss]);
  assert.equal(grunt.stunUntil, g.time + profile.arc.stunSeconds);
  assert.equal(grunt.swing, null);
  assert.equal(grunt.ready, g.time + profile.arc.stunSeconds);
  assert.equal(boss.stunUntil, g.time + profile.arc.bossStunSeconds);
  assert.deepEqual(boss.swing, swing);
  const stuns = g.events.filter((e) => e.type === "arc-stun");
  assert.deepEqual(
    stuns.map((e) => [e.actor.id, e.seconds]),
    [
      [1, profile.arc.stunSeconds],
      [2, profile.arc.bossStunSeconds],
    ],
  );
});
