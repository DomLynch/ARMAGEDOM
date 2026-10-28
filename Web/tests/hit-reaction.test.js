import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateHitReaction } from "../src/engine/hit-reaction-data.js";
import {
  activeBodyReactions,
  bodyReactionEnd,
  bodyReactionStart,
  bodyReactionStep,
  eligible,
  hitReactionEnabled,
  planHit,
  totalSeconds,
  weaponClassOf,
  weightAt,
  zoneFor,
} from "../src/engine/hit-reaction.js";

const row = GAME_DATA.hitReaction;
const hunter = { id: "h1", markedHunter: true, hp: 100 };
const boss = { id: "b1", bossProfile: {}, hp: 100 };
const trash = { id: "t1", hp: 20 };

test("validator accepts the shipped row and rejects bad rows", () => {
  validateHitReaction(structuredClone(row));
  const bad = (patch) => assert.throws(() => validateHitReaction({ ...structuredClone(row), ...patch }), TypeError);
  bad({ note: "" });
  bad({ defaultOn: "yes" });
  bad({ eligibleFlags: [] });
  bad({ maxActive: 0 });
  bad({ order: ["wing"] });
  bad({ weaponClass: { pistol: "nope" } });
  bad({ zones: { ...structuredClone(row.zones), head: { bend: { wing: 1 }, twist: {}, fixed: {} } } });
});

test("default on, ?hitreact=0 is the off switch", () => {
  assert.equal(row.defaultOn, true);
  assert.equal(hitReactionEnabled(row, ""), true);
  assert.equal(hitReactionEnabled(row, "?hitreact=1"), true);
  assert.equal(hitReactionEnabled(row, "?hitreact=0"), false);
});

test("only bosses and marked hunters are eligible, never trash", () => {
  assert.equal(eligible(row, hunter), true);
  assert.equal(eligible(row, boss), true);
  assert.equal(eligible(row, trash), false);
  assert.equal(eligible(row, null), false);
});

test("every game weapon that can hit maps to a class and unknown ones to none", () => {
  for (const w of ["pistol", "rifle", "shotgun", "grenade", "rocket", "knife"]) assert.ok(weaponClassOf(row, w), w);
  assert.equal(weaponClassOf(row, "teeth"), null);
});

test("zone pick is deterministic and follows the class weights", () => {
  assert.equal(zoneFor(row, "pistol", "h1:25:100"), zoneFor(row, "pistol", "h1:25:100"));
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(zoneFor(row, "shotgun", `h1:${i}:100`));
  assert.deepEqual([...seen].sort(), ["arms", "head", "legs", "torso"]);
  // a blast never picks the head (weight 0)
  for (let i = 0; i < 400; i++) assert.notEqual(zoneFor(row, "blast", `b1:${i}:100`), "head");
});

test("the curve eases in, holds, and returns to exactly 0", () => {
  const c = row.classes.shotgun;
  assert.equal(weightAt(c, -1), 0);
  assert.equal(weightAt(c, 0), 0);
  assert.equal(weightAt(c, c.easeInSeconds + c.holdSeconds / 2), 1);
  assert.equal(weightAt(c, totalSeconds(c)), 0);
  let last = 0;
  for (let t = 0; t <= c.easeInSeconds; t += 0.005) {
    const w = weightAt(c, t);
    assert.ok(w >= last);
    last = w;
  }
});

test("planHit: heavier weapons lean harder, blocked, parried and zero hits plan nothing", () => {
  const hit = (weapon, extra = {}) => ({ actor: boss, weapon, amount: 40, impactDirection: { x: 0, z: -1 }, ...extra });
  const pistol = planHit(row, boss, hit("pistol")),
    shotgun = planHit(row, boss, hit("shotgun")),
    rocket = planHit(row, boss, hit("rocket"));
  assert.ok(pistol.power < shotgun.power && shotgun.power < rocket.power);
  assert.equal(planHit(row, boss, hit("pistol", { blocked: true })), null);
  assert.equal(planHit(row, boss, hit("pistol", { parry: true })), null);
  assert.equal(planHit(row, boss, hit("pistol", { amount: 0 })), null);
  assert.equal(planHit(row, boss, hit("teeth")), null);
});

// A small mixamo-106-shaped chain with the ragdoll's real node names, under an actor root.
function rig() {
  const root = new THREE.Group(),
    model = new THREE.Group();
  root.add(model);
  const names = GAME_DATA.physicsDeath.parts;
  let parent = model;
  const bones = {};
  for (const joint of Object.values(names)) {
    const b = new THREE.Bone();
    b.name = THREE.PropertyBinding.sanitizeNodeName(GAME_DATA.physicsBody.nodePrefix + joint);
    b.position.set(0, 0.1, 0);
    parent.add(b);
    bones[joint] = b;
    parent = b;
  }
  root.updateMatrixWorld(true);
  return { root, model, bones };
}
const shot = (actor, weapon, extra = {}) => ({ type: "hit", actor, weapon, amount: 40, impactDirection: { x: 0, z: 1 }, ...extra });

