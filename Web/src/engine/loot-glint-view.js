import { LOOT } from "./loot.js";
// The glint where a rare drop fell: one thin gold ring on the ground that widens and fades (data/loot.json `glint`). It reads the run's
// `g.loot.glints` rows each frame and keeps one mesh per row until the row's time is up. Geometry is shared; each ring owns its material so
// they fade on their own. A run with no loot builds nothing.
export function createLootGlintView(world, rules) {
  const { THREE } = world,
    data = rules !== undefined ? rules : LOOT.glint,
    group = new THREE.Group(),
    rows = new Map();
  let geometry = null,
    disposed = false;
  world.group.add(group);
  function remove(row) {
    row.mesh.removeFromParent();
    row.mesh.material.dispose();
    rows.delete(row.source);
  }
  return {
    group,
    sync(g) {
      if (disposed) return;
      const list = g.loot && g.loot.glints ? g.loot.glints : [];
      for (const glint of list) {
        if (rows.has(glint) || g.time >= glint.until) continue;
        geometry ??= new THREE.RingGeometry(1 - data.width, 1, data.segments);
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(`#${data.colour}`),
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = data.tilt; // lies flat on the ground
        mesh.position.set(glint.x, data.lift, -glint.z);
        mesh.renderOrder = 1;
        group.add(mesh);
        rows.set(glint, { mesh, source: glint });
      }
      for (const row of [...rows.values()]) {
        const glint = row.source,
          t = (g.time - glint.from) / (glint.until - glint.from);
        if (t >= 1 || !list.includes(glint)) {
          remove(row);
          continue;
        }
        row.mesh.scale.setScalar(data.radiusFrom + (data.radiusTo - data.radiusFrom) * Math.max(0, t));
        row.mesh.material.opacity = data.opacity * (1 - Math.max(0, t));
      }
      // Spent rows leave the run so the list never grows.
      if (list.length) g.loot.glints = list.filter((glint) => g.time < glint.until);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const row of [...rows.values()]) remove(row);
      group.removeFromParent();
      if (geometry) geometry.dispose();
    },
  };
}
