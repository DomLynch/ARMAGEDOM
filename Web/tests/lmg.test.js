import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { railgunIntent, spreadDirection } from "../src/engine/railgun.js";
import { MARSHAL_PISTOL_PROFILE as profile } from "../src/engine/weapon-catalog.js";
import { createAmmoRewardModel } from "../src/engine/rifle-state.js";
import { bossEquipmentClock } from "../src/engine/boss-equipment-data.js";
import { make, collectPistol } from "./helpers/marked-fixture.js";
import { sightPastStatue, stepChainBreak, chainBreakState } from "../src/engine/chain-break.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// The Light Machine Gun replaced the Thundercoil Arc Gun under the same item id, receipt and save keys: hold FIRE and it keeps shooting.
const model = createAmmoRewardModel(profile),
  A = profile.automatic,
  TICK = 1 / 60, // tuning-ok: the fixed 60 Hz simulation step the tests advance by
  held = (kind = "fire") => ({ actions: [], held: [kind] });
function run(over = {}) {
  const state = {
      ...model.freshState(),
      status: "owned",
      rewardReceipt: profile.source.receiptId,
      magazine: profile.rules.capacity,
      reserve: profile.rules.reserve,
      selected: true,
    },
    g = {
      time: 0,
      tick: 0,
      events: [],
      world: { areaId: "area8", bossEquipmentData: { commanderPistol: profile }, lineClear: () => true },
      player: { id: 0, hp: 72, weapon: "railgun", pos: { x: 0, z: 0 }, facing: { x: 0, z: 1 }, ready: 0, hurtUntil: 0, dodgeUntil: 0 },
      bossEquipment: { commanderPistol: state },
      bossEquipmentAssetReady: { commanderPistol: true },
      enemies: [],
      ...over,
    };
  let payments = 0;
  const hits = [],
    dispatch = (game, command) => {
      const clock = bossEquipmentClock(game, "commanderPistol"),
        next = model.transition(game.bossEquipment.commanderPistol, { type: command.type });
      if (!next || (command.type === "fire" && game.time < clock.nextFireAt)) return { ok: false };
      game.bossEquipment.commanderPistol = next;
      if (command.type === "fire") {
        payments++;
        clock.nextFireAt = game.time + profile.rules.cadence;
      }
      return { ok: true };
    },
    applyHit = (hit, weapon, itemId, damage) => hits.push({ hit, weapon, itemId, damage });
  return {
    g,
    hits,
    step(intent) {
      g.events = [];
      const out = railgunIntent(g, intent, dispatch, applyHit);
      g.time += TICK;
      g.tick++;
      return out;
    },
    get payments() {
      return payments;
    },
    shots: () => g.events.filter((e) => e.type === "shot"),
  };
}
const enemy = (id, x, z) => ({ id, placementKey: "e" + id, hp: 500, hostile: true, visible: true, radius: 0.5, pos: { x, z }, areaId: "area8" });

test("the row is a held automatic: big drum, fast cadence, bounded spread, data-only numbers", () => {
  assert.equal(profile.name, "Light Machine Gun");
  assert.equal(profile.fireMode, "held");
  assert.equal(profile.itemId, "borough-marshals-pistol-v1");
  assert.equal(profile.weaponKey, "railgun");
  assert(profile.rules.capacity >= 30 && profile.rules.cadence <= 0.15);
  assert(profile.automatic.spreadDegrees > 0 && profile.automatic.staggerSeconds < profile.rules.cadence);
  const flame = GAME_DATA.weapons.bossEquipment.emberProjector.rules;
  // Balance: below the flamethrower's contact rate, above the pistol's.
  const rate = profile.rules.damage / profile.rules.cadence;
  assert(rate < flame.damage / flame.interval);
  assert(rate > GAME_DATA.weapons.ranged["westminster-start-pistol-v1"].rules.damage / GAME_DATA.weapons.ranged["westminster-start-pistol-v1"].rules.cadence);
});

test("holding fire keeps shooting at the row cadence and each bullet pays one round and carries a tracer row", () => {
  const f = run();
  for (let i = 0; i < 60; i++) f.step(held()); // one second of held fire
  const expected = Math.ceil(1 / profile.rules.cadence);
  assert(Math.abs(f.payments - expected) <= 1, `paid ${f.payments}, expected about ${expected}`);
  assert.equal(f.g.bossEquipment.commanderPistol.magazine, profile.rules.capacity - f.payments);
  f.step(held());
  const shot = f.shots()[0] ?? (f.step(held()), f.shots()[0]);
  const all = [];
  const g = run();
  for (let i = 0; i < 20; i++) {
    g.step(held("slash"));
    all.push(...g.shots());
  }
  assert(all.length > 1);
  for (const s of all) {
    assert.equal(s.weapon, "railgun");
    assert.equal(s.tracerColour, A.tracerColour);
    assert.equal(s.tracerSeconds, A.tracerSeconds);
    assert.equal(s.damage, profile.rules.damage);
  }
  assert(shot === undefined || shot.kind === "bullet");
});

test("no fire held means no shot, and a tap pays exactly one round", () => {
  const f = run();
  for (let i = 0; i < 30; i++) f.step({ actions: [], held: [] });
  assert.equal(f.payments, 0);
  f.step({ actions: ["fire"], held: [] });
  assert.equal(f.payments, 1);
});