test("a boss hit leans the spine and returns every bone to the clip pose", () => {
  const { root, model, bones } = rig();
  const view = { root, model };
  const before = bones.Spine2.quaternion.clone();
  bodyReactionStart(view, shot(boss, "shotgun"));
  assert.ok(view.bodyReaction, "reaction started");
  assert.equal(activeBodyReactions(), 1);
  let moved = 0;
  const total = view.bodyReaction.total;
  for (let t = 0; t < total; t += 1 / 60) {
    for (const b of Object.values(bones)) b.quaternion.identity(); // the clip rewrites every bone each frame, then the reaction lays on top
    bodyReactionStep(view, boss, 1 / 60);
    if (view.bodyReaction) for (const b of Object.values(bones)) if (b.quaternion.angleTo(new THREE.Quaternion()) > 1e-3) moved++;
  }
  for (const b of Object.values(bones)) b.quaternion.identity();
  bodyReactionStep(view, boss, 1);
  assert.ok(moved > 0, "bones moved during the reaction");
  assert.equal(view.bodyReaction, undefined);
  assert.equal(activeBodyReactions(), 0);
  assert.ok(bones.Spine2.quaternion.angleTo(before) < 1e-6, "back to identity once the curve ends");
});

test("trash, a dead body and a blocked hit start nothing; the cap and removal free the slot", () => {
  const { root, model } = rig();
  const view = { root, model };
  bodyReactionStart(view, shot(trash, "shotgun"));
  assert.equal(view.bodyReaction, undefined);
  bodyReactionStart(view, shot({ ...boss, hp: 0 }, "shotgun"));
  assert.equal(view.bodyReaction, undefined);
  bodyReactionStart(view, shot(boss, "shotgun", { blocked: true }));
  assert.equal(view.bodyReaction, undefined);
  const views = [];
  for (let i = 0; i < row.maxActive + 2; i++) {
    const r = rig(),
      v = { root: r.root, model: r.model };
    bodyReactionStart(v, shot({ ...boss, id: `b${i}` }, "pistol"));
    views.push(v);
  }
  assert.equal(activeBodyReactions(), row.maxActive);
  for (const v of views) bodyReactionEnd(v); // the actor removal path
  bodyReactionEnd(views[0]); // twice is safe
  assert.equal(activeBodyReactions(), 0);
});

test("a hit inside the retrigger gap is ignored; after it the reaction restarts", () => {
  const { root, model } = rig();
  const view = { root, model };
  bodyReactionStart(view, shot(boss, "pistol"));
  const first = view.bodyReaction;
  bodyReactionStep(view, boss, row.retriggerSeconds / 2);
  bodyReactionStart(view, shot(boss, "rifle"));
  assert.equal(view.bodyReaction, first, "inside the gap: same reaction");
  bodyReactionStep(view, boss, row.retriggerSeconds);
  bodyReactionStart(view, shot(boss, "rifle"));
  assert.notEqual(view.bodyReaction, first);
  assert.equal(view.bodyReaction.age, 0);
  bodyReactionEnd(view);
});

test("the body dying ends the reaction at once (the ragdoll owns the bones then)", () => {
  const { root, model } = rig();
  const view = { root, model };
  bodyReactionStart(view, shot(hunter, "rifle"));
  assert.ok(view.bodyReaction);
  bodyReactionStep(view, { ...hunter, hp: 0 }, 1 / 60);
  assert.equal(view.bodyReaction, undefined);
  assert.equal(activeBodyReactions(), 0);
});

test("a blow from the front and from behind lean the spine opposite ways", () => {
  const lean = (dir) => {
    const { root, model, bones } = rig();
    const view = { root, model };
    bodyReactionStart(view, shot(boss, "rocket", { impactDirection: dir }));
    const zone = (view.bodyReaction.zone = "torso"); // force the torso row for a clean comparison
    assert.equal(zone, "torso");
    bodyReactionStep(view, boss, row.classes.blast.easeInSeconds + row.classes.blast.holdSeconds / 2);
    const out = new THREE.Euler().setFromQuaternion(bones.Spine2.quaternion);
    bodyReactionEnd(view);
    return out.x;
  };
  const a = lean({ x: 0, z: 1 }),
    b = lean({ x: 0, z: -1 });
  assert.ok(a * b < 0, `opposite signs: ${a} vs ${b}`);
});
