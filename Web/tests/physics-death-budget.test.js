import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import {
  activeCount,
  killVector,
  markChunkLoaded,
  registerDeath,
  releaseDeath,
  stepDeath,
} from "../src/engine/physics-death-impl.js";
import * as THREE from "three";
import { physicsDeathStep, releasePhysicsDeath, usePhysicsDeathImpl } from "../src/engine/physics-death.js";

const CFG = GAME_DATA.physicsDeath;
const budgetRows = GAME_DATA.physicsBudget.rows;
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
  // the world clock is module-wide (one real world), so run the two cases one after the other
  const w1 = fakeWorld(),
    solo = corpse(w1);
  for (let i = 0; i < 20; i++) stepDeath(solo, DT);
  releaseDeath(solo);
  const w2 = fakeWorld(),
    x = corpse(w2),
    y = corpse(w2);
  for (let i = 0; i < 20; i++) {
    stepDeath(x, DT);
    stepDeath(y, DT);
  }
  assert.ok(Math.abs(w1.steps - w2.steps) <= 1, `solo ${w1.steps} steps, pair ${w2.steps}`);
  for (const s of [x, y]) releaseDeath(s);
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

test("__physicsDeathStats counts creations, releases and the active corpses, silently", () => {
  const stats = globalThis.__physicsDeathStats;
  assert.deepEqual(Object.keys(stats).sort(), ["active", "chunkLoaded", "created", "lastAt", "released"]);
  const logged = [];
  const log = console.log;
  console.log = (...a) => logged.push(a);
  try {
    const before = { ...stats };
    markChunkLoaded();
    assert.equal(stats.chunkLoaded, true);
    const s = registerDeath(corpse(fakeWorld()));
    assert.equal(stats.active, before.active + 1);
    releaseDeath(s);
    releaseDeath(s); // twice counts once
    assert.equal(stats.released, before.released + 1);
    assert.equal(stats.active, before.active);
  } finally {
    console.log = log;
  }
  assert.equal(logged.length, 0);
});

test("the kill impulse is aimed along the killing blow, else back from where the hunter faces, with the data's up part", () => {
  const k = CFG.killImpulse;
  const root = new THREE.Group(); // no yaw: render frame = sim frame
  const along = killVector(root, { deathImpact: { x: 0, z: 3 } });
  assert.deepEqual(along.map((v) => +v.toFixed(6)), [0, k.up, k.horizontal]);
  const back = killVector(root, { facing: { x: 1, z: 0 } });
  assert.deepEqual(back.map((v) => +v.toFixed(6)), [-k.horizontal, k.up, 0]);
  root.rotation.y = Math.PI / 2; // actor turned a quarter: a +z blow is along the actor's local -x or +x, same length
  const turned = killVector(root, { deathImpact: { x: 0, z: 1 } });
  assert.ok(Math.abs(Math.hypot(turned[0], turned[2]) - k.horizontal) < 1e-6);
  assert.ok(Math.abs(turned[2]) < 1e-6 && Math.abs(Math.abs(turned[0]) - k.horizontal) < 1e-6);
  assert.deepEqual(killVector(root, { deathImpact: { x: 0, z: 1 } }), turned); // deterministic
});

// The cut visuals of a corpse as cutSkin leaves them: the cut body in the scene, the hunter's own body hidden.
const cutCorpse = () => {
  const s = registerDeath(corpse(fakeWorld()));
  s.skin = {
    model: {
      removed: 0,
      removeFromParent() {
        this.removed++;
      },
    },
    hidden: { visible: false },
  };
  return s;
};
const loadChunk = async () => usePhysicsDeathImpl(await import("../src/engine/physics-death-impl.js"));

