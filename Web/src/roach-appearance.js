import { GAME_DATA } from "./engine/game-data.js";
// Original ground insect shell recipes; Combat supplies rhythm and role.
// The six rows (id, name, width, shellTint, patch) live in Web/src/data/appearance.json `roaches` (read through game-data.js).
export const ROACH_APPEARANCES = GAME_DATA.appearance.roaches;
// The shell taper band and the wear noise (appearance.json `roachCoat`): wear is a smooth noise of the vertex position.
const COAT = GAME_DATA.appearance.roachCoat;
const SHELL = new Set(["abdomen", "thorax"]);
const SHELL_MATERIAL = GAME_DATA.appearance.meshNames.roachShell;
const XYZ = 3; // tuning-ok: a colour packed as three floats
const INFLUENCES = 4; // tuning-ok: a vertex has four skin influences
export function createRoachAppearanceLibrary(T) {
  const caches = new WeakMap(),
    ownedG = new Set(),
    ownedM = new Set();
  let disposed = false;
  return {
    apply(model, id) {
      if (disposed) throw Error("Roach appearance library disposed");
      const r = ROACH_APPEARANCES.find((r) => r.id === id);
      if (!r) throw Error("Unknown roach appearance " + id);
      const meshes = [];
      model.traverse((m) => {
        if (m.isSkinnedMesh) meshes.push(m);
      });
      if (meshes.length !== 1 || meshes[0].name !== "ARM_Original_Infected_Ground_Roach")
        throw Error("Original roach foundation required");
      const m = meshes[0];
      if (Array.isArray(m.material) || m.material.name !== SHELL_MATERIAL)
        throw Error("Original roach material required");
      let cache = caches.get(m.geometry);
      if (!cache) caches.set(m.geometry, (cache = new Map()));
      let entry = cache.get(id);
      if (!entry) {
        const g = r.id === "roach-sewer" ? m.geometry : m.geometry.clone(),
          mat = m.material.clone();
        if (r.id !== "roach-sewer") {
          const p = g.attributes.position,
            ix = g.attributes.skinIndex,
            w = g.attributes.skinWeight,
            c = new Float32Array(p.count * XYZ),
            original = m.geometry.attributes.color;
          for (let i = 0; i < p.count; i++) {
            let shell = 0;
            for (let k = 0; k < INFLUENCES; k++)
              if (SHELL.has(m.skeleton.bones[ix.getComponent(i, k)]?.name)) shell += w.getComponent(i, k);
            const mask = Math.max(0, Math.min(1, (shell - COAT.taper.from) / COAT.taper.range)),
              x = p.getX(i),
              y = p.getY(i),
              z = p.getZ(i);
            p.setX(i, x * (1 + (r.width - 1) * mask));
            const f = COAT.field,
              field = Math.sin(z * f.z + Math.cos(x * f.cosX) * f.wobble) + Math.sin(y * f.y + z * f.z2),
              wear = 1 - r.patch * Math.max(0, Math.min(1, (field - COAT.wear.from) / COAT.wear.range)) * mask;
            for (let k = 0; k < XYZ; k++)
              c[i * XYZ + k] = (original ? original.getComponent(i, k) : 1) * (1 + (r.shellTint[k] - 1) * mask) * wear;
          }
          g.setAttribute("color", new T.BufferAttribute(c, XYZ));
          mat.vertexColors = true;
          if (r.width !== 1) g.computeVertexNormals();
          g.computeBoundingBox();
          g.computeBoundingSphere();
          ownedG.add(g);
        }
        ownedM.add(mat);
        entry = { geometry: g, material: mat };
        cache.set(id, entry);
      }
      m.geometry = entry.geometry;
      m.material = entry.material;
      return r;
    },
    costs() {
      return {
        cachedGeometries: ownedG.size,
        cachedMaterialTemplates: ownedM.size,
        extraGeometryBytes: [...ownedG].reduce(
          (n, g) =>
            n +
            Object.values(g.attributes).reduce((s, a) => s + a.array.byteLength, 0) +
            (g.index?.array.byteLength ?? 0),
          0,
        ),
        extraTextures: 0,
        extraPrimitives: 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const g of ownedG) g.dispose();
      for (const m of ownedM) m.dispose();
      ownedG.clear();
      ownedM.clear();
    },
  };
}
