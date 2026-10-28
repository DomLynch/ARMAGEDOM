// The local player and the other players (presence) ragdoll on death: rows, ranks under the cap, respawn clean-up and the remote hook.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validatePhysicsBudget, validatePhysicsDeath } from "../src/engine/game-data-hunters.js";
import { activeCount, rankOf, registerDeath, releaseDeath, tierCaps } from "../src/engine/physics-death-impl.js";
import { physicsDeathStep, releasePhysicsDeath, usePhysicsDeathImpl } from "../src/engine/physics-death.js";
import { rigOf } from "../src/engine/physics-rigs.js";
import { createRemotePlayers } from "../src/engine/remote-players.js";
import { createRemotePlayersView } from "../src/engine/remote-players-view.js";

const RIGS = GAME_DATA.physicsRigs,
  CFG = GAME_DATA.physicsDeath,
  BUDGET = GAME_DATA.physicsBudget,
  CAP = tierCaps().humanoid, // the tier's dying cap (a node run is the full tier: no probe)
  DT = 1 / CFG.stepHz,
  manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")).models;

const fakeCorpse = (rank) =>
  registerDeath({
    physics: { step() {} },
    rd: { awake: true, destroy() {} },
    rig: { applyPose() {} },
    age: 0,
    frozen: false,
    rank,
  });
// A skeleton the way the 65-bone GLBs have one: the rig's bone names, at the body row's measured joint positions.
const skeleton = () => {
  const g = new THREE.Group(),
    parts = RIGS.rigs["v1-65"].parts,
    joints = RIGS.bodies["scavenger-65"].joints;
  for (const [part, bone] of Object.entries(parts)) {
    const b = new THREE.Bone();
    b.name = bone;
    b.position.set(...joints[CFG.parts[part]]);
    g.add(b);
  }
  return g;
};
const player = (extra = {}) => ({ id: 0, kind: -1, hp: 0, maxHP: 10, response: { clip: "Death", start: 1 }, ...extra });
const playerView = () => ({ root: new THREE.Group(), model: skeleton(), description: manifest.vagrant, physicsDeath: undefined });
const library = () => ({ models: new Map([["vagrant", { description: manifest.vagrant, gltf: { scene: skeleton() } }]]) });
const loadChunk = async () => {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl);
  await impl.loadWorld();
  return impl;
};

test("the player model and the remote survivor have live rows on the unscaled scavenger body, measured from their own GLB", () => {
  for (const name of ["vagrant", CFG.remote.modelRef]) {
    assert.equal(RIGS.models[name].live, true, name);
    assert.equal(rigOf(name).body, RIGS.bodies["scavenger-65"], name);
    assert.equal(manifest[name].scale, 1, `${name}: the manifest scale is baked into the row, so the row is unscaled`);
  }
  assert.equal(RIGS.bodies["scavenger-65"].scale_baked, 1);
  // the same bind-pose measurement (tools/glb-measure.mjs on warrior-phone.glb and remote-survivor.glb) gave this exact row: height 1.6834 m
  assert.equal(RIGS.bodies["scavenger-65"].height_m, 1.6834);
});

test("ranks come from data: the local player above a hunter or boss, above a remote player, above the crowd", () => {
  const r = BUDGET.ranks;
  assert.ok(r.crowd < r.remote && r.remote < r.marked && r.marked < r.player);
  assert.equal(rankOf(player()), r.player);
  assert.equal(rankOf({ id: 0, hp: 0 }), r.crowd, "id 0 without the player kind is not the player");
  for (const flag of BUDGET.reserve_for_marked) assert.equal(rankOf({ id: 9, [flag]: true }), r.marked, flag);
  assert.equal(rankOf({ id: 4, remotePlayer: true }), r.remote);
  assert.equal(rankOf({ id: 4 }), r.crowd);
  const bad = structuredClone(BUDGET);
  bad.ranks.remote = bad.ranks.player;
  assert.throws(() => validatePhysicsBudget(bad));
  const noRemote = structuredClone(CFG);
  delete noRemote.remote;
  assert.throws(() => validatePhysicsDeath(noRemote));
});

