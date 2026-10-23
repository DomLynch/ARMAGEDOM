import * as T from "three";
// Existing rigid Rifle root/hand/pose stays owner; two bounded decorative draws, no lights/colliders.
export function createRailgunCoils(root) {
  const group = new T.Group();
  group.name = "Thundercoil amber coils";
  root.add(group);
  const geometry = new T.TorusGeometry(0.062, 0.012, 5, 16),
    material = new T.MeshStandardMaterial({
      color: 0x80542e,
      metalness: 0.8,
      roughness: 0.35,
      emissive: 0xff9a28,
      emissiveIntensity: 0.2,
    }),
    rings = new T.InstancedMesh(geometry, material, 3),
    pose = new T.Object3D();
  rings.name = "Thundercoil three rings";
  rings.frustumCulled = false;
  for (let i = 0; i < 3; i++) {
    pose.position.set(0, 0.09, 0.37 + i * 0.085);
    pose.updateMatrix();
    rings.setMatrixAt(i, pose.matrix);
  }
  group.add(rings);
  const arcGeometry = new T.BufferGeometry().setFromPoints([
      new T.Vector3(-0.04, 0.13, 0.35),
      new T.Vector3(0.035, 0.16, 0.4),
      new T.Vector3(-0.03, 0.14, 0.46),
      new T.Vector3(0.04, 0.13, 0.52),
      new T.Vector3(0, 0.09, 0.61),
    ]),
    arcMaterial = new T.LineBasicMaterial({ color: 0xffd584, transparent: true, opacity: 0, depthWrite: false }),
    arc = new T.Line(arcGeometry, arcMaterial);
  arc.name = "Thundercoil finite charge arc";
  group.add(arc);
  let disposed = false;
  return {
    root: group,
    update({ charging = false, progress = 0, time = 0, visible = true } = {}) {
      if (disposed) return;
      group.visible = visible;
      const n = Math.max(0, Math.min(1, progress));
      material.emissiveIntensity = charging ? 0.25 + n * 2 : 0.2;
      arc.visible = charging;
      arcMaterial.opacity = charging ? 0.25 + 0.4 * n + 0.2 * Math.sin(time * 31) ** 2 : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      arcGeometry.dispose();
      arcMaterial.dispose();
    },
  };
}
