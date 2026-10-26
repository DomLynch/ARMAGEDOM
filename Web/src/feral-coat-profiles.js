// Pigment only on the already-applied accepted feral dog. No geometry or rig edits.
// The profiles (id, tint, shapePending) live in Web/src/data/creatures.json `feralCoatProfiles`.
import { GAME_DATA } from "./engine/game-data.js";
export const FERAL_COAT_PROFILES = GAME_DATA.creatures.feralCoatProfiles;
// Apply AFTER feral finish, BEFORE actor-private material/flash clones.
// Templates are borrowed by actors, owned by this cache; dispose after last actor.
export function createFeralCoatProfileLibrary(T) {
  const cache = new WeakMap(),
    owned = new Set();
  let disposed = false;
  return {
    apply(model, id) {
      if (disposed) throw Error("Feral coat profile library disposed");
      const profile = FERAL_COAT_PROFILES.find((r) => r.id === id);
      if (!profile) throw Error("Unknown feral coat profile " + id);
      const meshes = [];
      model.traverse((m) => {
        if (m.isSkinnedMesh && m.material?.name === "Weathered brindle coat") meshes.push(m);
      });
      if (meshes.length !== 1 || !meshes[0].geometry.attributes.color || !meshes[0].material.vertexColors)
        throw Error("Apply accepted feral finish before coat profile");
      const mesh = meshes[0],
        source = mesh.material;
      let rows = cache.get(source);
      if (!rows) cache.set(source, (rows = new Map()));
      if (!rows.has(id)) {
        const m = source.clone();
        m.color.multiply(new T.Color().setRGB(...profile.tint));
        rows.set(id, m);
        owned.add(m);
      }
      mesh.material = rows.get(id);
      return profile;
    },
    costs() {
      return { cachedMaterials: owned.size, newGeometries: 0, newTextures: 0, newDraws: 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of owned) m.dispose();
      owned.clear();
    },
  };
}