test("the player's death ragdolls, a respawn gives the body back, and the second death ragdolls again", async () => {
  await loadChunk();
  const before = activeCount(),
    view = playerView(),
    lib = library(),
    entity = player();
  assert.equal(physicsDeathStep(view, entity, lib, DT, true), true);
  const first = view.physicsDeath,
    rd = first.rd;
  assert.ok(first && !first.failed);
  assert.equal(activeCount(), before + 1);
  for (let i = 0; i < 10; i++) assert.equal(physicsDeathStep(view, entity, lib, DT, true), true);
  // respawn: hp back. The old corpse is released at once and the clip owns the bones again.
  entity.hp = entity.maxHP;
  entity.response = null;
  assert.equal(physicsDeathStep(view, entity, lib, DT, true), false);
  assert.equal(view.physicsDeath, undefined);
  assert.equal(first.rd, null);
  assert.ok(rd);
  assert.equal(activeCount(), before);
  // dies again: a fresh ragdoll, not the freed one
  Object.assign(entity, { hp: 0, response: { clip: "Death", start: 5 } });
  assert.equal(physicsDeathStep(view, entity, lib, DT, true), true);
  assert.notEqual(view.physicsDeath, first);
  assert.equal(activeCount(), before + 1);
  releasePhysicsDeath(view); // the retry removes the view (actors.reset -> remove)
  assert.equal(activeCount(), before);
  assert.equal(view.physicsDeath, undefined);
});

test("the player never loses the ragdoll to a full pool: crowd corpses are evicted for it, and nothing evicts the player", async () => {
  const impl = await loadChunk(),
    held = [];
  try {
    while (activeCount() < CAP) held.push(fakeCorpse(BUDGET.ranks.crowd));
    const view = playerView(),
      lib = library();
    assert.equal(physicsDeathStep(view, player(), lib, DT, true), true, "player death took a body although the pool was full of crowd");
    assert.ok(held[0].rd === null, "the oldest crowd corpse's body was freed for it");
    assert.equal(activeCount(), CAP);
    const mine = view.physicsDeath;
    // a hunter, a boss and a remote player die after: none can take the player's body
    for (const extra of [{ markedHunter: true }, { bossProfile: {} }, { remotePlayer: true }, {}]) {
      const other = { root: new THREE.Group(), model: skeleton(), physicsDeath: undefined },
        s = impl.startDeath(other, skeleton(), { id: 70, hp: 0, maxHP: 10, ...extra }, rigOf("vagrant"));
      if (s) held.push(s);
      assert.ok(mine.rd, `the player's body survived a ${Object.keys(extra)[0] ?? "crowd"} death`);
    }
    releasePhysicsDeath(view);
  } finally {
    for (const s of held) releaseDeath(s);
  }
});

test("eviction order: crowd first, then remote players, then (for a hunter) never the player", async () => {
  const impl = await loadChunk(),
    held = [fakeCorpse(BUDGET.ranks.remote), fakeCorpse(BUDGET.ranks.crowd), fakeCorpse(BUDGET.ranks.player)];
  try {
    const mk = () => ({ root: new THREE.Group(), model: skeleton(), physicsDeath: undefined }),
      hunterA = impl.startDeath(mk(), skeleton(), { id: 71, markedHunter: true, hp: 0, maxHP: 10 }, rigOf("vagrant"));
    assert.ok(hunterA);
    held.push(hunterA);
    assert.equal(held[1].rd, null, "the crowd corpse went first although the remote one is older");
    assert.ok(held[0].rd, "the remote corpse is still there");
    const hunterB = impl.startDeath(mk(), skeleton(), { id: 72, bossProfile: {}, hp: 0, maxHP: 10 }, rigOf("vagrant"));
    assert.ok(hunterB);
    held.push(hunterB);
    assert.equal(held[0].rd, null, "then the remote corpse");
    assert.ok(held[2].rd, "the player's corpse is never taken");
    // the pool now holds the player and two hunters: a third hunter finds nobody lower than it and is baked
    assert.equal(impl.startDeath(mk(), skeleton(), { id: 73, markedHunter: true, hp: 0, maxHP: 10 }, rigOf("vagrant")), null);
  } finally {
    for (const s of held) releaseDeath(s);
  }
});

test("over the cap with no lower rank to evict, a crowd death is baked and the player's is not", async () => {
  await loadChunk();
  const held = [];
  try {
    while (activeCount() < CAP) held.push(fakeCorpse(BUDGET.ranks.marked));
    const crowd = { root: new THREE.Group(), model: skeleton(), description: manifest["hollow-scavenger"], physicsDeath: undefined },
      lib = library();
    lib.models.set("hollow-scavenger", { description: manifest["hollow-scavenger"], gltf: { scene: skeleton() } });
    assert.equal(physicsDeathStep(crowd, { id: 90, hp: 0, maxHP: 10 }, lib, DT, true), false);
    assert.deepEqual(crowd.physicsDeath, { failed: true });
    const view = playerView();
    assert.equal(physicsDeathStep(view, player(), lib, DT, true), true);
    assert.equal(activeCount(), CAP);
    releasePhysicsDeath(view);
  } finally {
    for (const s of held) releaseDeath(s);
  }
});

