// LAZY chunk: loaded only with ?physics=1 (see physics-death.js). Jolt WASM + @frankendom/physics + the body measure row live here and nowhere else.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { admit, buildChainRow, chainRigOptions, createPhysics, loadChainBody } from "@frankendom/physics";
import { createThreeRig } from "@frankendom/physics/three-rig";
import { createCutRig } from "@frankendom/physics/three-cuts";
import { GAME_DATA } from "./game-data.js";
import { QUALITY } from "./quality-tier.js";
import { createLateCuts, cutsEnabled, manifestUnits, planCut } from "./finisher-cuts.js";
import { impulseRow } from "./physics-death-impulse.js";
import { createTierCaps } from "./physics-cap.js";
import { liveBodies, rigOf } from "./physics-rigs.js";
import FLOOR from "../data/physicsFloor.json" with { type: "json" }; // lazy chunk only: about 150 KB of vertices that the main bundle never needs

const CFG = GAME_DATA.physicsDeath,
  CUTS = GAME_DATA.pitbornCuts,
  CUT_MANIFEST = GAME_DATA.pitbornCutManifest,
  chains = new Map(),
  // The package's body of that name, with its row rebuilt at scale 1: the actor root already carries the model scale (characterScale x description.scale
  // x ...), so the ragdoll lives in model units like the humanoid rows. Masses are the package's times the record's `massScale` (a smaller creature on
  // the same skeleton). A frame body (the drone) has no scaled actor root to ride: its ragdoll lives in metres under an unscaled frame and keeps the
  // package row as it is.
  chainOf = (spec) => {
    if (!chains.has(spec.key)) {
      const body = loadChainBody(spec.chain),
        segments = body.spec.segments.map((seg) => ({ ...seg, mass: seg.mass * spec.massScale }));
      chains.set(
        spec.key,
        spec.frame ? body : { ...body, row: buildChainRow({ ...body.spec, scale: 1, segments }, body.bones) },
      );
    }
    return chains.get(spec.key);
  },
  // GAME_DATA is frozen; the package gets its own copy of the model's body row
  ROW = (spec) => structuredClone(spec.chain ? chainOf(spec).row : spec.body);

let world = null;
export async function loadWorld() {
  return (world ??= await createPhysics({ seed: CFG.seed }));
}

// `spec` is the model's record from physics-rigs.js (bone map and body row, or a chain body name): the same code ragdolls every rig in the data.
const find = (scene) => (name) => scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
const boneMap = (scene, spec) =>
  Object.fromEntries(
    Object.entries(spec.parts).map(([part, joint]) => [
      part,
      find(scene)(spec.nodePrefix + joint) ?? virtualBone(scene, spec, part),
    ]),
  );
// A chain body's bones and rig options (virtual parts, followers) in the package's one call; `bind` is the untouched model.
const chainRig = (spec, scene, bind) =>
  chainRigOptions(chainOf(spec), find(scene), { bindFind: find(bind), bindRoot: bind });
// A procedural body with no skeleton (the drone): an unscaled frame on the floor under the model, turned like the model, and one empty node named like
// the package's single bone at the model's left end. The model is seated under the node when the ragdoll starts, so it rides the capsule as one piece.
function frameOf(view, chain) {
  const root = view.root,
    frame = new THREE.Group(),
    node = new THREE.Object3D(),
    end = new THREE.Vector3(...Object.values(chain.bones.bones)[0].pos).multiplyScalar(chain.spec.scale);
  node.name = Object.values(chain.boneMap)[0];
  frame.position.set(root.position.x, 0, root.position.z);
  frame.rotation.y = root.rotation.y;
  node.position.set(end.x, root.position.y, 0);
  frame.add(node);
  root.parent.add(frame);
  return { frame, node, root, parent: root.parent };
}
// A part the rig has no bone for (the 19-joint vagrant has no toes): an empty node with an identity local transform under its parent joint
// (`virtual[part]`), found by name next time. The package puts that part at the measured offset from the parent joint.
function virtualBone(scene, spec, part) {
  const parent = spec.virtual[part] && find(scene)(spec.nodePrefix + spec.virtual[part]);
  if (!parent) return null;
  const node = new THREE.Object3D();
  node.name = THREE.PropertyBinding.sanitizeNodeName(spec.nodePrefix + spec.parts[part]);
  parent.add(node);
  return node;
}

