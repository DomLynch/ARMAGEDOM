import { FLAME_DEATH_DATA, flameDeathSeconds, isFlameRecipe } from "./finisher-data.js";
import { combatTargetHeight, rangedTargets, selectCombatTarget, chainedSight, withChained } from "../pistol-targeting.js";
import { selectedFlameProfile } from "./boss-equipment-data.js";
import { flameTouches } from "./flame-contact.js";
import * as T from "three";
import { attachPistol, applyPistolAim, PISTOL_ARM_EXTENSION } from "../pistol-pose.js";
import { FLAME_AIM } from "../mobile-combat-aim.js";
import profile from "../donor/flame-right-digit-profile.json" with { type: "json" };
export const FLAME_DOWN_PITCH = FLAME_AIM.downPitch;
import { FLAME_PRESENTATION as FP } from "./flame-presentation-data.js";
const PITCH_UP = -(Math.PI * FP.pitchUpDegrees) / 180; // the highest the barrel tilts above level, in radians
const names = ["middle", "ring", "pinky", "index", "thumb"].flatMap((f) =>
  Array.from({ length: 3 }, (_, i) => `${f}_0${i + 1}_r`), // tuning-ok: the rig has three joints on each finger
);
const validated = new WeakMap();
// The one accepted profile is bound to this exact hero, not retargeted or fitted.
export function flameGripProfile(model, heroSHA) {
  if (validated.has(model)) return validated.get(model);
  if (
    profile.schemaVersion !== 1 ||
    profile.hand !== "right" ||
    profile.source.heroSHA256 !== heroSHA ||
    Object.keys(profile.digitLocalQuaternions).length !== names.length
  )
    throw Error("Flame grip provenance/schema mismatch");
  for (const name of names) {
    const q = profile.digitLocalQuaternions[name];
    if (
      !model.getObjectByName(name)?.isBone ||
      !Array.isArray(q) ||
      q.length !== 4 ||
      !q.every(Number.isFinite) ||
      Math.abs(Math.hypot(...q) - 1) > 1e-5 // tuning-ok: how far from unit length a profile quaternion may be
    )
      throw Error("Flame grip bone/quaternion mismatch");
  }
  let skin;
  model.traverse((n) => {
    if (!skin && n.isSkinnedMesh) skin = n;
  });
  if (
    !skin ||
    profile.source.jointOrder.some((name, i) => skin.skeleton.bones[i]?.name !== name) ||
    skin.skeleton.bones.length !== profile.source.jointOrder.length
  )
    throw Error("Flame grip joint order mismatch");
  validated.set(model, profile);
  return profile;
}
const heldFlameBindings = new WeakMap();
export function attachFlame(model, source, { bindHand = false } = {}) {
  if (!source?.scene?.getObjectByName("Grip") || !source.scene.getObjectByName("Muzzle"))
    throw Error("Flame grip/muzzle source missing");
  const mount = attachPistol(model, source.scene);
  mount.name = "FlamethrowerMount";
  // Art's one measured scene-child offset is not baked into the immutable GLB.
  mount.children[0].position.add(FP.mountOffset);
  mount.visible = false;
  if (bindHand) {
    // Calibrate the existing ready grip once, then restore the native pose exactly.
    // Even a first-frame hurt actor keeps its own Hit pose; no ready IK is rendered.
    const bones = [];
    model.traverse((node) => {
      if (node.isBone)
        bones.push({ node, q: node.quaternion.clone(), matrix: node.matrix.clone(), auto: node.matrixAutoUpdate });
    });
    try {
      applyPistolAim(model, mount, { recoil: 0 });
      rememberFlameHand(model, mount);
    } finally {
      for (const { node, q, matrix, auto } of bones) {
        node.quaternion.copy(q);
        node.matrix.copy(matrix);
        node.matrixAutoUpdate = auto;
        node.matrixWorldNeedsUpdate = true;
      }
      model.updateWorldMatrix(true, true);
      model.traverse((node) => {
        if (node.isSkinnedMesh) node.skeleton.update();
      });
    }
  }
  return mount;
}