test("parking an area frees a corpse's body and slot but keeps its cut visuals; removing it later disposes them", async () => {
  await loadChunk();
  const before = activeCount();
  const s = cutCorpse(),
    rd = s.rd,
    skin = s.skin,
    view = { physicsDeath: s };
  releasePhysicsDeath(view, true);
  assert.equal(rd.destroyed, 1);
  assert.equal(activeCount(), before);
  assert.equal(view.physicsDeath, s); // the handle stays: the corpse is not re-ragdolled when the area wakes
  assert.equal(skin.model.removed, 0);
  assert.equal(skin.hidden.visible, false);
  releasePhysicsDeath(view); // the actor is removed for good
  assert.equal(view.physicsDeath, undefined);
  assert.equal(rd.destroyed, 1); // the body is not freed twice
  assert.equal(skin.model.removed, 1);
  assert.equal(skin.hidden.visible, true);
});

// A hunter whose rd.kill throws, on a skeleton the way the loaded GLBs have one. `cutLibrary`: the cut GLB is loaded first, so the cut path runs.
const skeleton = () => {
  const g = new THREE.Group();
  for (const joint of Object.values(CFG.parts))
    g.add(Object.assign(new THREE.Bone(), { name: THREE.PropertyBinding.sanitizeNodeName(GAME_DATA.physicsBody.nodePrefix + joint) }));
  return g;
};
async function killThatThrows(cutLibrary) {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl);
  if (cutLibrary) await impl.loadCutAssets(cutLibrary);
  const world = await impl.loadWorld(),
    made = [],
    create = world.createRagdoll,
    root = new THREE.Group();
  let sceneAtKill = -1;
  world.createRagdoll = function (...a) {
    const rd = create.apply(this, a),
      destroy = rd.destroy.bind(rd);
    rd.destroyed = 0;
    rd.kill = () => {
      sceneAtKill = root.children.length; // 2 = the hunter's body and the cut skin beside it
      throw new Error("kill blew up");
    };
    rd.destroy = () => {
      rd.destroyed++;
      destroy();
    };
    made.push(rd);
    return rd;
  };
  try {
    const bind = skeleton(),
      model = skeleton();
    root.add(model);
    const view = { root, model, physicsDeath: undefined },
      library = { models: new Map([[CFG.rigRef, { gltf: { scene: bind } }]]) },
      before = activeCount();
    // The cut roll can come up "no cut" (data: chance, pityAfter); the pity rule guarantees one within a few kills.
    let kills = 0;
    do {
      const entity = { id: 7 + kills, markedHunter: true, hp: 0, maxHP: 10, deathImpact: { x: 0, z: 1, weapon: "pistol" } };
      view.physicsDeath = undefined;
      assert.equal(physicsDeathStep(view, entity, library, DT, true), false); // the baked clip plays
      assert.deepEqual(view.physicsDeath, { failed: true });
      kills++;
    } while (cutLibrary && sceneAtKill !== 2 && kills < 8);
    if (cutLibrary) assert.equal(sceneAtKill, 2, "the cut path ran before the kill threw");
    assert.equal(made.length, kills);
    for (const rd of made) assert.equal(rd.destroyed, 1); // each ragdoll is destroyed, not left in the pool or the world
    assert.equal(activeCount(), before);
    assert.equal(model.visible, true);
    assert.equal(root.children.length, 1); // no cut skin left in the scene
  } finally {
    world.createRagdoll = create;
  }
}

test("a throw while the death starts (rd.kill) gives back the hunter's body and the pooled ragdoll", () => killThatThrows(null));

test("a throw while a CUT death starts (rd.kill, cut GLB loaded) removes the cut skin, shows the hunter and frees the ragdoll", () =>
  killThatThrows({
    ensureModels: async () => {},
    models: new Map([[GAME_DATA.pitbornCuts.cutModel, { gltf: { scene: skeleton() } }]]),
  }));