// Hand the hunter's last animated pose (the bones, as the previous frame left them) to a ragdoll. `view.root` is the actor group,
// `view.model` the clone, `bindScene` the untouched loaded glTF scene (the bind pose the body row was measured in). Synchronous.
// Parked ragdolls: built on idle after the preload so the death frame only claims one. A parked ragdoll is never stepped (the world is
// stepped only while a corpse is moving), so it costs nothing per frame; the pool is refilled after the corpse is freed.
// Crowd budget (mass mobs, kills in bursts): `poolSize` parked bodies, refilled ONE per kill so a burst never builds many at once; at most
// `maxActive` corpses simulate at the same time, the oldest is frozen where it lies (pose kept, no more steps) when a new death starts.
// One pool per body row (a parked ragdoll is built from one row); the marked hunter's is filled at once, every other live body's one rewarmMs later
// after the previous, so the idle warm-up never builds all of them in one frame.
const pools = new Map(),
  active = [],
  poolOf = (spec) => pools.get(spec.key) ?? pools.set(spec.key, []).get(spec.key);
// Parked ragdolls are awake capsules that the shared world updates on every step, so the TOTAL across every row is bounded (`maxParked`, data): the
// first live bodies in physicsRigs.json order fill it, and a body past it (the MakeHuman crowd bodies) builds its ragdoll on its first death instead.
export const parkedCount = () => [...pools.values()].reduce((sum, pool) => sum + pool.length, 0);
function warmOne(spec) {
  const pool = poolOf(spec);
  if (pool.length < QUALITY.cap(CFG.poolSize, "ragdolls") && parkedCount() < CFG.maxParked)
    pool.push(world.createRagdoll(ROW(spec), { position: [0, 0, 0], id: "parked", parked: true })); // created asleep: 0 ms per step until acquired
}
const fill = (spec) => {
  for (let i = 0; world && i < QUALITY.cap(CFG.poolSize, "ragdolls"); i++) warmOne(spec);
};
export function warm() {
  const [first, ...rest] = liveBodies();
  fill(first);
  rest.forEach((spec, i) => setTimeout(() => fill(spec), CFG.rewarmMs * (i + 1)));
  world.step(1 / CFG.stepHz); // first step compiles the paths the death frame would otherwise pay for
}

// Silent always-on diagnostic: read it from the console or a harness (`__physicsDeathStats`); nothing is ever logged.
const stats = (globalThis.__physicsDeathStats ??= {
  created: 0,
  released: 0,
  active: 0,
  lastAt: 0,
  chunkLoaded: false,
});
export const markChunkLoaded = () => (stats.chunkLoaded = true);

// The impulse in the sim frame (= the actor root's local frame): `horizontal` along the killing blow (the hit's impactDirection, else
// away from where the hunter faces, i.e. back from the player it was walking at) plus `up`. Pure arithmetic: same hit, same fall.
export function killVector(root, entity) {
  const k = impulseRow(entity.deathImpact),
    d = entity.deathImpact ?? (entity.facing ? { x: -entity.facing.x, z: -entity.facing.z } : { x: 0, z: -1 }),
    len = Math.hypot(d.x, d.z) || 1,
    // the root's WORLD turn, as the rig's own frame is (a remote body sits under a yawed group)
    local = new THREE.Vector3(d.x / len, 0, d.z / len).applyQuaternion(
      root.getWorldQuaternion(new THREE.Quaternion()).invert(),
    );
  return [local.x * k.horizontal, k.up, local.z * k.horizontal];
}

// The Pitborn's cut GLB (a deferred model of the actor library, about 2 MB gzip) and its cut manifest (data/pitbornCutManifest.json): fetched once,
// on demand, only after a marked hunter is wounded. Until it is here (or if it never loads, or ?cuts=0) every death is the plain ragdoll:
// nothing below runs and nothing waits.
let cutAssets = null,
  cutLoading = null;
export function loadCutAssets(library) {
  return (cutLoading ??= Promise.resolve(library.ensureModels([CUTS.cutModel])).then(() => {
    const scene = library.models.get(CUTS.cutModel).gltf.scene;
    return (cutAssets = { scene, manifest: CUT_MANIFEST, units: manifestUnits(CUT_MANIFEST) });
  }));
}
export const cutsReady = () => cutAssets !== null;

const capRows = () => ({
  flesh: { color: `#${CUTS.capTint.flesh}` },
  inner: { color: `#${CUTS.capTint.inner}` },
  blood: { tint: `#${CUTS.capTint.blood}`, amount: CUTS.capTint.amount },
});

