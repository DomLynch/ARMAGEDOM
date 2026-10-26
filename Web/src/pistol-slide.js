import * as T from "three";

// Exact authored upper assembly in pistol.glb. Bounds are metres in Pistol space.
const upperBounds = [
  [-0.016, 0.036, -0.02, 0.016, 0.074, 0.16],
  [-0.0125, 0.075, -0.012, 0.0125, 0.083, -0.004],
  [-0.0035, 0.0755, 0.137, 0.0035, 0.0825, 0.147],
  [-0.007, 0.048, 0.1599, 0.007, 0.062, 0.1609],
  ...Array.from({ length: 5 }, (_, i) =>
    [-1, 1].map((sign) => [
      sign < 0 ? -0.017 : 0.016,
      0.0425,
      -0.0039 + i * 0.004,
      sign < 0 ? -0.016 : 0.017,
      0.0675,
      -0.0021 + i * 0.004,
    ]),
  ).flat(),
];
const key = (values) => values.map((v) => Math.round(v * 1e6)).join(",");
const expected = new Set(upperBounds.map(key));
const unsupported = (reason) => ({ supported: false, reason, setRecoil() {}, reset() {}, dispose() {} });

// Prepare once AFTER actor material cloning; never allocate geometry on a shot.
export function attachPistolSlide(mount) {
  const container = mount?.getObjectByName("PistolMesh");
  if (!container || container.getObjectByName("PistolSlide"))
    return unsupported("Missing pistol container, or slide already attached"); // text-ok: asset-inspection diagnostic, never shown to the player
  const meshes = container.children;
  if (
    meshes.length !== 3 ||
    container.position.distanceTo(new T.Vector3(0, 0.027, 0.05)) > 1e-6 ||
    container.quaternion.angleTo(new T.Quaternion()) > 1e-6 ||
    container.scale.distanceTo(new T.Vector3(1, 1, 1)) > 1e-6
  )
    return unsupported("Pistol container differs from the inspected asset"); // text-ok: asset-inspection diagnostic, never shown to the player
  const names = ["CharcoalGrip", "WornSteel", "MuzzleRecess"],
    counts = [264, 1980, 1848];
  const splits = [],
    matched = new Set();
  let islands = 0;
  for (let primitive = 0; primitive < meshes.length; primitive++) {
    const mesh = meshes[primitive],
      source = mesh.geometry,
      pos = source?.getAttribute("position");
    if (
      !mesh.isMesh ||
      mesh.isSkinnedMesh ||
      !source?.index ||
      source.index.count !== counts[primitive] ||
      mesh.material.name !== names[primitive] ||
      !pos ||
      pos.isInterleavedBufferAttribute ||
      mesh.position.length() > 1e-6 ||
      mesh.quaternion.angleTo(new T.Quaternion()) > 1e-6 ||
      mesh.scale.distanceTo(new T.Vector3(1, 1, 1)) > 1e-6
    )
      return unsupported("Pistol primitive differs from the inspected asset"); // text-ok: asset-inspection diagnostic, never shown to the player
    const vertices = new Map(),
      parents = new Map(),
      triangles = [];
    function find(k) {
      let p = parents.get(k);
      while (p !== parents.get(p)) p = parents.get(p);
      return p;
    }
    function vertex(index) {
      const xyz = [pos.getX(index), pos.getY(index), pos.getZ(index)],
        k = key(xyz);
      if (!parents.has(k)) {
        parents.set(k, k);
        vertices.set(k, xyz);
      }
      return k;
    }
    for (let i = 0; i < source.index.count; i += 3) {
      const indices = [source.index.getX(i), source.index.getX(i + 1), source.index.getX(i + 2)];
      const keys = indices.map(vertex),
        a = find(keys[0]);
      for (const k of keys) parents.set(find(k), a);
      triangles.push({ indices, keys });
    }
    const parts = new Map();
    for (const triangle of triangles) {
      const root = find(triangle.keys[0]);
      if (!parts.has(root)) parts.set(root, []);
      parts.get(root).push(triangle);
    }
    const fixedIndices = [],
      slideIndices = [];
    for (const part of parts.values()) {
      if (part.length !== 44) return unsupported("Authored bevel island topology differs"); // text-ok: asset-inspection diagnostic, never shown to the player
      islands++;
      const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const triangle of part)
        for (const k of triangle.keys) {
          const xyz = vertices.get(k);
          for (let axis = 0; axis < 3; axis++) {
            const value = xyz[axis] + container.position.getComponent(axis);
            bounds[axis] = Math.min(bounds[axis], value);
            bounds[axis + 3] = Math.max(bounds[axis + 3], value);
          }
        }
      const signature = key(bounds),
        upper = expected.has(signature);
      if (upper) {
        if (matched.has(signature)) return unsupported("Duplicate upper island"); // text-ok: asset-inspection diagnostic, never shown to the player
        matched.add(signature);
      }
      const target = upper ? slideIndices : fixedIndices;
      for (const triangle of part) target.push(...triangle.indices);
    }
    if (slideIndices.length) splits.push({ mesh, source, fixedIndices, slideIndices });
  }
  if (islands !== 31 || matched.size !== 14 || splits.length !== 2)
    return unsupported("Upper assembly does not match all fourteen authored islands"); // text-ok: asset-inspection diagnostic, never shown to the player
  const slide = new T.Group();
  slide.name = "PistolSlide";
  const owned = [];
  for (const split of splits) {
    // Clone attributes too: owned geometry disposal cannot release source buffers.
    const frameGeometry = split.source.clone(),
      slideGeometry = split.source.clone();
    frameGeometry.setIndex(split.fixedIndices);
    slideGeometry.setIndex(split.slideIndices);
    const part = new T.Mesh(slideGeometry, split.mesh.material);
    part.name = split.mesh.name + "Slide";
    part.castShadow = split.mesh.castShadow;
    part.receiveShadow = split.mesh.receiveShadow;
    part.frustumCulled = split.mesh.frustumCulled;
    part.renderOrder = split.mesh.renderOrder;
    split.mesh.geometry = frameGeometry;
    slide.add(part);
    owned.push({ ...split, frameGeometry, slideGeometry });
  }
  container.add(slide);
  let disposed = false;
  return {
    supported: true,
    slide,
    triangles: { stationary: 748, moving: 616 },
    setRecoil(amount) {
      if (!disposed) {
        const value = T.MathUtils.clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
        slide.position.z = value > 0 ? -0.012 * value : 0;
      }
    },
    reset() {
      if (!disposed) slide.position.z = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      slide.removeFromParent();
      for (const part of owned) {
        if (part.mesh.geometry === part.frameGeometry) part.mesh.geometry = part.source;
        part.frameGeometry.dispose();
        part.slideGeometry.dispose();
      }
    },
  };
}
