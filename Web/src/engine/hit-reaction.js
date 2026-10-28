// Alive hit reactions for bosses and marked hunters: a short additive lean and twist of the spine, neck, head, arms and legs on top of the
// clip that is playing, by weapon class x zone x blow direction. Presentation only (no hp, no damage, no server). Rows: data/hitReaction.json.
// Off switch: ?hitreact=0. Trash mobs are never eligible. Not the ragdoll: this runs only while the body is alive and the clip still owns
// the bones, so it costs a handful of quaternion multiplies on at most `maxActive` bodies (no physics step, no motors).
// Fail soft: an exception in start or step ends the reaction and restores the bones to the clip pose; the frame loop never sees it.
import * as THREE from "three";
import { GAME_DATA } from "./game-data.js";
import { deathImpactOf } from "./physics-death-impulse.js";

const ROW = GAME_DATA.hitReaction;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const clamp01 = (x) => clamp(x, 0, 1);
const ease = (x) => x * x * (1 - x + (1 - x) + 1); // smoothstep without literals, monotone on [0,1]

export const hitReactionEnabled = (row = ROW, search = globalThis.location?.search ?? "") =>
  new URLSearchParams(search).get(row.flagParam) === row.offValue ? false : row.defaultOn;
let flag = null; // read once: the off path allocates nothing per frame
const enabled = () => (flag ??= hitReactionEnabled());

// Kinds the row names: an entity is eligible when any named field is truthy (markedHunter, bossProfile).
export const eligible = (row, entity) => !!entity && row.eligibleFlags.some((f) => !!entity[f]);
export const weaponClassOf = (row, weapon) => row.weaponClass[weapon] ?? null;

// Deterministic zone for one hit: same entity, same damage, same hp = same zone (no Math.random, replays and tests agree).
export function zoneFor(row, cls, key) {
  const weights = row.classes[cls].zoneWeights;
  let h = 0;
  for (const ch of String(key)) h = (h * row.hash.mul + ch.charCodeAt(0)) % row.hash.mod;
  let pick = h % Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [zone, w] of Object.entries(weights)) {
    if (pick < w) return zone;
    pick -= w;
  }
  return Object.keys(weights)[0];
}

// 0..1 share of the reaction at `age`: ease in, hold, ease back to exactly 0 (the clip alone).
export function weightAt(c, age) {
  if (!(age >= 0)) return 0;
  if (age < c.easeInSeconds) return ease(clamp01(age / c.easeInSeconds));
  if (age < c.easeInSeconds + c.holdSeconds) return 1;
  return 1 - ease(clamp01((age - c.easeInSeconds - c.holdSeconds) / c.backSeconds));
}
export const totalSeconds = (c) => c.easeInSeconds + c.holdSeconds + c.backSeconds;

// The blow direction as a unit vector: a missing, NaN, infinite or (near) zero direction falls back to the row's default frontal blow.
export function blowDirection(row, d) {
  const x = d?.x,
    z = d?.z;
  const len = Number.isFinite(x) && Number.isFinite(z) ? Math.hypot(x, z) : 0;
  if (!(len >= row.minDirectionLength)) return { ...row.fallbackDirection };
  return { x: x / len, z: z / len };
}

// The plan of one hit (pure): class, zone, how hard (class power x damage share), the blow direction and which side it came from.
export function planHit(row, entity, hit) {
  const cls = weaponClassOf(row, hit.weapon);
  if (!cls || hit.blocked || hit.parry || !(hit.amount > 0)) return null;
  const share = clamp(hit.amount / row.damage.ref, row.damage.min, row.damage.max);
  return {
    cls,
    zone: zoneFor(row, cls, `${entity.id}:${hit.amount}:${entity.hp}`),
    power: row.classes[cls].power * share,
    dir: blowDirection(row, hit.impactDirection),
  };
}

let active = 0;
const q = new THREE.Quaternion(),
  rootQ = new THREE.Quaternion(),
  rootInv = new THREE.Quaternion(),
  parentQ = new THREE.Quaternion(),
  delta = new THREE.Quaternion(),
  axis = new THREE.Vector3(),
  local = new THREE.Vector3(),
  up = new THREE.Vector3(0, 1, 0);

const boneOf = (model, joint) =>
  model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(GAME_DATA.physicsBody.nodePrefix + joint));
// Roles -> bones of the mixamo-106 layout (the joint map the ragdoll already uses). `Near` roles resolve to the arm on the blow's side.
function bonesFor(model, nearLeft) {
  const parts = GAME_DATA.physicsDeath.parts,
    side = nearLeft ? "Left" : "Right",
    out = {};
  for (const role of ROW.order) {
    const base = role.replace(/Near$/, side);
    const bone = parts[base] ? boneOf(model, parts[base]) : null;
    if (bone?.parent) out[role] = bone;
  }
  return out;
}

// Drift-free layering. `rec` keeps, per bone, the pose the CLIP left (`clean`) and the pose WE wrote (`applied`). At the start of each frame:
// if the bone still holds exactly what we wrote, the clip did not touch it this frame (a contacts-only sample, a bone without tracks), so
// the clip pose is `clean`; otherwise the clip rewrote it and the bone's current value is the new `clean`. Either way we lay the reaction on
// `clean`, never on our own last result, so nothing accumulates.
function settle(s) {
  for (const bone of Object.values(s.bones)) {
    const rec = (s.rec.get(bone) ?? s.rec.set(bone, { clean: new THREE.Quaternion(), applied: null }).get(bone));
    if (rec.applied && bone.quaternion.equals(rec.applied)) bone.quaternion.copy(rec.clean);
    else rec.clean.copy(bone.quaternion);
  }
}
const record = (s) => {
  for (const bone of Object.values(s.bones)) {
    const rec = s.rec.get(bone);
    rec.applied ??= new THREE.Quaternion();
    rec.applied.copy(bone.quaternion);
  }
};
// Put every bone we still hold back on the clip pose (the clip did not rewrite it since our last write).
function restore(s, force = false) {
  for (const bone of Object.values(s.bones)) {
    const rec = s.rec.get(bone);
    if (rec && (force || (rec.applied && bone.quaternion.equals(rec.applied)))) bone.quaternion.copy(rec.clean);
  }
}

