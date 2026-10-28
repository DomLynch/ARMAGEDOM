import test from "node:test";
import assert from "node:assert/strict";
import { rig, throwAndMeasure, services } from "./helpers/grenade-scenario.js";
import { stepGame } from "../src/combat.js";
import { bossWeaponCue } from "../src/engine/boss-weapon-runtime.js";
import { applyTouchTarget, touchGun } from "../src/engine/touch-target.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import fs from "node:fs";
import { make, collectPistol } from "./helpers/marked-fixture.js";
import { sightPastStatue } from "../src/engine/chain-break.js";
import { grenadeAim } from "../src/engine/grenade-aim.js";
import { resolveRangedAim } from "../src/pistol-targeting.js";

// Dom, 28 Oct: grenades did not hit. They landed on the 5 m fallback unless the aim already lay on a body, and never led a walking one.
// Standard and sticky now lock the nearest valid hostile like the guns do, and land where it will be when the fuse runs out.
const MAX = GAME_DATA.weapons.ranged["standard-grenade-v1"].payload.maxRange;
const OFF = (25 * Math.PI) / 180; // far outside the 12 degree gun cone
const turned = (d) => ({ x: d.x * Math.cos(OFF) - d.z * Math.sin(OFF), z: d.x * Math.sin(OFF) + d.z * Math.cos(OFF) });
const paths = {
  keyboard: (r) => ({ intent: () => ({ actions: ["fire"], aim: turned(r.dir) }), keep: {} }),
  touch: (r) => {
    r.g.mobileAssistEnabled = true;
    r.g.player.facing = turned(r.dir);
    return { intent: () => ({ mobile: true, actions: ["fire"], held: ["fire"], moveHeld: false, move: { x: 0, z: 0 } }), keep: { mobile: true } };
  },
  mouse: (r) => ({
    intent: () => ({ actions: ["fire"], aim: { ...r.dir }, aimPoint: { ...r.target.pos }, aimTargetId: r.target.id, manualPistolAim: true }),
    keep: {},
  }),
};
const gaps = [4, 7.5, MAX - 0.1];

for (const [name, make] of Object.entries(paths))
  for (const speed of [0, 2.8])
    for (const gap of gaps)
      test(`${name}: fire lands the blast on a hostile ${speed ? "walking at " + speed + " m/s" : "standing"} ${gap} m away`, () => {
        const r = rig(gap, { speed });
        assert(r, "open ground for the rig");
        const { intent, keep } = make(r),
          out = throwAndMeasure(r, intent, { speed, keepIntent: keep });
        assert(out.thrown, "the throw happened");
        assert(out.missBy < 1, `blast ${out.missBy} m from the body`);
        assert(out.damage >= 0.8 * GAME_DATA.weapons.ranged["standard-grenade-v1"].payload.maxDamage * (1 - out.missBy / 3), "covers it");
      });

test("a hostile beyond the weapon's reach is never targeted and nothing is thrown at it", () => {
  const r = rig(MAX + 4);
  r.g.player.facing = { ...r.dir };
  const out = throwAndMeasure(r, () => ({ actions: ["fire"], aim: r.dir }));
  assert.equal(out.damage, 0);
  assert.equal(bossWeaponCue(r.g).targetId, null);
});

test("reticle locks the nearest valid hostile with no input and sits on the body, not the ground", () => {
  const r = rig(6);
  stepGame(r.g, {}, 1 / 60, services(r.f));
  const cue = bossWeaponCue(r.g);
  assert.equal(cue.targetId, r.target.id);
  assert.equal(cue.ground, false);
  assert.deepEqual(cue.position, r.target.pos);
});

test("the nearer of two hostiles is locked; a dead one and one behind a wall are skipped", () => {
  const r = rig(6),
    far = { ...r.target, id: 9001, placementKey: "far", pos: { x: r.target.pos.x + r.dir.x, z: r.target.pos.z + r.dir.z } };
  r.g.enemies.push(far);
  stepGame(r.g, {}, 1 / 60, services(r.f));
  assert.equal(bossWeaponCue(r.g).targetId, r.target.id);
  r.target.hp = 0;
  stepGame(r.g, {}, 1 / 60, services(r.f));
  assert.equal(bossWeaponCue(r.g).targetId, far.id);
  const lineClear = r.g.world.lineClear;
  r.g.world.lineClear = () => false;
  stepGame(r.g, {}, 1 / 60, services(r.f));
  assert.equal(bossWeaponCue(r.g)?.targetId ?? null, null);
  r.g.world.lineClear = lineClear;
});

test("Assist Off leaves the straight throw alone", () => {
  const r = rig(6);
  r.g.mobileAssistEnabled = false;
  stepGame(r.g, { aim: turned(r.dir) }, 1 / 60, services(r.f));
  assert.equal(bossWeaponCue(r.g).targetId, null);
});

