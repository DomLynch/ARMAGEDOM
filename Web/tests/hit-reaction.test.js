import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateHitReaction } from "../src/engine/hit-reaction-data.js";
import {
  activeBodyReactions,
  blowDirection,
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

// ---- review fixes: parked areas, fail-soft, non-finite directions, drift, paused frames, contacts-only passes ----
const allFinite = (bones) =>
  Object.values(bones).every((b) => [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].every(Number.isFinite));
const clipPose = (bones) => {
  let i = 0;
  for (const b of Object.values(bones)) b.quaternion.setFromEuler(new THREE.Euler(0.01 * ++i, 0.02, 0.03)); // a non-identity pose from the "clip"
};

test("parkArea ends the reaction (frees the cap slot) and puts the bones back; actors.js calls it", () => {
  const { root, model, bones } = rig();
  const view = { root, model };
  clipPose(bones);
  const before = bones.Spine2.quaternion.clone();
  bodyReactionStart(view, shot(boss, "shotgun"));
  bodyReactionStep(view, boss, row.classes.shotgun.easeInSeconds + row.classes.shotgun.holdSeconds / 2);
  assert.ok(bones.Spine2.quaternion.angleTo(before) > 1e-3, "mid-reaction");
  bodyReactionEnd(view); // what parkArea does for each parked view
  assert.equal(activeBodyReactions(), 0);
  assert.ok(bones.Spine2.quaternion.angleTo(before) < 1e-6, "clip pose restored");
  const src = readFileSync(new URL("../src/actors.js", import.meta.url), "utf8");
  const park = src.slice(src.indexOf("parkArea(areaId)"), src.indexOf("*prepareAreaSteps"));
  assert.match(park, /bodyHitEnd\(view\)/, "parkArea releases the reaction");
  assert.ok(Buffer.byteLength(src) <= 80 * 1024, "actors.js stays under the source size limit");
});

test("fail soft: a throw in step or start ends the reaction, restores the bones and never reaches the caller", () => {
  const { root, model, bones } = rig();
  const view = { root, model };
  clipPose(bones);
  const before = bones.Spine2.quaternion.clone();
  bodyReactionStart(view, shot(boss, "rifle"));
  bones.Spine2.parent.updateWorldMatrix = () => {
    throw new Error("boom");
  };
  assert.doesNotThrow(() => bodyReactionStep(view, boss, row.classes.rifle.easeInSeconds));
  assert.equal(view.bodyReaction, undefined);
  assert.equal(activeBodyReactions(), 0);
  assert.ok(allFinite(bones));
  assert.ok(bones.Spine2.quaternion.angleTo(before) < 1e-6, "back on the clip pose");
  const r2 = rig();
  const v2 = { root: r2.root, model: r2.model };
  v2.root.getWorldQuaternion = () => {
    throw new Error("boom");
  };
  assert.doesNotThrow(() => bodyReactionStart(v2, shot(boss, "rifle")));
  assert.equal(v2.bodyReaction, undefined);
  assert.equal(activeBodyReactions(), 0);
  assert.doesNotThrow(() => bodyReactionEnd(undefined));
  assert.doesNotThrow(() => bodyReactionStep({}, boss, 1 / 60));
});

test("NaN, infinite, zero and missing directions fall back to the frontal blow and never reach the bones", () => {
  for (const d of [undefined, null, {}, { x: NaN, z: NaN }, { x: 0, z: 0 }, { x: Infinity, z: 0 }, { x: 1e-12, z: 0 }, { x: "a", z: 1 }])
    assert.deepEqual(blowDirection(row, d), row.fallbackDirection);
  assert.deepEqual(blowDirection(row, { x: 3, z: 4 }), { x: 0.6, z: 0.8 });
  for (const d of [{ x: NaN, z: NaN }, { x: 0, z: 0 }, { x: Infinity, z: -Infinity }, undefined]) {
    const { root, model, bones } = rig();
    const view = { root, model };
    bodyReactionStart(view, shot(boss, "rocket", { impactDirection: d }));
    assert.ok(view.bodyReaction, "a bad direction still reacts, with the fallback");
    for (let t = 0; t < 40; t++) {
      clipPose(bones);
      bodyReactionStep(view, boss, 1 / 60);
      assert.ok(allFinite(bones), "finite bones");
    }
    bodyReactionEnd(view);
  }
  const { root, model } = rig();
  const view = { root, model };
  bodyReactionStart(view, shot(boss, "rifle", { amount: NaN }));
  assert.equal(view.bodyReaction, undefined);
  bodyReactionStart(view, shot(boss, "rifle"));
  bodyReactionStep(view, boss, NaN);
  bodyReactionStep(view, boss, -1);
  assert.ok(view.bodyReaction, "a non-finite or negative dt is ignored, not fatal");
  bodyReactionEnd(view);
});

// Frame t of a reaction on rig A (the clip rewrites every bone every frame) must equal the same frame on rig B (the clip never rewrites).
test("no drift: bones the clip does not rewrite get the same pose as bones it rewrites, and paused frames do not stack", () => {
  const run = (rewrite, dts) => {
    const { root, model, bones } = rig();
    const view = { root, model };
    clipPose(bones);
    bodyReactionStart(view, shot(boss, "shotgun"));
    const out = [];
    for (const dt of dts) {
      if (rewrite) clipPose(bones);
      bodyReactionStep(view, boss, dt);
      out.push(Object.values(bones).map((b) => b.quaternion.clone()));
    }
    return { out, view };
  };
  const dts = Array.from({ length: 20 }, () => 1 / 60);
  const a = run(true, dts),
    b = run(false, dts);
  a.out.forEach((frame, i) => frame.forEach((q, k) => assert.ok(q.angleTo(b.out[i][k]) < 1e-6, `frame ${i} bone ${k}`)));
  // paused: dt 0 for many frames in a row (DonorMotion skips resampling when there is no tick): the pose must not move
  const paused = run(false, [1 / 60, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  paused.out.slice(1).forEach((frame, i) => frame.forEach((q, k) => assert.ok(q.angleTo(paused.out[0][k]) < 1e-6, `paused frame ${i} bone ${k}`)));
  bodyReactionEnd(paused.view);
  bodyReactionEnd(a.view);
  bodyReactionEnd(b.view);
  assert.equal(activeBodyReactions(), 0);
});

test("a contacts-only pass shows the clip bones, does not age the reaction, and the next rendered pass lays it on again", () => {
  const { root, model, bones } = rig();
  const view = { root, model };
  clipPose(bones);
  const clip = Object.values(bones).map((b) => b.quaternion.clone());
  bodyReactionStart(view, shot(boss, "shotgun"));
  const peak = row.classes.shotgun.easeInSeconds + row.classes.shotgun.holdSeconds / 2;
  bodyReactionStep(view, boss, peak);
  const reacted = bones.Spine2.quaternion.clone();
  assert.ok(reacted.angleTo(clip[3]) > 1e-3);
  const age = view.bodyReaction.age;
  bodyReactionStep(view, boss, 1 / 60, true); // contactOnly
  Object.values(bones).forEach((b, k) => assert.ok(b.quaternion.angleTo(clip[k]) < 1e-6, `contact pass reads the clip pose, bone ${k}`));
  assert.equal(view.bodyReaction.age, age, "age frozen in a contacts pass");
  bodyReactionStep(view, boss, 0); // the rendered pass, same instant
  assert.ok(bones.Spine2.quaternion.angleTo(reacted) < 1e-6, "the reaction is back, same pose");
  bodyReactionEnd(view);
});
