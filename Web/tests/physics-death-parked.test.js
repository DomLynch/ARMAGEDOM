// Parked ragdolls cost nothing per frame: the pool creates them asleep (`parked: true`), a death wakes one with `acquire`, and the refill is parked too.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";

const CFG = GAME_DATA.physicsDeath;
const skeleton = () => {
  const g = new THREE.Group();
  for (const joint of Object.values(CFG.parts))
    g.add(
      Object.assign(new THREE.Bone(), {
        name: THREE.PropertyBinding.sanitizeNodeName(GAME_DATA.physicsBody.nodePrefix + joint),
      }),
    );
  return g;
};

test("the pool is created parked, a death acquires one, and the refill is parked", async (t) => {
  const impl = await import("../src/engine/physics-death-impl.js");
  const world = await impl.loadWorld(),
    create = world.createRagdoll,
    made = [];
  world.createRagdoll = function (row, opts) {
    const rd = create.call(this, row, opts),
      entry = { opts, rd, acquired: 0, calls: [] };
    // every call that is a no-op (or worse) on a parked body, in order: acquire has to come first
    for (const name of ["acquire", "setRoot", "setTargetPose", "snapToTarget", "kill", "applyImpulse", "reset"]) {
      const fn = rd[name];
      if (typeof fn !== "function") continue;
      rd[name] = (...a) => {
        entry.calls.push(name);
        if (name === "acquire") entry.acquired++;
        else entry.parkedAtCall ??= rd.parked;
        return fn.apply(rd, a);
      };
    }
    made.push(entry);
    return rd;
  };
  t.after(() => {
    world.createRagdoll = create;
    mock.timers.reset();
  });
  impl.warm();
  assert.ok(made.length > 0, "warm builds the pool");
  for (const m of made) assert.equal(m.opts.parked, true, "a pooled ragdoll is created parked");
  const pooled = made.length;
  mock.timers.enable({ apis: ["setTimeout"] });
  const view = { root: new THREE.Group(), model: skeleton(), physicsDeath: undefined },
    s = impl.startDeath(view, skeleton(), { id: 9, markedHunter: true, hp: 0, maxHP: 10, deathImpact: { x: 0, z: 1 } });
  assert.ok(s, "the death got a ragdoll");
  assert.equal(made.length, pooled, "it came from the pool, nothing was built in the death frame");
  const taken = made.find((m) => m.rd === s.rd);
  assert.ok(taken, "the corpse is one of the pooled bodies");
  assert.equal(taken.acquired, 1, "the death woke it with acquire");
  assert.equal(taken.calls[0], "acquire", "acquire comes before setRoot, snapToTarget and kill");
  assert.ok(taken.calls.includes("kill"), "and the kill followed");
  assert.notEqual(taken.parkedAtCall, true, "no other call reached the body while it was still parked");
  assert.equal(taken.rd.parked, false, "the corpse is awake");
  for (const m of made) if (m !== taken) assert.equal(m.rd.parked, true, "the rest of the pool stays asleep");
  mock.timers.tick(CFG.rewarmMs);
  assert.equal(made.length, pooled + 1, "the refill built one more");
  assert.equal(made.at(-1).opts.parked, true, "and parked it");
  impl.releaseDeath(s);
});