// Swap the hunter's body for the cut GLB at the moment of death: a clone of the cut scene takes the model's place and pose (the cleaver is part of
// the cut GLB, under the hand bone, so it travels with the arm piece), and the cut GLB's skeleton (the same 106 joints) is what the ragdoll
// drives. `undoSkin` puts everything back.
function cutSkin(view) {
  const model = clone(cutAssets.scene);
  model.position.copy(view.model.position);
  model.quaternion.copy(view.model.quaternion);
  model.scale.copy(view.model.scale);
  view.model.parent.add(model);
  view.model.traverse((o) => {
    const t = o.isBone ? model.getObjectByName(o.name) : null;
    if (t) {
      t.position.copy(o.position);
      t.quaternion.copy(o.quaternion);
      t.scale.copy(o.scale);
    }
  });
  view.model.visible = false;
  return { model, bind: cutAssets.scene, hidden: view.model };
}
function undoSkin(skin) {
  if (!skin) return;
  skin.model.removeFromParent();
  skin.hidden.visible = true;
}

// One severable unit leaves the body: the package detaches it (rd.cut), pushed along the killing blow. A unit the ragdoll refuses is skipped, never fatal.
function cutUnit(s, unit) {
  try {
    const row = s.plan.row,
      d = s.push,
      len = Math.hypot(...d) || 1,
      cut = s.rd?.cut(unit, { impulse: d.map((v) => (v / len) * row.pieceImpulse) });
    if (cut && !cut.visual_only) {
      s.pieces++;
      pieces++;
    }
  } catch {
    /* the plain body stays whole for this unit */
  }
}
let pieces = 0; // detached pieces simulating across every corpse (data: maxPieceBodies); visual-only cuts cost no body
function beginCuts(s, plan, skin, push) {
  const cutRig = createCutRig(THREE, s.rd, skin.model, cutAssets.manifest, { rows: capRows() });
  Object.assign(s, { plan, skin, push, cutRig, pieces: 0, late: createLateCuts() });
  for (const step of plan.steps) {
    if (step.atS > 0) s.late.add(step.unit, step.atS);
    else if (pieces < CUTS.maxPieceBodies) cutUnit(s, step.unit);
  }
  s.cutRig.update();
}
// A corpse's cut visuals leave the scene with its actor (despawn, travel); the timed release of the BODY keeps them (the corpse stays where it lies).
export function disposeCuts(s) {
  undoSkin(s.skin); // the cut body leaves and the hunter's own body shows again (a no-op for the actor being removed)
  s.skin = null;
  unseat(s.seat); // a frame body gives its model back to the scene and the frame leaves
  s.seat = null;
}
function unseat(seat) {
  if (!seat) return;
  seat.parent.attach(seat.root);
  seat.frame.removeFromParent();
}

// Null = the budget row (@frankendom/physics data/budget-rows.json, max_simultaneous_ragdolls) is full: no body is taken and the baked death plays.
// Who a corpse is, as a rank from data/physicsBudget.json: the local player (never evicted) > a marked hunter or boss > a remote player > the crowd.
export function rankOf(entity) {
  const budget = GAME_DATA.physicsBudget,
    r = budget.ranks;
  if (entity.id === budget.local_player_id && entity.kind < 0) return r.player;
  if (budget.reserve_for_marked.some((flag) => !!entity[flag])) return r.marked;
  return entity.remotePlayer ? r.remote : r.crowd;
}
// The corpse a death of `rank` may take the place of: the lowest rank below it, the oldest of those; null = none (the newcomer is baked).
// Among the lowest rank, a settled (frozen) body goes before one that is still falling; then the oldest.
const evictable = (rank) =>
  active.reduce((best, a) => {
    const r = a.rank ?? 0,
      br = best?.rank ?? 0;
    if (r >= rank) return best;
    return !best || r < br || (r === br && a.frozen && !best.frozen) ? a : best;
  }, null);

// The dying caps of this device's quality tier (the low row until the probe resolves, then only ever lower): { humanoid, boss }. Humanoid is the total of simultaneous bodies; boss is
// how many of those may be marked hunters or bosses (rank `marked`), so a bigger crowd cap never lets more bosses simulate at once.
export const tierCaps = createTierCaps(GAME_DATA.physicsBudget.tiers, GAME_DATA.physicsBudget.pendingTier, QUALITY);
const bossCount = () => active.filter((a) => a.rank === GAME_DATA.physicsBudget.ranks.marked).length;