test("a cursor on open ground within the snap radius of a hostile locks it; a far cursor stays a manual lob", () => {
  const r = rig(6),
    snap = GAME_DATA.combatRules.bossWeapon.grenadeAim.cursorSnapRadius,
    near = { x: r.target.pos.x + r.side.x * (snap - 0.5), z: r.target.pos.z + r.side.z * (snap - 0.5) },
    away = { x: r.target.pos.x + r.side.x * (snap + 1.5), z: r.target.pos.z + r.side.z * (snap + 1.5) };
  stepGame(r.g, { aim: r.dir, aimPoint: near, aimTargetId: null }, 1 / 60, services(r.f));
  assert.equal(bossWeaponCue(r.g).targetId, r.target.id);
  stepGame(r.g, { aim: r.dir, aimPoint: away, aimTargetId: null }, 1 / 60, services(r.f));
  assert.equal(bossWeaponCue(r.g).targetId, null);
  const lob = bossWeaponCue(r.g).position;
  assert(Math.hypot(lob.x - away.x, lob.z - away.z) < 1e-6);
});

test("touch tap on a body selects it for the grenade and throws at it", () => {
  const r = rig(6);
  assert.equal(touchGun(r.g), "grenade");
  r.g.mobileAssistEnabled = true;
  const sel = { id: r.target.id, key: r.target.placementKey ?? String(r.target.id), areaId: r.g.world.areaId };
  stepGame(r.g, { mobile: true, touchTargetSelection: sel }, 1 / 60, services(r.f));
  assert(r.g.events.some((e) => e.type === "grenade-throw"));
  assert.equal(applyTouchTarget(r.g, { mobile: true }).aimTargetId, r.target.id);
});

test("the chained Pitborn stand-in (no track, not an enemy) is locked and landed on with a grenade, never a crash", () => {
  const f = make();
  collectPistol(f);
  const g = f.g,
    w = g.world,
    id = GAME_DATA.chainedPitborn.chainedTargets.aimTargetId,
    at = w.geometry.ground(GAME_DATA.chainedPitborn.at);
  w.safehouseData = null;
  w.layout = JSON.parse(fs.readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url)));
  g.enemies = [];
  g.events = [];
  g.time = 10;
  g.pistol.equipped = false;
  let from = null;
  for (let d = 3; d <= 7 && !from; d++)
    for (let k = 0; k < 48 && !from; k++) {
      const a = (k / 48) * Math.PI * 2,
        o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (w.geometry.clear(o, 0.4) && sightPastStatue(w, at, o)) from = o;
    }
  assert(from, "a spot with sight of the stand-in within reach");
  g.player.pos = from;
  g.bossEquipment.grenade = { ...g.bossEquipment.grenade, status: "owned", magazine: 3, reserve: 0, selected: true };
  g.bossEquipmentAssetReady = { ...g.bossEquipmentAssetReady, grenade: true };
  g.player.weapon = "grenade";
  assert.doesNotThrow(() => stepGame(g, {}, 1 / 60, {}));
  const cue = bossWeaponCue(g);
  assert.equal(cue.targetId, id);
  assert.deepEqual(g.grenadeAim, at);
  const aimed = grenadeAim(g, resolveRangedAim(g, { x: 1, z: 0 }, {}), {});
  assert.equal(aimed.target.id, id);
  assert(Math.hypot(aimed.landing.x - at.x, aimed.landing.z - at.z) < 1e-9, "lands on the stand-in");
});

test("sticky grenades take the same lead and lock", () => {
  const r = rig(5, { speed: 2.8 });
  r.g.grenadeMode = "sticky";
  const s = { ...services(r.f), grenadeSource: () => ({ x: r.g.player.pos.x, y: 1, z: -r.g.player.pos.z }), grenadeTrace: () => null };
  for (let i = 0; i < 12; i++) {
    r.target.pos.x += r.side.x * (2.8 / 60);
    r.target.pos.z += r.side.z * (2.8 / 60);
    stepGame(r.g, {}, 1 / 60, s);
  }
  r.target.pos.x += r.side.x * (2.8 / 60);
  r.target.pos.z += r.side.z * (2.8 / 60);
  stepGame(r.g, { actions: ["fire"], aim: turned(r.dir) }, 1 / 60, s);
  const throwEvent = r.g.events.find((e) => e.type === "grenade-throw");
  assert(throwEvent, "a sticky throw");
  const ahead = (throwEvent.position.x - r.target.pos.x) * r.side.x + (throwEvent.position.z - r.target.pos.z) * r.side.z;
  assert(ahead > 1.5, "aimed ahead of the walk, got " + ahead);
});
