import { addPickupGlow } from "../pickup-glow.js";
import { modelGeometry } from "./world-pickups-view.js";
import { KILL_DROPS, killDropsOn } from "./kill-drops.js";
// The coins lying where enemies fell (data/killDrops.json `models`): one small mesh per drop, built from the tier's cylinder parts and
// removed when the drop is taken or expires. Geometry and material are shared per model and built on the first drop, so a stage with
// the feature off (or no kills yet) pays nothing.
export function createKillDropsView(world) {
  const { THREE } = world,
    group = new THREE.Group(),
    geometries = new Map(),
    rows = new Map();
  let material = null,
    disposed = false;
  world.group.add(group);
  const geometryFor = (name) => {
    if (!geometries.has(name)) geometries.set(name, modelGeometry(THREE, KILL_DROPS.models[name], KILL_DROPS.cylinderSegments));
    return geometries.get(name);
  };
  function remove(id) {
    const row = rows.get(id);
    row.glow.dispose();
    row.mesh.removeFromParent();
    rows.delete(id);
  }
  return {
    group,
    // Once a frame: add a mesh for each new drop, drop the ones that are gone.
    sync(g) {
      if (disposed || !killDropsOn()) return;
      const list = g.killDrops?.list ?? [],
        live = new Set();
      for (const d of list) {
        if (d.areaId !== world.areaId) continue;
        live.add(d.id);
        if (rows.has(d.id)) continue;
        material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: KILL_DROPS.roughness, metalness: KILL_DROPS.metalness });
        const mesh = new THREE.Mesh(geometryFor(KILL_DROPS.tiers[d.tier].model), material);
        mesh.position.set(d.x, 0, -d.z);
        mesh.scale.setScalar(KILL_DROPS.displayScale);
        group.add(mesh);
        rows.set(d.id, { mesh, glow: addPickupGlow(mesh) });
      }
      for (const id of [...rows.keys()]) if (!live.has(id)) remove(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of [...rows.keys()]) remove(id);
      group.removeFromParent();
      for (const geometry of geometries.values()) geometry.dispose();
      material?.dispose();
    },
  };
}