export function startDeath(view, bindScene, entity, spec = rigOf(CFG.rigRef)) {
  const budget = GAME_DATA.physicsBudget,
    caps = tierCaps(),
    rows = { ...budget.rows, max_simultaneous_ragdolls: caps.humanoid },
    rank = rankOf(entity),
    marked = rank >= budget.ranks.marked;
  if (rank === budget.ranks.marked && bossCount() >= caps.boss) return null; // boss cap: this one dies on the baked clip
  if (admit(active.length, rows) === "baked") {
    // Full: a higher-ranked death takes the place of the oldest lower-ranked corpse (its body is freed, the pose stays where it lies); else it is baked.
    const oldest = evictable(rank);
    if (!oldest) return null;
    releaseDeath(oldest);
    if (admit(active.length, rows) === "baked") return null;
  }
  // A body that hovers (the drone) spawns at its hover height: the capsule's centre above its own radius, where the model hangs.
  const hover = spec.frame ? chainOf(spec).row.roles[0] : null,
    spawn = [0, hover ? hover.rest.centre[1] - hover.radius_m : 0, 0],
    pooled = poolOf(spec).pop(),
    rd = pooled ?? world.createRagdoll(ROW(spec), { position: spawn, id: String(entity.id) });
  // Wake the parked body at its spawn pose BEFORE anything else touches it: setRoot, kill, snapToTarget and the rest are no-ops on a parked body. A false
  // return means it was not parked (already awake), which is fine to use as it is.
  pooled?.acquire(spawn);
  setTimeout(() => warmOne(spec), CFG.rewarmMs);
  let seat = null; // a frame body's seat is made inside the try below, so a throw there frees the pooled body
  const build = (body, bind) => {
    const chain = spec.chain ? chainRig(spec, seat?.frame ?? body, seat?.frame ?? bind) : null,
      bones = chain?.bones ?? boneMap(body, spec);
    if (Object.values(bones).some((b) => !b)) throw new Error(`${spec.model} lacks a bone of its rig map`);
    const rig = createThreeRig(
      THREE,
      rd,
      bones,
      seat?.frame ?? view.root,
      chain?.options ?? { bind: { bones: boneMap(bind, spec), root: bind } },
    );
    rig.drive();
    rd.snapToTarget();
    return rig;
  };
  let skin = null,
    plan = null,
    rig = null;
  if (cutAssets && cutsEnabled() && spec.model === CUTS.rigRef) {
    try {
      plan = planCut(entity.deathImpact, entity.id, (u) => cutAssets.units.has(u));
      if (plan) {
        skin = cutSkin(view);
        rig = build(skin.model, skin.bind);
      }
    } catch {
      try {
        undoSkin(skin); // any failure on the cut path: the plain ragdoll on the hunter's own body
      } catch (err) {
        rd.destroy(); // the ragdoll was taken from the pool above and nothing else owns it yet
        throw err;
      }
      skin = plan = rig = null;
    }
  }
  let s = null;
  try {
    seat = spec.frame ? frameOf(view, chainOf(spec)) : null;
    rig ??= build(view.model, bindScene);
    // A chain body is heavier or lighter than the 65 kg humanoid the impulse rows are tuned on: the shove scales with its mass.
    const mass = spec.chain ? chainOf(spec).row.total_mass_kg / spec.impulseReferenceKg : 1,
      k = killVector(seat?.frame ?? view.root, entity).map((v) => v * mass),
      push = plan ? k.map((v) => v * plan.row.push) : k,
      part = impulseRow(entity.deathImpact).part;
    rd.kill({ part: spec.partAlias?.[part] ?? part, impulse: push });
    stats.created++;
    stats.lastAt = performance.now();
    s = registerDeath({
      physics: world,
      rd,
      rig,
      age: 0,
      clock: worldClock,
      frozen: false,
      marked,
      rank,
      seat,
      floor: floorOf(view, spec.model),
    });
    seat?.node.attach(seat.root); // the model rides the node, kept where it hangs now
    if (plan) {
      try {
        beginCuts(s, plan, skin, push);
      } catch {
        s.cutRig = s.late = null; // the ragdoll still falls on the cut body, whole
      }
    }
    return s;
  } catch (err) {
    // A throw after the body was taken: give back the hunter's own body, the cut skin and the ragdoll, then let the caller fall back to the clip.
    undoSkin(skin);
    unseat(seat);
    if (s) releaseDeath(s);
    else rd.destroy();
    throw err;
  }
}