export function rememberFlameHand(model, mount) {
  model.updateWorldMatrix(true, true);
  heldFlameBindings.set(
    mount,
    model.getObjectByName("hand_r").matrixWorld.clone().invert().multiply(mount.matrixWorld),
  );
}
// Keep the model-owned mount affine-exact on the native hurt/idle hand, without IK.
export function followFlameHand(model, mount) {
  const binding = heldFlameBindings.get(mount),
    hand = model.getObjectByName("hand_r");
  if (!binding || !hand || mount.parent !== model) throw Error("Held flame hand binding unavailable");
  model.updateWorldMatrix(true, true);
  mount.matrix.copy(model.matrixWorld).invert().multiply(hand.matrixWorld).multiply(binding);
  mount.matrixAutoUpdate = false;
  mount.matrixWorldNeedsUpdate = true;
  mount.updateWorldMatrix(true, true);
}

// Solve the barrel ray about the shoulder pivot, including the muzzle's
// perpendicular offset. Aiming from the old muzzle before moving it undershoots.
export function flameTargetPitch(model, mount, target) {
  if (!target?.isVector3 || !target.toArray().every(Number.isFinite)) throw Error("Finite flame target required");
  return projectedPitch(flameAimBasis(model, mount), target);
}
// Aim about the real shoulder in both planes; root-facing alone leaves a
// lateral barrel offset almost as wide as a close human body during gait.
export function flameTargetAim(model, mount, target) {
  return projectedAim(flameAimBasis(model, mount), target);
}
function projectedAim(pose, target) {
  const { shoulder, muzzle, axis, forward } = pose,
    up = new T.Vector3().crossVectors(forward, axis).normalize(),
    to = target.clone().sub(shoulder),
    side = to.dot(axis),
    along = to.dot(forward),
    radius = Math.hypot(side, along),
    offset = muzzle.clone().sub(shoulder).dot(axis),
    yaw = Math.max(
      -FLAME_AIM.yawLimit,
      Math.min(
        FLAME_AIM.yawLimit,
        radius > 1e-8 ? Math.atan2(side, along) - Math.asin(Math.max(-1, Math.min(1, offset / radius))) : 0,
      ),
    ),
    turn = new T.Quaternion().setFromAxisAngle(up, yaw),
    turned = {
      shoulder,
      muzzle: muzzle.clone().sub(shoulder).applyQuaternion(turn).add(shoulder),
      axis: axis.clone().applyQuaternion(turn),
      forward: forward.clone().applyQuaternion(turn),
    },
    pitch = projectedPitch(turned, target),
    rotation = new T.Quaternion().setFromAxisAngle(turned.axis, pitch).multiply(turn);
  return { yaw, pitch, rotation };
}
function projectedPitch({ shoulder, muzzle, axis, forward }, target) {
  const down = new T.Vector3().crossVectors(axis, forward).normalize(),
    to = target.clone().sub(shoulder),
    offset = muzzle.clone().sub(shoulder).dot(down),
    along = to.dot(forward),
    below = to.dot(down),
    radius = Math.hypot(along, below);
  const pitch = radius > 1e-8 ? Math.atan2(below, along) - Math.asin(Math.max(-1, Math.min(1, offset / radius))) : 0;
  return Math.max(PITCH_UP, Math.min(FLAME_DOWN_PITCH, pitch));
}
// Read-only prediction of the SAME shoulder transform used by the renderer.
// Capture before pitching; prospective yaw follows the ordinary body facing.
export function flameAimBasis(model, mount, g) {
  model.updateWorldMatrix(true, true);
  const shoulder = model.getObjectByName("upperarm_r")?.getWorldPosition(new T.Vector3()),
    m = mount.getObjectByName("Muzzle");
  if (!shoulder || !m) throw Error("Native flame shoulder/muzzle required");
  const root = (model.parent ?? model).getWorldPosition(new T.Vector3()),
    muzzle = m.getWorldPosition(new T.Vector3());
  return {
    shoulder,
    muzzle,
    axis: new T.Vector3(1, 0, 0).applyQuaternion(model.getWorldQuaternion(new T.Quaternion())).normalize(),
    forward: m.getWorldDirection(new T.Vector3()).normalize(),
    root,
    position: g ? { ...g.player.pos } : null,
    yaw: g ? Math.atan2(g.player.facing.x, -g.player.facing.z) : 0,
    areaId: g?.world.areaId,
    reach: Math.hypot(shoulder.x - root.x, shoulder.z - root.z) + muzzle.distanceTo(shoulder),
  };
}
export function projectedFlameSource(basis, g, target) {
  const yaw = Math.atan2(target.pos.x - g.player.pos.x, g.player.pos.z - target.pos.z) - basis.yaw,
    rotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
    shift = new T.Vector3(g.player.pos.x - basis.position.x, 0, basis.position.z - g.player.pos.z),
    point = (p) => p.clone().sub(basis.root).applyQuaternion(rotation).add(basis.root).add(shift),
    pose = {
      shoulder: point(basis.shoulder),
      muzzle: point(basis.muzzle),
      axis: basis.axis.clone().applyQuaternion(rotation),
      forward: basis.forward.clone().applyQuaternion(rotation),
    },
    aim = projectedAim(pose, g.world.toRender(target.pos, combatTargetHeight(target, g.time))),
    m = pose.muzzle.sub(pose.shoulder).applyQuaternion(aim.rotation).add(pose.shoulder),
    d = pose.forward.applyQuaternion(aim.rotation);
  return {
    position: { x: m.x, y: m.y, z: -m.z },
    direction: { x: d.x, y: d.y, z: -d.z },
    pitch: aim.pitch,
    yaw: aim.yaw,
  };
}
export function flameAimEligible(basis, g, target) {
  if (
    !basis ||
    !target ||
    basis.areaId !== g.world.areaId ||
    (target.areaId ?? g.world.areaId) !== g.world.areaId ||
    target.visible === false ||
    !(target.hp > 0)
  )
    return false;
  return flameTouches({
    source: projectedFlameSource(basis, g, target),
    target,
    time: g.time,
    profile: g.world.flameData.contact,
    lineClear: chainedSight(g),
    playerPosition: g.player.pos,
  });
}
// Physical ready stance precedes lock eligibility. A close body must not have
// to win a lock while it is already wholly behind the extended nozzle.
export function flameArmStance(g, wasClose = false, visibleIds) {
  let gap = Infinity;
  const p = g.player;
  for (const e of g.enemies) {
    if (
      e.visible === false ||
      (visibleIds && !visibleIds.includes(e.id)) ||
      !(e.hp > 0) ||
      !Number.isFinite(e.radius) ||
      (e.areaId ?? g.world.areaId) !== g.world.areaId ||
      !g.world.lineClear(p.pos, e.pos)
    )
      continue;
    const dx = e.pos.x - p.pos.x,
      dz = e.pos.z - p.pos.z,
      d = Math.hypot(dx, dz);
    if (d < 1e-8 || (dx * p.facing.x + dz * p.facing.z) / d < 0) continue;
    gap = Math.min(gap, d - p.radius - e.radius);
  }
  const close = gap < (wasClose ? FLAME_AIM.closeExitGap : FLAME_AIM.closeEnterGap);
  return {
    close,
    extension: close ? FLAME_AIM.closeExtension : PISTOL_ARM_EXTENSION,
    gap,
    rate: FLAME_AIM.extensionRate,
  };
}

