import * as T from "three";
// Absolute weapon-owned upper-body tracks; the live character/skeleton stay owners.
export function createRiflePose(model, source) {
  const data = source?.description?.pose,
    asset = source?.gltf,
    hand = model.getObjectByName(data?.mount?.bone ?? "hand_r");
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
    const bones = new Map(
      data.allowlist.map((name) => {
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
