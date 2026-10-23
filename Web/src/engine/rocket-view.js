import * as T from "three";
import { createPickupModel } from "./pickup-model-view.js";
export function createRocketView(s) {
  const projectiles = new Map(),
    blasts = new Map(),
    forward = new T.Vector3(0, 0, 1),
    direction = new T.Vector3();
  let lastGame = null,
    lastArea = null,
    lastBlast = null;
  function clear() {
    for (const view of projectiles.values()) view.dispose();
    projectiles.clear();
    for (const row of blasts.values()) {
      row.root.removeFromParent();
      for (const mesh of row.root.children) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    blasts.clear();
  }
  return {
    clear,
    dispose: clear,
    update(g) {
      if (g !== lastGame) {
        clear();
        lastBlast = null;
        lastGame = g;
      }
      if (g.world.areaId !== lastArea) {
        clear();
        lastArea = g.world.areaId;
      }
      if (g.finished || g.player.hp <= 0) {
        clear();
        lastBlast = g.bossEquipmentAction?.rocketLauncher?.lastBlast?.id ?? lastBlast;
        return;
      }
      const rows = [...(g.activeRockets ?? []), ...(g.bossRockets ?? [])].filter(
          (row) => row.areaId === g.world.areaId,
        ),
        ids = new Set(rows.map((row) => row.id));
      for (const [id, view] of projectiles)
        if (!ids.has(id)) {
          view.dispose();
          projectiles.delete(id);
        }
      for (const row of rows) {
        let view = projectiles.get(row.id);
        if (!view) {
          const source = s.actors.equipmentProjectileAsset("rocketLauncher");
          if (!source) continue;
          view = createPickupModel(source.gltf, { rootName: "RocketProjectile", ground: false });
          s.scene.add(view.root);
          projectiles.set(row.id, view);
        }
        view.root.position.set(row.position.x, row.position.y, row.position.z);
        direction.set(row.direction.x, row.direction.y, row.direction.z).normalize();
        view.root.quaternion.setFromUnitVectors(forward, direction);
      }
      for (const blast of [g.bossEquipmentAction?.rocketLauncher?.lastBlast, g.bossRocketBlast]) {
        if (blast && !blasts.has(blast.id) && blast.id !== lastBlast && blast.areaId === g.world.areaId) {
          lastBlast = blast.id;
          if (g.time - blast.time <= 0.35) {
            const root = new T.Group(),
              ring = new T.Mesh(
                new T.RingGeometry((blast.radius ?? 3) * 0.9733333333, blast.radius ?? 3, 40),
                new T.MeshBasicMaterial({
                  color: 0xffc064,
                  transparent: true,
                  opacity: 0.8,
                  depthWrite: false,
                  side: T.DoubleSide,
                }),
              ),
              core = new T.Mesh(
                new T.SphereGeometry(0.25, 8, 6),
                new T.MeshBasicMaterial({ color: 0xffd797, transparent: true, opacity: 0.85, depthWrite: false }),
              );
            ring.rotation.x = -Math.PI / 2;
            core.position.y = 0.25;
            root.add(ring, core);
            root.position.copy(s.world.toRender(blast.position, 0.025));
            s.scene.add(root);
            blasts.set(blast.id, { root, start: blast.time, npc: blast.id.startsWith("boss-rocket:") });
          }
        }
      }
      for (const [id, row] of blasts) {
        const age = g.time - row.start;
        if (age >= 0.35 || (row.npc && g.bossRocketBlast?.id !== id)) {
          row.root.removeFromParent();
          for (const mesh of row.root.children) {
            mesh.geometry.dispose();
            mesh.material.dispose();
          }
          blasts.delete(id);
          continue;
        }
        row.root.scale.setScalar(0.2 + (age / 0.35) * 0.8);
        for (const mesh of row.root.children) mesh.material.opacity = 0.85 * (1 - age / 0.35);
      }
    },
  };
}