test("a throw while the cut path is undone (the pooled ragdoll was already taken) still destroys the ragdoll", async () => {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl); // the cut GLB is loaded by the test above
  const world = await impl.loadWorld(),
    made = [],
    create = world.createRagdoll;
  world.createRagdoll = function (...a) {
    const rd = create.apply(this, a),
      destroy = rd.destroy.bind(rd);
    rd.destroyed = 0;
    rd.destroy = () => {
      rd.destroyed++;
      destroy();
    };
    made.push(rd);
    return rd;
  };
  try {
    let undoThrew = 0;
    const model = skeleton(),
      root = new THREE.Group();
    root.add(model);
    let shown = true;
    Object.defineProperty(model, "visible", {
      get: () => shown,
      set(v) {
        if (v) {
          undoThrew++;
          throw new Error("un-hiding blew up");
        }
        shown = v;
      },
    });
    // view.root = null makes the cut path's rig build throw, so the cut path is undone; undoing it throws too.
    const view = { root: null, model, physicsDeath: undefined },
      library = { models: new Map([[CFG.rigRef, { gltf: { scene: skeleton() } }]]) },
      before = activeCount();
    root.add(new THREE.Group()); // keeps `model.parent` set for the cut skin
    let kills = 0;
    do {
      const entity = { id: 90 + kills, markedHunter: true, hp: 0, maxHP: 10, deathImpact: { x: 0, z: 1, weapon: "pistol" } };
      view.physicsDeath = undefined;
      assert.equal(physicsDeathStep(view, entity, library, DT, true), false);
      kills++;
    } while (!undoThrew && kills < 8);
    assert.ok(undoThrew, "the undo path was reached");
    assert.equal(made.length, kills);
    for (const rd of made) assert.equal(rd.destroyed, 1); // none left out of the pool and the world
    assert.equal(activeCount(), before);
  } finally {
    world.createRagdoll = create;
  }
});

test("past the simultaneous-ragdoll budget row the next death takes the baked clip and no body", async () => {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl);
  const world = await impl.loadWorld(),
    create = world.createRagdoll;
  let created = 0;
  world.createRagdoll = function (...a) {
    created++;
    return create.apply(this, a);
  };
  const held = [];
  try {
    while (activeCount() < budgetRows.max_simultaneous_ragdolls) held.push(registerDeath(corpse(fakeWorld())));
    const view = { root: new THREE.Group(), model: skeleton(), physicsDeath: undefined },
      entity = { id: 50, markedHunter: true, hp: 0, maxHP: 10, deathImpact: { x: 0, z: 1, weapon: "pistol" } },
      library = { models: new Map([[CFG.rigRef, { gltf: { scene: skeleton() } }]]) },
      pooled = created;
    assert.equal(physicsDeathStep(view, entity, library, DT, true), false);
    assert.deepEqual(view.physicsDeath, { failed: true });
    assert.equal(created, pooled); // no ragdoll was built for it
    assert.equal(activeCount(), budgetRows.max_simultaneous_ragdolls);
    assert.equal(physicsDeathStep(view, entity, library, DT, true), false); // and it stays on the clip
  } finally {
    world.createRagdoll = create;
    for (const s of held) releaseDeath(s);
  }
});

test("a ragdoll that throws mid-step frees its body and cut visuals and shows the hunter's own body again", async () => {
  await loadChunk();
  const before = activeCount();
  const s = cutCorpse(),
    rd = s.rd,
    skin = s.skin;
  s.physics.step = () => {
    throw new Error("physics blew up");
  };
  const view = { physicsDeath: s },
    entity = { markedHunter: true, hp: 0, maxHP: 10 };
  assert.equal(physicsDeathStep(view, entity, {}, DT, true), false); // the baked clip plays
  assert.deepEqual(view.physicsDeath, { failed: true });
  assert.equal(rd.destroyed, 1);
  assert.equal(activeCount(), before);
  assert.equal(skin.model.removed, 1);
  assert.equal(skin.hidden.visible, true);
  assert.equal(physicsDeathStep(view, entity, {}, DT, true), false); // and it stays on the clip
});