// One hit event from the actor layer. Starts (or replaces) the reaction of this view; ignored for trash, blocked hits and the flag off.
export function bodyReactionStart(view, hit) {
  try {
    const entity = hit.actor;
    if (!enabled() || !view?.model || !eligible(ROW, entity) || entity.hp <= 0) return;
    const old = view.bodyReaction;
    if (old && old.age < ROW.retriggerSeconds) return;
    const plan = planHit(ROW, entity, hit);
    if (!plan) return;
    if (!old && active >= ROW.maxActive) return;
    // The blow in the body's own frame: x = its left, z = its front. The blow comes FROM the opposite way it travels.
    view.root.getWorldQuaternion(rootQ);
    rootInv.copy(rootQ).invert();
    local.set(plan.dir.x, 0, plan.dir.z).applyQuaternion(rootInv);
    if (!(Number.isFinite(local.x) && Number.isFinite(local.z) && Math.hypot(local.x, local.z) >= ROW.minDirectionLength)) return;
    local.y = 0;
    local.normalize();
    const bones = bonesFor(view.model, local.x <= 0);
    if (!Object.keys(bones).length) return;
    if (old) restore(old);
    else active++;
    view.bodyReaction = {
      ...plan,
      age: 0,
      bones,
      rec: new Map(),
      local: { x: local.x, z: local.z },
      total: totalSeconds(ROW.classes[plan.cls]),
    };
  } catch {
    bodyReactionEnd(view);
  }
}

const rotate = (bone, ax, angle) => {
  if (!angle) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(parentQ);
  delta.setFromAxisAngle(ax, angle); // the rotation in the actor's frame...
  q.copy(rootQ).multiply(delta).multiply(rootInv); // ...as a world rotation
  delta.copy(parentQ).invert().multiply(q).multiply(parentQ); // ...as a local rotation of this bone (parent frame)
  bone.quaternion.premultiply(delta);
};

// Per actor per frame, AFTER the clip is sampled: lays the reaction on the bones. Ends (and frees its slot) when the curve reaches 0, the
// body dies (the ragdoll or the baked death owns the bones then), the flag is off, a value is not finite or anything throws.
export function bodyReactionStep(view, entity, dt, contactOnly = false) {
  const s = view.bodyReaction;
  if (!s) return;
  try {
    // A contacts-only pass feeds gameplay (aim, blast surface, saw contact): it must read the clip's bones, never the reaction. The bones go
    // back to the clip pose and the age does not move; the next rendered pass lays the reaction on again.
    if (contactOnly) return restore(s);
    if (!Number.isFinite(dt) || dt < 0) return;
    s.age += dt;
    if (!enabled() || entity.hp <= 0 || s.age >= s.total) return bodyReactionEnd(view);
    const c = ROW.classes[s.cls],
      zone = ROW.zones[s.zone],
      w = weightAt(c, s.age) * s.power;
    settle(s);
    view.root.updateMatrixWorld(true);
    view.root.getWorldQuaternion(rootQ);
    rootInv.copy(rootQ).invert();
    const twistSign = s.local.x < 0 ? -1 : 1;
    for (const role of ROW.order) {
      const bone = s.bones[role];
      if (!bone) continue;
      // Bend along the blow: the axis is up x direction (a blow travelling forward folds the body forward).
      axis.set(s.local.z, 0, -s.local.x).normalize();
      rotate(bone, axis, ROW.bendRadians * (zone.bend[role] ?? 0) * w);
      rotate(bone, up, ROW.twistRadians * c.twist * twistSign * (zone.twist[role] ?? 0) * w);
      const f = zone.fixed[role];
      if (f) {
        axis.set(1, 0, 0);
        rotate(bone, axis, f.pitch * w);
        axis.set(0, 0, 1);
        rotate(bone, axis, f.roll * w);
      }
    }
    for (const bone of Object.values(s.bones))
      if (![bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w].every(Number.isFinite)) throw RangeError("non-finite bone");
    record(s);
  } catch {
    bodyReactionEnd(view, true); // a failed frame may have left a half-written pose: force the clip pose back
  }
}

// Ends the reaction: puts the bones back on the clip pose and frees the cap slot. Safe to call twice, with no reaction, on a parked or
// removed view and from inside the catch of start/step (it never throws).
export function bodyReactionEnd(view, force = false) {
  const s = view?.bodyReaction;
  if (!s) return;
  view.bodyReaction = undefined;
  active = Math.max(0, active - 1);
  try {
    restore(s, force);
  } catch {
    /* the clip rewrites the bones on the next frame anyway */
  }
}
export const activeBodyReactions = () => active;

// The one hit hook of the actor layer: starts the body reaction, then records the killing blow (direction, weapon, zone) that shoves the ragdoll.
export function bodyHitStart(view, hit) {
  bodyReactionStart(view, hit);
  if (hit.actor.hp <= 0) hit.actor.deathImpact = deathImpactOf(hit);
}
// Short names for the step and end hook lines in actors.js (that file is at its size limit).
export { bodyReactionStep as bodyHitStep, bodyReactionEnd as bodyHitEnd };