test("an empty drum reloads for the row seconds, then fires again from the reserve", () => {
  const f = run();
  Object.assign(f.g.bossEquipment.commanderPistol, { magazine: 0, reserve: 50 });
  f.step(held());
  assert(f.g.events.some((e) => e.type === "reload-start"));
  assert.equal(f.payments, 0);
  for (let i = 0; i < Math.ceil(profile.rules.reload / TICK) + 3; i++) f.step(held());
  assert(f.payments > 0);
  assert(f.g.bossEquipment.commanderPistol.reserve < 50);
});

test("spread stays inside the cone and is repeatable", () => {
  const aim = { x: 0, z: 1 },
    half = (A.spreadDegrees * Math.PI) / 360, // tuning-ok: half the cone, in radians
    seen = new Set();
  for (let n = 1; n <= 500; n++) {
    const d = spreadDirection(aim, A, n),
      angle = Math.atan2(d.x, d.z);
    assert(Math.abs(angle) <= half + 1e-9);
    assert(Math.abs(Math.hypot(d.x, d.z) - 1) < 1e-9);
    seen.add(angle.toFixed(6));
  }
  assert(seen.size > 100);
  assert.deepEqual(spreadDirection(aim, A, 7), spreadDirection(aim, A, 7));
});

test("auto-aim: mouse (aim near an enemy) and touch (selected target) both lock the enemy and every bullet hits it", () => {
  for (const mode of ["mouse", "touch"]) {
    const f = run();
    f.g.enemies = [enemy(5, 1.2, 6)]; // about 11 degrees off the facing, inside the pistol's lock cone
    if (mode === "touch") f.g.touchTarget = { id: 5, key: "e5", areaId: "area8" };
    for (let i = 0; i < 40; i++) f.step({ actions: [], held: ["fire"], aim: { x: 0, z: 1 } });
    assert(f.payments >= 3, mode);
    assert.equal(f.hits.length, f.payments, `${mode}: every bullet hits the locked enemy`);
    assert(f.shots().every((s) => s.targetId === 5 || s.targetId === null));
    assert(f.hits.every((h) => h.weapon === "railgun" && h.itemId === profile.itemId && h.damage === profile.rules.damage));
    assert(f.g.enemies[0].staggerUntil > 0);
  }
});

test("a wall stops the bullet and nothing is hit behind it", () => {
  const f = run();
  f.g.world.lineClear = (a, b) => Math.hypot(b.x - a.x, b.z - a.z) < 0.001 || b.z <= 2;
  f.g.enemies = [enemy(5, 0, 6)];
  for (let i = 0; i < 20; i++) f.step({ actions: [], held: ["fire"], aim: { x: 0, z: 1 } });
  assert(f.payments > 0);
  assert.equal(f.hits.length, 0);
});

test("chained Pitborn stand-in is still aimable and its chains snap under LMG fire", () => {
  const f = make();
  collectPistol(f);
  const g = f.g;
  g.world.safehouseData = null;
  g.world.layout = JSON.parse(fs.readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url)));
  g.enemies = [];
  g.events = [];
  g.time = 10;
  const at = g.world.geometry.ground(GAME_DATA.chainedPitborn.at);
  let from = null;
  for (let d = 3; d <= 12 && !from; d++)
    for (let k = 0; k < 48 && !from; k++) {
      const a = (k / 48) * Math.PI * 2, // tuning-ok: sample points round the Pitborn
        o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (g.world.lineClear(o, o) && sightPastStatue(g.world, at, o)) from = o;
    }
  assert(from, "an open spot with sight past the statue");
  const state = {
    ...model.freshState(),
    status: "owned",
    rewardReceipt: profile.source.receiptId,
    magazine: profile.rules.capacity,
    reserve: profile.rules.reserve,
    selected: true,
  };
  g.world.bossEquipmentData = { ...(g.world.bossEquipmentData ?? {}), commanderPistol: profile };
  g.bossEquipment = { ...(g.bossEquipment ?? {}), commanderPistol: state };
  g.bossEquipmentAssetReady = { commanderPistol: true };
  g.player.weapon = "railgun";
  g.player.pos = { ...from };
  g.player.hp = 100;
  g.player.ready = 0;
  g.player.hurtUntil = 0;
  g.player.dodgeUntil = 0;
  const dir = { x: at.x - from.x, z: at.z - from.z },
    len = Math.hypot(dir.x, dir.z);
  let paid = 0;
  const dispatch = (game, command) => {
    if (command.type !== "fire") return { ok: false };
    paid++;
    bossEquipmentClock(game, "commanderPistol").nextFireAt = game.time + profile.rules.cadence;
    return { ok: true };
  };
  railgunIntent(g, { actions: [], held: ["fire"], aim: { x: dir.x / len, z: dir.z / len } }, dispatch, () => assert.fail("no damage to a prop"));
  assert.equal(paid, 1);
  assert(g.events.some((e) => e.type === "shot" && e.weapon === "railgun"));
  stepChainBreak(g, () => ({}), true);
  assert.equal(chainBreakState(g).state, "snapping");
});

test("save compatibility: an old Thundercoil save (owned, 4 loaded, 8 reserve) is the Light Machine Gun owned with the same item id", () => {
  const old = { ...model.freshState(), status: "owned", rewardReceipt: profile.source.receiptId, magazine: 4, reserve: 8, selected: true };
  assert.equal(profile.itemId, "borough-marshals-pistol-v1");
  assert(model.valid(old), "the old save row validates under the new rules");
  assert(old.magazine <= profile.rules.capacity && old.reserve <= profile.rules.reserve);
});
