import * as T from "three";
import { GAME_DATA } from "./game-data.js";
// Existing rigid Rifle root/hand/pose stays owner; two bounded decorative draws, no lights/colliders.
// The ring, material, arc and glow numbers are Web/src/data/railgunCoils.json.
export function createRailgunCoils(root) {
  const look = GAME_DATA.railgunCoils,
    group = new T.Group();
  group.name = "Thundercoil amber coils";
  root.add(group);
  const geometry = new T.TorusGeometry(
      look.ring.radius,
      look.ring.tube,
      look.ring.radialSegments,
      look.ring.tubularSegments,
    ),
    material = new T.MeshStandardMaterial({
      color: look.material.color,
      metalness: look.material.metalness,
      roughness: look.material.roughness,
      emissive: look.material.emissive,
      emissiveIntensity: look.material.emissiveIdle,
    }),
    rings = new T.InstancedMesh(geometry, material, look.ring.count),
    pose = new T.Object3D();
  rings.name = "Thundercoil three rings";
  rings.frustumCulled = false;
  for (let i = 0; i < look.ring.count; i++) {
    pose.position.set(0, look.ring.y, look.ring.z + i * look.ring.zStep);
    pose.updateMatrix();
    rings.setMatrixAt(i, pose.matrix);
  }
  group.add(rings);
  const arcGeometry = new T.BufferGeometry().setFromPoints(look.arc.points.map(([x, y, z]) => new T.Vector3(x, y, z))),
    arcMaterial = new T.LineBasicMaterial({ color: look.arc.color, transparent: true, opacity: 0, depthWrite: false }),
    arc = new T.Line(arcGeometry, arcMaterial);
  arc.name = "Thundercoil finite charge arc";
  group.add(arc);
  const charge = look.charge;
  let disposed = false;
  return {
    root: group,
    update({ charging = false, progress = 0, time = 0, visible = true } = {}) {
      if (disposed) return;
      group.visible = visible;
      const n = Math.max(0, Math.min(1, progress));
      material.emissiveIntensity = charging
        ? charge.emissiveBase + n * charge.emissiveGain
        : look.material.emissiveIdle;
      arc.visible = charging;
      arcMaterial.opacity = charging
        ? charge.opacityBase + charge.opacityGain * n + charge.flicker * Math.sin(time * charge.flickerRate) ** 2 // tuning-ok: squared sine
        : 0;
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
