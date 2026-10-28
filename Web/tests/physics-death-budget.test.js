import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { activeCount, registerDeath, releaseDeath, stepDeath } from "../src/engine/physics-death-impl.js";
import { releasePhysicsDeath } from "../src/engine/physics-death.js";

const CFG = GAME_DATA.physicsDeath;
const DT = 1 / CFG.stepHz;

// A stand-in for the shared physics world: it counts steps, like the real one that advances every ragdoll per step.
const fakeWorld = () => ({
  steps: 0,
  step() {
    this.steps++;
  },
});
const corpse = (physics) => ({
  physics,
  rd: {
    awake: true,
    destroyed: 0,
    destroy() {
      this.destroyed++;
    },
  },
  rig: {
    poses: 0,
    applyPose() {
      this.poses++;
    },
  },
  age: 0,
  frozen: false,
});

test("the shared world steps once per frame however many corpses are active", () => {
  const world = fakeWorld();
  const a = corpse(world),
    b = corpse(world);
  const frames = 30;
  for (let i = 0; i < frames; i++) {
    stepDeath(a, DT);
    stepDeath(b, DT);
  }
  assert.ok(Math.abs(world.steps - frames) <= 1, `${world.steps} world steps for ${frames} frames and 2 corpses`);
  assert.equal(a.rig.poses, frames);
  assert.equal(b.rig.poses, frames); // each corpse still follows its own capsules every frame
  for (const s of [a, b]) releaseDeath(s);
});

test("a single corpse steps the same number of times as two", () => {
  const w1 = fakeWorld(),
    w2 = fakeWorld();
  const solo = corpse(w1),
    x = corpse(w2),
    y = corpse(w2);
  for (let i = 0; i < 20; i++) {
    stepDeath(solo, DT);
    stepDeath(x, DT);
    stepDeath(y, DT);
  }
  assert.ok(Math.abs(w1.steps - w2.steps) <= 1);
  for (const s of [solo, x, y]) releaseDeath(s);
});

test("releasing a corpse frees its body and active entry, and twice is safe", () => {
  const before = activeCount();
  const s = registerDeath(corpse(fakeWorld()));
  assert.equal(activeCount(), before + 1);
  const rd = s.rd;
  releaseDeath(s);
  assert.equal(rd.destroyed, 1);
  assert.equal(s.rd, null);
  assert.equal(activeCount(), before);
  assert.doesNotThrow(() => releaseDeath(s));
  assert.equal(rd.destroyed, 1);
});

test("removing an actor view releases its ragdoll (travel or despawn before the settle time)", () => {
  const view = { physicsDeath: undefined };
  assert.doesNotThrow(() => releasePhysicsDeath(view)); // no ragdoll: nothing to do
  view.physicsDeath = { failed: true };
  assert.doesNotThrow(() => releasePhysicsDeath(view)); // the failed marker has no body
  assert.equal(view.physicsDeath, undefined);
});

test("past maxActive the oldest live corpse is frozen and its body freed", () => {
  const world = fakeWorld();
  const made = [];
  for (let i = 0; i < CFG.maxActive + 1; i++) made.push(registerDeath(corpse(world)));
  const frozen = made.filter((s) => s.frozen);
  assert.equal(frozen.length, 1);
  assert.equal(made[0].frozen, true);
  assert.equal(made[0].rd, null);
  for (const s of made) releaseDeath(s);
});
