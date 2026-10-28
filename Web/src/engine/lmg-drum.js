import * as T from "three";
import { GAME_DATA } from "./game-data.js";
// The Light Machine Gun reuses the rigid player-rifle model and adds a drum magazine from procedural geometry: one cylinder and one band,
// no lights, no colliders. Every size, position and colour is Web/src/data/lmgDrum.json.
export function createLmgDrum(root) {
  const look = GAME_DATA.lmgDrum,
    group = new T.Group();
  group.name = "Light machine gun drum"; // text-ok: scene-graph object name
  root.add(group);
  const drumGeometry = new T.CylinderGeometry(look.drum.radius, look.drum.radius, look.drum.width, look.drum.segments),
    bandGeometry = new T.CylinderGeometry(look.band.radius, look.band.radius, look.band.width, look.band.segments),
    drumMaterial = new T.MeshStandardMaterial({
      color: look.material.color,
      metalness: look.material.metalness,
      roughness: look.material.roughness,
    }),
    bandMaterial = new T.MeshStandardMaterial({
      color: look.material.bandColor,
      metalness: look.material.metalness,
      roughness: look.material.roughness,
    }),
    drum = new T.Mesh(drumGeometry, drumMaterial),
    band = new T.Mesh(bandGeometry, bandMaterial);
  // The cylinder's axis is Y; the drum sits side-on, so its axis runs across the gun (X).
  drum.rotation.z = Math.PI / 2; // tuning-ok: a quarter turn lays the cylinder on its side
  band.rotation.z = drum.rotation.z;
  band.position.x = look.band.offset;
  group.add(drum, band);
  group.position.set(0, look.drum.y, look.drum.z);
  let disposed = false;
  return {
    root: group,
    update({ visible = true } = {}) {
      if (!disposed) group.visible = visible;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      drumGeometry.dispose();
      bandGeometry.dispose();
      drumMaterial.dispose();
      bandMaterial.dispose();
    },
  };
}
