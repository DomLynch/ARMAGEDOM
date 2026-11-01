import * as T from "three";
import { rigBone, sanitizeBoneName } from "../rig-bones.js";
import { pointBone } from "../pistol-pose.js";
// Two-bone reach: put the wrist on `target` (clamped to the arm) with the elbow toward `bend`.
function reachArm(upper, fore, wrist, target, bend) {
  const shoulder = upper.getWorldPosition(new T.Vector3()),
    a = shoulder.distanceTo(fore.getWorldPosition(new T.Vector3())),
    b = fore.getWorldPosition(new T.Vector3()).distanceTo(wrist.getWorldPosition(new T.Vector3())),
    dir = target.clone().sub(shoulder),
    d = Math.max(Math.abs(a - b) + Number.EPSILON, Math.min(a + b - Number.EPSILON, dir.length()));
  dir.normalize();
  const side = bend.clone().addScaledVector(dir, -bend.dot(dir)).normalize(),
    along = (a * a - b * b + d * d) / (d + d),
    height = Math.sqrt(Math.max(0, a * a - along * along));
  pointBone(upper, fore, shoulder.clone().addScaledVector(dir, along).addScaledVector(side, height));
  pointBone(fore, wrist, shoulder.clone().addScaledVector(dir, d));
}
const eulerQ = (degrees) => new T.Quaternion().setFromEuler(new T.Euler(...degrees.map(T.MathUtils.degToRad)));
// A body row's `rifleGrip` holds the weapon with two-handed IK instead of the donor-named pose tracks:
// hold (grip point from the right shoulder), wristOffset, handDegrees, fingerDegrees, bend, and `support` (the left arm).
function holdTwoHanded(model, mount, grip, length, phase) {
  model.updateWorldMatrix(true, true);
  const basis = model.getWorldQuaternion(new T.Quaternion()),
    scale = model.getWorldScale(new T.Vector3()).x,
    local = (v) => new T.Vector3(...v).multiplyScalar(scale).applyQuaternion(basis),
    bone = (name) => model.getObjectByName(sanitizeBoneName(name)),
    upper = rigBone(model, "upperArm"),
    point = upper
      .getWorldPosition(new T.Vector3())
      .add(local(grip.hold))
      .sub(local([0, 0, grip.kick * phase.kick]));
  // The row's hand bone is an empty socket past the wrist: orient the wrist, measure where the socket then sits, and reach the wrist
  // so that socket + wristOffset lands on the grip point.
  const wrist = bone(grip.wristBone),
    orient = () => {
      wrist.updateWorldMatrix(true, true);
      const parent = wrist.parent.getWorldQuaternion(new T.Quaternion()).invert();
      wrist.quaternion.copy(parent.multiply(basis).multiply(eulerQ(grip.handDegrees)));
      wrist.updateWorldMatrix(true, true);
    };
  orient();
  const socket = rigBone(model, "hand").getWorldPosition(new T.Vector3()).sub(wrist.getWorldPosition(new T.Vector3()));
  reachArm(
    upper,
    rigBone(model, "foreArm"),
    wrist,
    point.clone().sub(local(grip.wristOffset)).sub(socket),
    local(grip.bend),
  );
  orient();
  const s = grip.support,
    dip = local(s.reloadDip.map((v) => v * phase.reload)),
    target = point
      .clone()
      .add(local([0, s.height, s.fraction * length]))
      .add(dip),
    hand = bone(s.hand);
  reachArm(bone(s.upperArm), bone(s.foreArm), hand, target, local(s.bend));
  hand.updateWorldMatrix(true, true);
  hand.quaternion.copy(
    hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(basis).multiply(eulerQ(s.handDegrees)),
  );
  for (const [name, degrees] of Object.entries({ ...grip.fingerDegrees, ...s.fingerDegrees }))
    bone(name).quaternion.copy(eulerQ(degrees));
  model.updateWorldMatrix(true, true);
  const parent = mount.parent,
    world = new T.Quaternion();
  mount.position.copy(parent.worldToLocal(point));
  mount.quaternion.copy(parent.getWorldQuaternion(world).invert().multiply(basis));
}
// Absolute weapon-owned upper-body tracks; the live character/skeleton stay owners.
export function createRiflePose(model, source) {
  const data = source?.description?.pose,
    asset = source?.gltf,
    hand =
      data?.mount?.bone && !model.userData?.rigBones?.hand
        ? model.getObjectByName(data.mount.bone)
        : rigBone(model, "hand");
  if (
    !data ||
    !hand?.isBone ||
    !asset ||
    !Array.isArray(data.allowlist) ||
    new Set(data.allowlist).size !== data.allowlist.length
  )
    throw Error("Rifle pose/mount source unavailable");
  const original = asset.scene.getObjectByName(data.root);
  if (!original) throw Error("Rifle rigid root missing");
  const mount = new T.Group();
  mount.name = "RifleMount";
  const root = original.clone(true),
    materials = [];
  mount.add(root);
  try {
    root.traverse((node) => {
      if (node.isSkinnedMesh) throw Error("Rifle must remain rigid");
      if (!node.isMesh) return;
      node.frustumCulled = false;
      const clones = [node.material].flat().map((m) => {
        if (!m?.isMeshStandardMaterial) throw Error("Rifle PBR material required");
        const material = m.clone();
        materials.push({
          material,
          color: material.color.clone(),
          emissive: material.emissive.clone(),
          intensity: material.emissiveIntensity,
        });
        return material;
      });
      node.material = Array.isArray(node.material) ? clones : clones[0];
    });
    const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
    if (
      !finite(data.mount.translation, 3) || // tuning-ok: a translation has x, y and z
      !finite(data.mount.quaternion, 4) || // tuning-ok: a quaternion has x, y, z and w
      !finite(data.mount.scale, 3) || // tuning-ok: a scale has x, y and z
      data.mount.scale.some((v) => v !== 1)
    )
      throw Error("Invalid rifle mount transform");
    mount.position.fromArray(data.mount.translation);
    mount.quaternion.fromArray(data.mount.quaternion);
    mount.scale.fromArray(data.mount.scale);
    hand.add(mount);
    mount.visible = false;
    const grip = model.userData?.rifleGrip,
      gripBones = grip
        ? [
            rigBone(model, "upperArm"),
            rigBone(model, "foreArm"),
            ...[
              grip.wristBone,
              grip.support.upperArm,
              grip.support.foreArm,
              grip.support.hand,
              ...Object.keys({ ...grip.fingerDegrees, ...grip.support.fingerDegrees }),
            ].map((name) => model.getObjectByName(sanitizeBoneName(name))),
          ]
        : [],
      saved = new Map();
    if (grip && gripBones.some((bone) => !bone?.isBone)) throw Error("Invalid rifle upper-body binding");
    mount.updateWorldMatrix(true, true);
    const muzzleAt = root.getObjectByName("Muzzle")?.getWorldPosition(new T.Vector3()),
      length = grip && muzzleAt ? mount.worldToLocal(muzzleAt).z : 0;
    const bones = new Map(
      (grip ? [] : data.allowlist).map((name) => {
        const bone = model.getObjectByName(name);
        if (!bone?.isBone || /^(root|pelvis|thigh|calf|foot|ball)/.test(name))
          throw Error("Invalid rifle upper-body binding");
        return [name, bone];
      }),
    );
    const base = new Map([...bones].map(([name, bone]) => [name, bone.quaternion.clone()])),
      clips = new Map();
    for (const name of ["Rifle_Hold", "Rifle_Aim", "Rifle_Fire", "Rifle_Reload"]) {
      const clip = asset.animations.find((c) => c.name === name);
      if (!clip || !(clip.duration > 0)) throw Error("Rifle clip missing: " + name);
      if (grip) {
        clips.set(name, { duration: clip.duration, tracks: [] });
        continue;
      }
      const seen = new Set(),
        tracks = clip.tracks.map((track) => {
          const match = /^(.+)\.quaternion$/.exec(track.name);
          if (!match || !bones.has(match[1]) || seen.has(match[1]) || track.ValueTypeName !== "quaternion")
            throw Error("Unexpected rifle track");
          seen.add(match[1]);
          return { bone: bones.get(match[1]), sample: track.createInterpolant(new Float32Array(4)) }; // tuning-ok: one quaternion sample is four floats
        });
      if (seen.size !== bones.size) throw Error("Incomplete rifle upper-body pose");
      clips.set(name, { duration: clip.duration, tracks });
    }
    let active = false,
      disposed = false;
    function restore() {
      if (!active) return;
      for (const [name, bone] of bones) bone.quaternion.copy(base.get(name));
      for (const [bone, q] of saved) bone.quaternion.copy(q);
      saved.clear();
      active = false;
    }
    return {
      mount,
      materials,
      muzzle: root.getObjectByName("Muzzle"),
      restore,
      apply(name, time) {
        if (disposed) return;
        if (active) throw Error("Restore rifle pose before native gait");
        const clip = clips.get(name);
        if (!clip || !Number.isFinite(time)) throw Error("Invalid rifle pose time");
        for (const [name, bone] of bones) base.get(name).copy(bone.quaternion);
        const at = Math.max(0, Math.min(clip.duration, time));
        if (grip) {
          for (const bone of gripBones) saved.set(bone, bone.quaternion.clone());
          const unit = at / clip.duration;
          try {
            holdTwoHanded(model, mount, grip, length, {
              kick: name === "Rifle_Fire" ? 1 - unit : 0,
              reload: name === "Rifle_Reload" ? Math.sin(Math.PI * unit) : 0,
            });
          } catch (error) {
            active = true;
            restore();
            throw error;
          }
        }
        for (const track of clip.tracks) track.bone.quaternion.fromArray(track.sample.evaluate(at)).normalize();
        active = true;
        model.updateWorldMatrix(true, true);
        model.traverse((node) => {
          if (node.isSkinnedMesh) node.skeleton.update();
        });
      },
      dispose() {
        if (disposed) return;
        restore();
        disposed = true;
        mount.removeFromParent();
        for (const row of materials) row.material.dispose();
      },
    };
  } catch (error) {
    mount.removeFromParent();
    for (const row of materials) row.material.dispose();
    throw error;
  }
}