// The skin of a boss is thicker than its capsules (plate, cape, skirt: the role table caps a radius at a fraction of its bone), so a corpse that rests on
// its capsules lies with the skin in the floor. data/physicsFloor.json holds the skin vertices that can be the lowest (each with its bone influences);
// the corpse's root is lifted by how far the lowest of them, skinned as the renderer skins it, is below the floor. Only a model with an entry there is
// lifted; a corpse in the air is not touched.
function floorOf(view, model) {
  const d = FLOOR.models[model],
    bones = d?.bones.map((name) => view.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)));
  return !d || bones.some((b) => !b)
    ? null
    : { root: view.root, bones, up: bones.map(() => [0, 0, 0, 0]), vertices: d.vertices, lift: 0 };
}
const toRoot = new THREE.Matrix4(),
  boneToRoot = new THREE.Matrix4();
// How far the lowest skin vertex is below the floor, in the root's own units (the sim frame; the floor is y = 0 in it). Read before the lift is applied.
function sinkOf(f) {
  toRoot.copy(f.root.matrixWorld).invert();
  f.bones.forEach((bone, i) => {
    const e = boneToRoot.multiplyMatrices(toRoot, bone.matrixWorld).elements;
    const m = f.up[i]; // the y row of the bone's matrix in the root's frame
    m[0] = e[1];
    m[1] = e[5];
    m[2] = e[9];
    m[3] = e[13];
  });
  let low = 0;
  for (const vertex of f.vertices) {
    let y = 0;
    for (const [bone, weight, x, py, z] of vertex) {
      const m = f.up[bone];
      y += weight * (m[0] * x + m[1] * py + m[2] * z + m[3]);
    }
    low = Math.min(low, y);
  }
  return -low;
}
// The actor view puts the root back on the floor every frame, so the lift is re-applied every frame, also after the body is freed.
function seatOnFloor(f) {
  f.root.position.y += f.lift * f.root.scale.y;
  f.root.updateMatrixWorld(true);
}

// A corpse's body (and any pieces cut from it) leaves the world; the bones keep the last applied pose.
function freeBody(s) {
  s.rd?.destroy();
  s.rd = null;
  pieces -= s.pieces ?? 0;
  s.pieces = 0;
}

// Track a corpse; past the tier's dying cap the oldest live one is frozen where it lies.
export function registerDeath(s) {
  for (let live = active.filter((a) => !a.frozen); live.length >= tierCaps().humanoid; live.shift()) {
    live[0].frozen = true; // the body leaves the world so it stops costing steps
    freeBody(live[0]);
  }
  active.push(s);
  stats.active = active.length;
  return s;
}
export const activeCount = () => active.length;

// Free a corpse's body and its active entry (settled, removed from the scene, or the actor despawned). Safe to call twice.
export function releaseDeath(s) {
  s.frozen = true;
  freeBody(s);
  unseat(s.seat); // a parked area keeps the actor: its model goes back to its own parent where it lies
  s.seat = null;
  const i = active.indexOf(s);
  if (i >= 0) {
    active.splice(i, 1);
    stats.released++;
    stats.active = active.length;
  }
}

// The world is shared and `world.step` advances EVERY ragdoll in it, so it must advance once per rendered frame however many corpses
// there are. `worldClock` is the simulated time of the world; each corpse keeps its own clock (started at worldClock) and steps the world
// only while its clock is ahead of it, so N corpses calling once per frame make one step set, not N.
let worldClock = 0;
const STEP = () => 1 / CFG.stepHz;

// One render frame: bones follow the capsules; frozen after settleSeconds (or asleep), body freed after removeSeconds.
export function stepDeath(s, dt) {
  s.age += dt;
  if (!s.frozen) {
    s.clock ??= worldClock;
    s.clock = Math.min(s.clock + dt, worldClock + CFG.maxStepsPerFrame * STEP());
    while (worldClock + STEP() <= s.clock) {
      s.physics.step(STEP());
      worldClock += STEP();
    }
    s.rig.applyPose();
    if (s.late) for (const unit of s.late.tick(dt)) if (pieces < CUTS.maxPieceBodies) cutUnit(s, unit);
    s.cutRig?.update();
    if (s.floor) s.floor.lift = sinkOf(s.floor);
    if (s.age >= CFG.settleSeconds || !s.rd.awake) s.frozen = true;
  }
  if (s.floor) seatOnFloor(s.floor);
  if (s.frozen && s.age >= CFG.removeSeconds) releaseDeath(s);
}