// Touch lock supplies one stable receiver for body yaw and weapon elevation.
// Do not reselect from the unpitched muzzle: a close low body may be behind
// that muzzle until the shoulder pose lowers the barrel toward it.
export function flameAimPitch(model, mount, g) {
  return flameAimPose(model, mount, g).pitch;
}
export function flameAimPose(model, mount, g) {
  const assisted = g.mobileAssistEnabled !== false || !!g.touchTarget,
    locked =
      assisted &&
      g.enemies.find(
        (e) =>
          e.placementKey === g.mobileAim?.targetId &&
          e.visible !== false &&
          e.hp > 0 &&
          (e.areaId ?? g.world.areaId) === g.world.areaId &&
          g.world.lineClear(g.player.pos, e.pos),
      );
  // No touch lock at all (desktop aim): the body the player faces within the flame's own cone and range,
  // chosen by the selector the melee and ranged weapons use, so a low body is aimed at without a tap.
  // An unusable lock still yields no pitch, so independent choices never steal the touch lock.
  const faced =
    !locked &&
    g.mobileAim?.targetId == null &&
    assisted &&
    withChained(g, g.enemies).find(
      (e) =>
        e.id ===
        selectCombatTarget({
          position: g.player.pos,
          aim: g.player.facing,
          targets: rangedTargets(g),
          lineClear: chainedSight(g),
          range: selectedFlameProfile(g).contact.range,
          rangeOffset: (t) => t.radius,
          coneDegrees: selectedFlameProfile(g).contact.coneDegrees / 2, // tuning-ok: the cone's half angle either side of the aim
          areaId: g.world.areaId,
        })?.targetId,
    );
  const enemy = locked || faced;
  return enemy
    ? flameTargetAim(model, mount, g.world.toRender(enemy.pos, combatTargetHeight(enemy, g.time)))
    : { pitch: 0, yaw: 0 };
}

