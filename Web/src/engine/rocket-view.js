import * as T from "three";
import { createPickupModel } from "./pickup-model-view.js";
import { WEAPON_VIEWS } from "./weapon-view-data.js";
const FLASH = WEAPON_VIEWS.rocket.blast,
  hex = (c) => `#${c}`;
// `explosions` is the shared explosion effect (engine/explosion-effect.js) the blast also sets off; its owner updates and clears it.
export function createRocketView(s, explosions = null) {
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
          if (g.time - blast.time <= FLASH.seconds) {
            const root = new T.Group(),
              ring = new T.Mesh(
                new T.RingGeometry(
                  (blast.radius ?? FLASH.fallbackRadius) * FLASH.ringInnerRatio,
                  blast.radius ?? FLASH.fallbackRadius,
                  FLASH.ringSegments,
                ),
                new T.MeshBasicMaterial({
                  color: hex(FLASH.ringColour),
                  transparent: true,
                  opacity: FLASH.ringOpacity,
                  depthWrite: false,
                  side: T.DoubleSide,
                }),
              ),
              core = new T.Mesh(
                new T.SphereGeometry(FLASH.coreRadius, FLASH.coreWidthSegments, FLASH.coreHeightSegments),
                new T.MeshBasicMaterial({
                  color: hex(FLASH.coreColour),
                  transparent: true,
                  opacity: FLASH.coreOpacity,
                  depthWrite: false,
                }),
              );
            ring.rotation.x = -Math.PI / 2; // tuning-ok: quarter turn lays the ring flat on the ground
            core.position.y = FLASH.coreHeight;
            root.add(ring, core);
            root.position.copy(s.world.toRender(blast.position, FLASH.groundLift));
            explosions?.spawn(root.position, blast.radius ?? FLASH.fallbackRadius, blast.time);
            s.scene.add(root);
            blasts.set(blast.id, { root, start: blast.time, npc: blast.id.startsWith("boss-rocket:") });
          }
        }
      }
      for (const [id, row] of blasts) {
        const age = g.time - row.start;
        if (age >= FLASH.seconds || (row.npc && g.bossRocketBlast?.id !== id)) {
          row.root.removeFromParent();
          for (const mesh of row.root.children) {
            mesh.geometry.dispose();
            mesh.material.dispose();
          }
          blasts.delete(id);
          continue;
        }
        row.root.scale.setScalar(FLASH.startScale + (age / FLASH.seconds) * FLASH.growScale);
        for (const mesh of row.root.children) mesh.material.opacity = FLASH.coreOpacity * (1 - age / FLASH.seconds);
      }
    },
  };
}
