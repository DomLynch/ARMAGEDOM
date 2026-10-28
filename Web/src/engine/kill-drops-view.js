import { addPickupGlow } from "../pickup-glow.js";
import { modelGeometry } from "./world-pickups-view.js";
import { CLASSIC_COINS, KILL_DROPS, killDropsOn } from "./kill-drops.js";
import { createDropFxKit } from "./kill-drops-fx.js";
import { createLootGlintView } from "./loot-glint-view.js";
// The coins lying where enemies fell (data/killDrops.json): one small mesh per drop, built from the chosen look's tier models and removed when
// the drop is taken or expires. `look` names a row of `looks` (models, material, motion and the light around each tier) or "classic" for the
// plain `models`. Geometry and material are shared per model and built on the first drop, so a stage with the feature off (or no kills yet) pays nothing.
export function createKillDropsView(world) {
  const { THREE } = world,
    group = new THREE.Group(),
    glints = createLootGlintView(world),
    geometries = new Map(),
    rows = new Map(),
    look = CLASSIC_COINS ? null : (KILL_DROPS.looks[KILL_DROPS.look] ?? null),
    models = look?.models ?? KILL_DROPS.models,
    scale = look?.scale ?? KILL_DROPS.displayScale,
    TAU = (360 * Math.PI) / 180, // a full turn in radians
    HALF = 1 / (1 + 1); // maps a sine wave from -1..1 onto 0..1
  let material = null,
    kit = null,
    disposed = false;
  world.group.add(group);
  const geometryFor = (name) => {
    if (!geometries.has(name)) geometries.set(name, modelGeometry(THREE, models[name], KILL_DROPS.cylinderSegments));
    return geometries.get(name);
  };
  function remove(id) {
    const row = rows.get(id);
    row.glow.dispose();
    row.fx?.dispose();
    row.root.removeFromParent();
    rows.delete(id);
  }
  return {
    group,
    // Once a frame: add a mesh for each new drop, drop the ones that are gone, move the live ones with the game clock.
    sync(g) {
      glints.sync(g); // rare-drop rings (data/loot.json) run whether or not coins are on
      if (disposed || !killDropsOn()) return;
      const list = g.killDrops?.list ?? [],
        live = new Set(),
        m = look?.material ?? {};
      for (const d of list) {
        if (d.areaId !== world.areaId) continue;
        live.add(d.id);
        if (rows.has(d.id)) continue;
        material ??= new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: m.roughness ?? KILL_DROPS.roughness,
          metalness: m.metalness ?? KILL_DROPS.metalness,
          emissive: new THREE.Color(`#${m.emissive ?? "000000"}`),
          emissiveIntensity: m.emissiveIntensity ?? 1,
        });
        const root = new THREE.Group(),
          mesh = new THREE.Mesh(geometryFor(KILL_DROPS.tiers[d.tier].model), material),
          fxRow = look?.fx?.[d.tier];
        root.position.set(d.x, 0, -d.z);
        mesh.scale.setScalar(scale);
        root.add(mesh);
        let fx = null;
        if (fxRow) {
          kit ??= createDropFxKit(THREE, KILL_DROPS.fxStyle);
          fx = kit.build(fxRow, d.id);
          root.add(fx.group);
        }
        group.add(root);
        rows.set(d.id, { root, mesh, fx, glow: addPickupGlow(mesh) });
      }
      for (const id of [...rows.keys()]) if (!live.has(id)) remove(id);
      const t = g.time ?? 0,
        mo = look?.motion;
      for (const [id, row] of rows) {
        row.fx?.update(t);
        if (!mo) continue;
        row.mesh.rotation.y = t * mo.spin * TAU + id;
        row.mesh.position.y = mo.lift + mo.bob * (HALF + HALF * Math.sin(t * mo.bobHz * TAU + id));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      glints.dispose();
      for (const id of [...rows.keys()]) remove(id);
      group.removeFromParent();
      for (const geometry of geometries.values()) geometry.dispose();
      kit?.dispose();
      material?.dispose();
    },
  };
}