// The donor has non-uniform scale. Retain the exact affine transform instead
// of decomposing it into a quaternion, which can move the hand off the handle.
const pitched = new WeakMap();
export function restoreFlamePitch(model) {
  const state = pitched.get(model);
  if (!state) return false;
  for (const { node, matrix, auto } of state) {
    node.matrix.copy(matrix);
    node.matrixAutoUpdate = auto;
    node.matrixWorldNeedsUpdate = true;
  }
  pitched.delete(model);
  return true;
}
export function applyFlamePitch(model, mount, pitch, yaw = 0) {
  if (!Number.isFinite(pitch) || !Number.isFinite(yaw)) throw Error("Finite flame aim required");
  const upper = model.getObjectByName("upperarm_r");
  if (!upper || mount.parent !== model) throw Error("Flame aim mount mismatch");
  if (pitched.has(model)) throw Error("Restore flame pitch before gait/sample");
  pitch = Math.max(PITCH_UP, Math.min(FLAME_DOWN_PITCH, pitch));
  yaw = Math.max(-FLAME_AIM.yawLimit, Math.min(FLAME_AIM.yawLimit, yaw));
  if (Math.abs(pitch) < 1e-8 && Math.abs(yaw) < 1e-8) return;
  model.updateWorldMatrix(true, true);
  const basis = flameAimBasis(model, mount),
    shoulder = basis.shoulder,
    up = new T.Vector3().crossVectors(basis.forward, basis.axis).normalize(),
    turn = new T.Quaternion().setFromAxisAngle(up, yaw),
    rotation = new T.Matrix4().makeRotationFromQuaternion(
      new T.Quaternion().setFromAxisAngle(basis.axis.clone().applyQuaternion(turn), pitch).multiply(turn),
    ),
    delta = new T.Matrix4()
      .makeTranslation(shoulder.x, shoulder.y, shoulder.z)
      .multiply(rotation)
      .multiply(new T.Matrix4().makeTranslation(-shoulder.x, -shoulder.y, -shoulder.z));
  const state = [upper, mount].map((node) => ({
    node,
    matrix: node.matrix.clone(),
    auto: node.matrixAutoUpdate,
    world: node.matrixWorld.clone(),
  }));
  pitched.set(model, state);
  for (const { node, world } of state) {
    node.matrix.copy(node.parent.matrixWorld).invert().multiply(delta).multiply(world);
    node.matrixAutoUpdate = false;
    node.matrixWorldNeedsUpdate = true;
  }
  model.updateWorldMatrix(true, true);
  model.traverse((n) => {
    if (n.isSkinnedMesh) n.skeleton.update();
  });
}

// Only private cloned corpse materials change, after the existing flash restore.
const soot = new T.Color(FLAME_DEATH_DATA.tint),
  flare = new T.Color(FLAME_DEATH_DATA.flareColor);
export function applyFlameCorpseChar(view, entity) {
  if (!(entity.hp <= 0) || !isFlameRecipe(entity.finisher?.recipeId)) return false;
  const f = FLAME_DEATH_DATA,
    age = view.restoredCorpse ? f.charSettle : (view.finisherAge ?? 0),
    progress = Math.max(0, Math.min(1, (age - f.charBegin) / (f.charSettle - f.charBegin)));
  const life = view.restoredCorpse
    ? 0
    : Math.max(0, Math.min(1, (flameDeathSeconds(view.finisherDeathSeconds) - age) / f.fadeSeconds));
  for (const m of view.flashMaterials) {
    if (m.color) m.material.color.copy(m.color).lerp(soot, progress * f.blend);
    if (Number.isFinite(m.roughness))
      m.material.roughness = m.roughness + (Math.max(m.roughness, f.roughnessFloor) - m.roughness) * progress;
    if (m.emissive)
      m.material.emissive
        .copy(m.emissive)
        .multiplyScalar(1 - progress)
        .lerp(flare, life);
    if (Number.isFinite(m.intensity))
      m.material.emissiveIntensity = m.intensity * (1 - progress) * (1 - life) + f.flareIntensity * life;
  }
  return true;
}
