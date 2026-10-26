import * as T from "three";
import { FINISHER_DATA } from "./finisher-data.js";
// Geometry/materials are prepared once. Lethal events copy only the character's bone TRS (armSever.boneCount),
// never vertices, buffers, textures or a second complete character.
export function prepareArmSever({
  model,
  asset,
  scene,
  groundY = 0,
  isBlocked,
  lifetime = FINISHER_DATA.armSever.lifetime,
}) {
  const toss = FINISHER_DATA.armSever;
  const original = model.getObjectByName("Hollow_body_and_worn_trousers"),
    bodySource = asset?.scene.getObjectByName("Prepared_left_arm_body"),
    partSource = asset?.scene.getObjectByName("Prepared_detached_left_arm");
  let native = null;
  original?.traverse((n) => {
    if (n.isSkinnedMesh && !native) native = n;
  });
  if (
    !native ||
    !bodySource ||
    !partSource ||
    native.skeleton.bones.length !== toss.boneCount ||
    !scene?.isScene ||
    typeof isBlocked !== "function"
  )
    throw Error("Compatible prepared Hollow arm required");
  const originals = new Map();
  original.traverse((n) => {
    if (n.isMesh) for (const material of [n.material].flat()) originals.set(material.name, material);
  });
  const body = bodySource.clone(true),
    part = partSource.clone(true),
    container = new T.Group(),
    assembly = new T.Group(),
    bones = native.skeleton.bones.map((b) => {
      const own = new T.Bone();
      own.name = b.name;
      return own;
    }),
    boneMap = new Map(native.skeleton.bones.map((b, i) => [b, bones[i]])),
    materials = [];
  container.name = "Detached closed left arm";
  container.add(assembly);
  assembly.add(part);
  assembly.matrixAutoUpdate = false;
  body.visible = false;
  const owned = new T.Skeleton(
    bones,
    native.skeleton.boneInverses.map((m) => m.clone()),
  );
  let active = false,
    expired = false,
    disposed = false;
  const velocity = new T.Vector3(),
    spin = new T.Vector3(),
    axis = new T.Vector3(),
    rotation = new T.Quaternion(),
    bounds = new T.Box3(),
    center = new T.Vector3();
  let radius = toss.initialRadius;
  try {
    for (const bone of native.skeleton.bones) {
      const own = boneMap.get(bone),
        parent = boneMap.get(bone.parent);
      if (!parent && bone.parent !== original.parent) throw Error("Arm skeleton parent mismatch");
      (parent ?? assembly).add(own);
    }
    function bind(group, skeleton) {
      group.traverse((mesh) => {
        if (!mesh.isMesh) return;
        if (!mesh.isSkinnedMesh) throw Error("Skinned arm primitive required");
        mesh.material = [mesh.material].flat().map((m) => {
          const borrowed = originals.get(m.name);
          if (borrowed) return borrowed;
          if (m.name !== "Opaque arm wound - muscle and bone") throw Error("Unknown arm material");
          const own = m.clone();
          materials.push(own);
          return own;
        })[0];
        mesh.bind(skeleton, native.bindMatrix);
        mesh.frustumCulled = false;
      });
    }
    bind(body, native.skeleton);
    bind(part, owned);
    original.parent.add(body);
    body.position.copy(original.position);
    body.quaternion.copy(original.quaternion);
    body.scale.copy(original.scale);
    part.position.copy(original.position);
    part.quaternion.copy(original.quaternion);
    part.scale.copy(original.scale);
  } catch (error) {
    body.removeFromParent();
    owned.dispose();
    for (const material of materials) material.dispose();
    throw error;
  }
  const initialVisibility = original.visible;
  function stop() {
    container.removeFromParent();
    expired = true;
  }
  return {
    body,
    part,
    container,
    start(direction) {
      if (disposed || active || !initialVisibility) return false;
      original.parent.updateWorldMatrix(true, true);
      native.skeleton.bones.forEach((bone, i) => {
        bones[i].position.copy(bone.position);
        bones[i].quaternion.copy(bone.quaternion);
        bones[i].scale.copy(bone.scale);
      });
      assembly.matrix.copy(original.parent.matrixWorld);
      assembly.matrixWorldNeedsUpdate = true;
      container.updateMatrixWorld(true);
      owned.update();
      bounds.setFromObject(container, true);
      if (bounds.isEmpty()) return false;
      bounds.getCenter(center);
      radius = bounds.getSize(new T.Vector3()).length() / 2;
      if (!Number.isFinite(radius) || radius <= 0) return false;
      container.position.copy(center);
      assembly.matrix.premultiply(new T.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
      assembly.matrixWorldNeedsUpdate = true;
      body.visible = true;
      original.visible = false;
      scene.add(container);
      velocity.set(direction.x * toss.launchSpeed, toss.launchLift, -direction.z * toss.launchSpeed);
      spin.set(-direction.z, 0, -direction.x).normalize().multiplyScalar(toss.spinRate);
      active = true;
      return true;
    },
    update(age, dt) {
      if (!active || disposed || expired) return;
      if (age >= lifetime) {
        stop();
        return;
      }
      const elapsed = Math.min(toss.maxStep, Math.max(0, Number.isFinite(dt) ? dt : 0)),
        steps = Math.ceil(elapsed * 60),
        step = steps ? elapsed / steps : 0;
      for (let i = 0; i < steps; i++) {
        velocity.y -= toss.gravity * step;
        const from = { x: container.position.x, z: -container.position.z },
          next = { x: from.x + velocity.x * step, z: from.z - velocity.z * step };
        if (!isBlocked(next, radius, from)) {
          container.position.x = next.x;
          container.position.z = -next.z;
        } else velocity.x = velocity.z = 0;
        container.position.y += velocity.y * step;
        if (container.position.y < groundY + radius) {
          container.position.y = groundY + radius;
          velocity.y = velocity.y < -1 ? -velocity.y * toss.bounceKeep : 0;
          velocity.x *= toss.groundFriction;
          velocity.z *= toss.groundFriction;
          spin.multiplyScalar(toss.spinDamping);
        }
        const rate = spin.length();
        if (rate > toss.spinMin) {
          axis.copy(spin).multiplyScalar(1 / rate);
          rotation.setFromAxisAngle(axis, rate * step);
          container.quaternion.premultiply(rotation);
        }
      }
    },
    setScene(next) {
      scene = next;
    },
    setDormant(value) {
      if (value) container.removeFromParent();
      else if (active && !expired) scene.add(container);
    },
    anchors() {
      body.updateWorldMatrix(true, true);
      container.updateWorldMatrix(true, true);
      const bone = model.getObjectByName("upperarm_l"),
        stump = bone?.getWorldPosition(new T.Vector3());
      return stump
        ? {
            body: { x: stump.x, y: stump.y, z: stump.z },
            trails: [{ x: container.position.x, y: container.position.y, z: container.position.z }],
          }
        : null;
    },
    stats() {
      return {
        prepared: true,
        active,
        expired,
        ownedSkeletons: 1,
        ownedBones: bones.length,
        lethalVertexCopies: 0,
        ownedMaterials: materials.length,
        radius,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      body.removeFromParent();
      original.visible = initialVisibility;
      owned.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