test("a dead player who is already dead when drawn (a reload) or a restored corpse lies baked and never falls", async () => {
  const impl = await loadChunk(),
    lib = library(),
    before = activeCount(),
    view = playerView();
  assert.equal(physicsDeathStep(view, player({ response: null }), lib, DT, true), false);
  assert.equal(view.physicsDeath, undefined);
  assert.equal(activeCount(), before);
  const crowd = { ...playerView(), description: manifest["hollow-scavenger"], restoredCorpse: true };
  lib.models.set("hollow-scavenger", { description: manifest["hollow-scavenger"], gltf: { scene: skeleton() } });
  assert.equal(physicsDeathStep(crowd, { id: 91, hp: 0, maxHP: 10 }, lib, DT, true), false);
  assert.equal(activeCount(), before);
  assert.ok(impl);
});

test("?physics=0 keeps the player's baked death and takes no body", async () => {
  await loadChunk();
  const before = activeCount();
  assert.equal(physicsDeathStep(playerView(), player(), library(), DT, false), false);
  assert.equal(activeCount(), before);
});

test("a presence row with the death field marks that player dead in the sample; anything else is alive; leaving clears it", () => {
  const remote = createRemotePlayers({ selfId: () => 0 }),
    field = CFG.remote.deathField;
  remote.apply({ players: [{ id: 5, x: 100, z: 100, [field]: true }, { id: 6, x: 0, z: 0, [field]: "yes" }, { id: 7, x: 0, z: 0 }] }, 1000);
  const byId = Object.fromEntries(remote.sample(1200).map((p) => [p.id, p.dead]));
  assert.deepEqual(byId, { 5: true, 6: false, 7: false });
  remote.apply({ players: [{ id: 5, x: 100, z: 100 }] }, 1100); // respawned
  assert.equal(remote.sample(1300).find((p) => p.id === 5).dead, false);
});

// A kit whose figures count what the view does to them.
const kitOf = () => {
  const kit = { spawned: [] };
  kit.spawn = () => {
    const root = new THREE.Group(),
      body = new THREE.Group(),
      model = new THREE.Group(),
      fig = { root, body, model, updates: 0, baked: 0, disposed: 0 };
    body.add(model);
    root.add(body);
    fig.update = () => fig.updates++;
    fig.dieBaked = () => fig.baked++;
    fig.dispose = () => fig.disposed++;
    kit.spawned.push(fig);
    return fig;
  };
  return kit;
};
const sampleOf = (dead) => [{ id: 12, x: 1, z: 2, facing: 0.5, moving: false, name: null, dead }];

test("a remote player's death starts the same ragdoll path, with its own body, until they respawn", () => {
  const kit = kitOf(),
    calls = [],
    released = [];
  let owns = true;
  const view = createRemotePlayersView({
    scene: new THREE.Scene(),
    toRender: (p) => new THREE.Vector3(p.x, 0, p.z),
    survivors: kit,
    death: {
      step: (v, e, dt) => (calls.push({ v, e, dt }), owns),
      release: (v) => released.push(v),
    },
  });
  view.update(sampleOf(false));
  assert.equal(kit.spawned.length, 1);
  assert.equal(kit.spawned[0].updates, 1);
  view.update(sampleOf(true));
  view.update(sampleOf(true));
  assert.equal(calls.length, 2);
  const { v, e } = calls[0];
  assert.equal(e.remotePlayer, true);
  assert.equal(e.hp, 0);
  assert.equal(e.id, 12);
  assert.equal(rankOf(e), BUDGET.ranks.remote);
  assert.equal(v.root, kit.spawned[0].body, "the ragdoll frame is the scaled body group");
  assert.equal(v.model, kit.spawned[0].model);
  assert.equal(kit.spawned[0].updates, 1, "the mixer does not run while the ragdoll owns the bones");
  assert.equal(kit.spawned[0].baked, 0);
  // respawn: the body goes back to the pool and a standing figure replaces the fallen one
  view.update(sampleOf(false));
  assert.deepEqual(released, [v]);
  assert.equal(kit.spawned.length, 2);
  assert.equal(kit.spawned[0].disposed, 1);
  assert.equal(kit.spawned[1].updates, 1);
  // leaves the area while dead: the body is released too
  view.update(sampleOf(true));
  view.update([]);
  assert.equal(released.length, 2);
  view.dispose();
});

test("a remote death with no body to take plays the baked death once and does not retry the ragdoll", () => {
  const kit = kitOf();
  let steps = 0;
  const view = createRemotePlayersView({
    scene: new THREE.Scene(),
    toRender: (p) => new THREE.Vector3(p.x, 0, p.z),
    survivors: kit,
    death: { step: () => (steps++, false), release() {} },
  });
  for (let i = 0; i < 4; i++) view.update(sampleOf(true));
  assert.equal(steps, 1);
  assert.equal(kit.spawned[0].baked, 1);
  assert.equal(kit.spawned[0].updates, 4, "the baked clip keeps advancing through the figure's own update");
  view.dispose();
});
