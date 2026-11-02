// Offline: writes src/data/physicsFloor.json, the skin vertices that can be a corpse's lowest point, so a ragdoll corpse can be seated ON the floor.
//   node tools/physics-floor-support.mjs boss-warden boss-area8-veteran ...      (run from Web/; no textures are decoded)
// The capsules of a body row cannot be as thick as plate armour, a cape or a skirt, so the skin ends below the floor the capsules rest on.
// Which vertices: for every bone, among the vertices it moves by at least KEEP of their weight, the one that reaches furthest in each of
// DIRECTIONS (6 faces, 12 edges, 8 corners of a cube) in the bone's own space. Each kept vertex is stored with ALL its influences (bone, weight, the vertex in that
// bone's space at the bind pose), so at runtime it is skinned exactly as the renderer skins it: sum of weight x bone matrix x point.
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { loadGeometryOnly } from "./glb-geometry-only.js";

const OUT = new URL("../src/data/physicsFloor.json", import.meta.url),
  MANIFEST = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")).models,
  DIRECTIONS = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => [x, y, z]))).filter((d) => d.some(Boolean)), // 6 faces, 12 edges, 8 corners
  KEEP = 0.3, // a bone speaks for the vertices it moves by at least this share
  FLOOR_WEIGHT = 0.02, // an influence lighter than this is dropped and the rest renormalised
  mm = (n) => Math.round(n * 1000) / 1000,
  pct = (n) => Math.round(n * 1000) / 1000;

export async function supportOf(model) {
  const gltf = await loadGeometryOnly(new URL(`../public/assets/${MANIFEST[model].url}`, import.meta.url)),
    names = [],
    verts = [], // { inf: [[bone, w, x, y, z]] }
    best = new Map(); // bone -> per direction { dot, vert }
  gltf.scene.updateMatrixWorld(true);
  const boneIdx = (n) => (names.includes(n) ? names.indexOf(n) : names.push(n) - 1),
    v = new THREE.Vector3();
  gltf.scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.geometry.attributes.skinIndex,
      weight = mesh.geometry.attributes.skinWeight,
      toBone = mesh.skeleton.boneInverses.map((inverse) => inverse.clone().multiply(mesh.bindMatrix));
    for (let i = 0; i < index.count; i++) {
      const inf = [];
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = weight.getComponent(i, k);
        if (w < FLOOR_WEIGHT) continue;
        const b = index.getComponent(i, k);
        v.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(toBone[b]);
        inf.push({ bone: mesh.skeleton.bones[b].name, w, p: [v.x, v.y, v.z] });
        sum += w;
      }
      const vert = { inf: inf.map((x) => ({ ...x, w: x.w / sum })), id: verts.length };
      verts.push(vert);
      for (const x of vert.inf) {
        if (x.w < KEEP) continue;
        const slots = best.get(x.bone) ?? best.set(x.bone, DIRECTIONS.map(() => ({ dot: -Infinity, vert: null }))).get(x.bone);
        DIRECTIONS.forEach((d, n) => {
          const dot = x.p[0] * d[0] + x.p[1] * d[1] + x.p[2] * d[2];
          if (dot > slots[n].dot) slots[n] = { dot, vert };
        });
      }
    }
  });
  const kept = new Set([...best.values()].flatMap((slots) => slots.map((s) => s.vert)));
  for (const vert of kept) for (const x of vert.inf) boneIdx(x.bone);
  const order = [...names].sort();
  return {
    bones: order,
    vertices: [...kept].map((vert) => vert.inf.map((x) => [order.indexOf(x.bone), pct(x.w), ...x.p.map(mm)])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const old = JSON.parse(readFileSync(OUT, "utf8")),
    models = { ...old.models };
  for (const model of process.argv.slice(2)) models[model] = await supportOf(model);
  const body = Object.entries(models)
    .map(([m, d]) => `    ${JSON.stringify(m)}: {\n      "bones": ${JSON.stringify(d.bones)},\n      "vertices": [\n${d.vertices.map((v) => `        [${v.map((i) => `[${i.join(", ")}]`).join(", ")}]`).join(",\n")}\n      ]\n    }`)
    .join(",\n");
  writeFileSync(OUT, `{\n  "schema_version": 1,\n  "note": ${JSON.stringify(old.note)},\n  "models": {\n${body}\n  }\n}\n`);
  console.log(Object.entries(models).map(([m, d]) => `${m}: ${d.bones.length} bones, ${d.vertices.length} vertices`).join("\n"));
}
