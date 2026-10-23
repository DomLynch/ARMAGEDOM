import * as T from "three";
const activeDigitOverlay = new WeakMap();
export const PISTOL_ARM_EXTENSION = 0.92;
// Remove only our temporary finger locals before the next native gait/equip.
export function restoreGripProfile(model) {
  const state = activeDigitOverlay.get(model);
  if (!state) return false;
  for (const [bone, q] of state) bone.quaternion.copy(q);
  activeDigitOverlay.delete(model);
  return true;
}
// Presentation overlay on a private cloned donor scene. Source clips stay intact.
export function attachPistol(model, scene) {
  const hand = model.getObjectByName("hand_r");
  if (!hand) throw Error("Pistol requires hand_r");
  const mount = new T.Group();
  mount.name = "PistolMount";
  mount.add(scene.clone(true));
  model.add(mount);
  return mount;
}
function pointBone(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(new T.Vector3()),
    from = child.getWorldPosition(new T.Vector3()).sub(origin).normalize(),
    to = target.clone().sub(origin).normalize();
  const q = new T.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new T.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
  bone.updateWorldMatrix(true, true);
}
export function applyPistolAim(model, mount, { recoil = 0, gripProfile, armExtension = PISTOL_ARM_EXTENSION } = {}) {
  if (!Number.isFinite(armExtension) || armExtension < 0.35 || armExtension > 0.98)
    throw RangeError("Invalid arm extension");
  const upper = model.getObjectByName("upperarm_r"),
    fore = model.getObjectByName("lowerarm_r"),
    hand = model.getObjectByName("hand_r");
  if (!upper || !fore || !hand || mount.parent !== model) throw Error("Pistol rig/mount mismatch");
  model.updateWorldMatrix(true, true);
  const basis = model.getWorldQuaternion(new T.Quaternion()),
    scale = model.getWorldScale(new T.Vector3()).x;
  const shoulder = upper.getWorldPosition(new T.Vector3()),
    elbow = fore.getWorldPosition(new T.Vector3()),
    wrist = hand.getWorldPosition(new T.Vector3());
  const a = shoulder.distanceTo(elbow),
    b = elbow.distanceTo(wrist),
    requested = (a + b) * (armExtension - Math.max(0, Math.min(1, recoil)) * 0.22),
    d = Math.max(Math.abs(a - b) + 1e-6, Math.min(a + b - 1e-6, requested));
  const dir = new T.Vector3(0, -0.07, 1).normalize().applyQuaternion(basis),
    bend = new T.Vector3(0.25, -1, -0.07).normalize().applyQuaternion(basis);
  bend.addScaledVector(dir, -bend.dot(dir)).normalize();
  const along = (a * a - b * b + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, a * a - along * along));
  const target = shoulder.clone().addScaledVector(dir, d),
    joint = shoulder.clone().addScaledVector(dir, along).addScaledVector(bend, height);
  pointBone(upper, fore, joint);
  pointBone(fore, hand, target);
  // Hand local Y follows the barrel; local Z points up. Existing finger curl retained.
  const desired = basis.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(desired));
  hand.updateWorldMatrix(true, true);
  // Original pistol finger pose on existing bones; refreshed after each gait sample.
  for (const finger of ["middle", "ring", "pinky", "index"])
    for (let part = 1; part <= 3; part++) {
      const bone = model.getObjectByName(`${finger}_0${part}_r`);
      if (!bone) continue;
      const curl = finger === "index" ? [0.15, 0.48, 0.45][part - 1] : [0.75, 1.05, 0.85][part - 1];
      bone.quaternion.setFromEuler(new T.Euler(0, part === 1 ? -Math.PI / 2 : 0, -curl, "YXZ"));
    }
  const gunQ = basis
    .clone()
    .multiply(new T.Quaternion().setFromEuler(new T.Euler(-Math.max(0, Math.min(1, recoil)) * 0.22, 0, 0)));
  const grip = hand
    .getWorldPosition(new T.Vector3())
    .add(new T.Vector3(0, -0.045, 0.13).multiplyScalar(scale).applyQuaternion(basis));
  mount.position.copy(model.worldToLocal(grip));
  mount.quaternion.copy(model.getWorldQuaternion(new T.Quaternion()).invert().multiply(gunQ));
  if (gripProfile) {
    if (activeDigitOverlay.has(model)) throw Error("Restore digit overlay before gait/sample");
    const state = [];
    for (const [name, q] of Object.entries(gripProfile.digitLocalQuaternions)) {
      const bone = model.getObjectByName(name);
      state.push([bone, bone.quaternion.clone()]);
      bone.quaternion.fromArray(q);
    }
    activeDigitOverlay.set(model, state);
  }
  model.updateWorldMatrix(true, true);
  model.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton.update();
  });
  return mount.getObjectByName("Muzzle");
}
