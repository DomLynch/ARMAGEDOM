import * as T from "three";
import { FACE_HEADS, FACE_SKINS, ORIGINAL_FACE_ID, faceRecipeFor } from "./face-recipes.js";
import { GAME_DATA } from "./engine/game-data.js";

// The cheek tint and the three head mesh names live in Web/src/data/appearance.json `faceMesh` (read through game-data.js); the head
// blend band (`faceField`), the weathering overlays (`faceWeathering`) and the hair ingredients (`faceHair`) sit beside it.
const { cheek: CHEEK, headNames: HEAD_NAMES } = GAME_DATA.appearance.faceMesh;
const FIELD = GAME_DATA.appearance.faceField,
  WEATHER = GAME_DATA.appearance.faceWeathering,
  HAIR = GAME_DATA.appearance.faceHair;
const {
  donorNeck: NECK_NAME,
  hair: HAIR_NAME,
  hairMaterial: HAIR_MATERIAL,
  bodySkin: BODY_SKIN,
  neckSkin: NECK_SKIN,
} = GAME_DATA.appearance.meshNames;
const SKIN_NAMES = new Set([BODY_SKIN, NECK_SKIN]);
// Geometry builders hand control back every 128 steps (4 ms slices) so a face recipe never blocks a frame; hair edges every 256 triangles.
// The slice, the step counts and the weld precision (positions and weights rounded to a millionth) are appearance.json `faceBuild`; both
// step counts are powers of two so a mask test stands in for the remainder.
const BUILD = GAME_DATA.appearance.faceBuild;
const SLICE_MS = BUILD.sliceMs,
  YIELD_MASK = BUILD.yieldEvery - 1,
  YIELD_MASK_TRIANGLES = BUILD.yieldEveryTriangles - 1,
  KEY_PRECISION = BUILD.weldPrecision;
const XYZ = 3; // tuning-ok: a point or colour packed as three floats
const UV = 2; // tuning-ok: a texture coordinate packed as two floats
const INFLUENCES = 4; // tuning-ok: a vertex has four skin influences
const CORNERS = 3; // tuning-ok: a triangle has three corners
const LAST_CORNER = CORNERS - 1;
const smoothstep = (u) => u * u * (3 - 2 * u); // tuning-ok: the smoothstep polynomial
const unitSine = (x) => 0.5 + 0.5 * Math.sin(x); // tuning-ok: maps the sine's -1..1 onto 0..1
const squared = (x) => x ** 2; // tuning-ok: a square
function field(p, head) {
  const u = T.MathUtils.clamp((p.y - FIELD.from) / FIELD.range, 0, 1),
    t = smoothstep(u);
  return new T.Vector3(
    p.x * (1 + (head.width - 1) * t),
    p.y + (p.y - FIELD.pivot) * (head.height - 1) * t,
    p.z * (1 + (head.width - 1) * FIELD.depth * t),
  );
}
function fieldNormal(p, n, h) {
  const u = T.MathUtils.clamp((p.y - FIELD.from) / FIELD.range, 0, 1),
    t = smoothstep(u),
    dt = (6 * u * (1 - u)) / FIELD.range, // tuning-ok: derivative of the smoothstep 3u^2 - 2u^3
    sx = 1 + (h.width - 1) * t,
    sz = 1 + (h.width - 1) * FIELD.depth * t,
    dy = 1 + (h.height - 1) * (t + (p.y - FIELD.pivot) * dt),
    x = n.x / sx,
    z = n.z / sz;
  return new T.Vector3(
    x,
    (n.y - p.x * (h.width - 1) * dt * x - p.z * (h.width - 1) * FIELD.depth * dt * z) / dy,
    z,
  ).normalize();
}
function weather(p, id) {
  const [nx, ny, nz] = WEATHER.noise,
    noise = unitSine(p.x * nx + p.y * ny + p.z * nz),
    front = p.z > WEATHER.frontZ,
    { stubble, scar, ash, grime, dust } = WEATHER;
  if (id === "stubble" && front && p.y < stubble.maxY) return stubble.base.map((b, k) => b + stubble.gain[k] * noise);
  if (
    id === "scar" &&
    front &&
    p.x > scar.minX &&
    p.x < scar.maxX &&
    Math.abs(p.y - (scar.baseY + p.x * scar.slope)) < scar.halfWidth
  )
    return [...scar.color];
  if (id === "ash" && front && p.y > ash.minY && noise > ash.noiseMin) return [...ash.color];
  if (id === "grime" && front && noise > grime.noiseMin) return grime.base.map((b, k) => b + grime.gain[k] * noise);
  if (id === "dust" && front) return dust.base.map((b, k) => b + dust.gain[k] * noise);
  return [1, 1, 1];
}
function* changedGeometrySteps(source, h, weathering = null) {
  const g = source.clone();
  let completed = false,
    since = performance.now();
  try {
    const pos = source.getAttribute("position"),
      norm = source.getAttribute("normal"),
      out = new Float32Array(pos.count * XYZ),
      ns = new Float32Array(pos.count * XYZ),
      cs = weathering ? new Float32Array(pos.count * XYZ) : null;
    for (let i = 0; i < pos.count; i++) {
      const p = new T.Vector3().fromBufferAttribute(pos, i);
      field(p, h).toArray(out, i * XYZ);
      fieldNormal(p, new T.Vector3().fromBufferAttribute(norm, i), h).toArray(ns, i * XYZ);
      if (cs) cs.set(weather(p, weathering), i * XYZ);
      if ((i & YIELD_MASK) === 0 && performance.now() - since >= SLICE_MS) {
        yield "face-vertices";
        since = performance.now();
      }
    }
    g.setAttribute("position", new T.BufferAttribute(out, XYZ));
    g.setAttribute("normal", new T.BufferAttribute(ns, XYZ));
    if (cs) g.setAttribute("color", new T.BufferAttribute(cs, XYZ));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    completed = true;
    return g;
  } finally {
    if (!completed) g.dispose();
  }
}
function* hairGeometrySteps(source, h, style) {
  let since = performance.now(),
    welded = 0,
    built = 0,
    indexed = 0,
    g = null,
    completed = false;
  try {
    const pos = source.getAttribute("position"),
      joints = source.getAttribute("skinIndex"),
      weights = source.getAttribute("skinWeight"),
      uv = source.getAttribute("uv"),
      ids = source.index.array,
      selected = [];
    function keep(i) {
      const p = new T.Vector3().fromBufferAttribute(pos, i);
      return (
        p.y > (style === "messy" ? HAIR.minY.messy : HAIR.minY.other) &&
        (style !== "crest" || Math.abs(p.x) < HAIR.crestHalfWidth) &&
        (style !== "back-crop" || p.z < HAIR.backCropMaxZ)
      );
    }
    for (let i = 0; i < ids.length; i += CORNERS) {
      if (keep(ids[i]) && keep(ids[i + 1]) && keep(ids[i + LAST_CORNER]))
        selected.push(ids[i], ids[i + 1], ids[i + LAST_CORNER]);
      if ((i & YIELD_MASK_TRIANGLES) === 0 && performance.now() - since >= SLICE_MS) {
        yield "face-hair-select";
        since = performance.now();
      }
    }
    if (!selected.length) throw Error("Empty authored hair ingredient: " + style);
    // Weld coincident crown seam copies before generating smooth normals/walls.
    // Include joint/weight data in the key so independent skin boundaries stay apart.
    const used = [],
      keys = new Map(),
      map = new Map();
    for (const id of new Set(selected)) {
      const p = new T.Vector3().fromBufferAttribute(pos, id),
        key = [
          ...p.toArray(),
          ...Array.from({ length: INFLUENCES }, (_, k) => joints.array[id * INFLUENCES + k]),
          ...Array.from({ length: INFLUENCES }, (_, k) => weights.getComponent(id, k)),
        ]
          .map((v) => Math.round(v * KEY_PRECISION))
          .join("/");
      if (!keys.has(key)) {
        keys.set(key, used.length);
        used.push(id);
      }
      map.set(id, keys.get(key));
      if ((++welded & YIELD_MASK) === 0 && performance.now() - since >= SLICE_MS) {
        yield "face-hair-weld";
        since = performance.now();
      }
    }
    const triangles = selected.map((i) => map.get(i)),
      ps = [],
      js = [],
      ws = [],
      uvs = [],
      count = used.length;
    for (const bottom of [false, true])
      for (const id of used) {
        const p = field(new T.Vector3().fromBufferAttribute(pos, id), h),
          wave = unitSine(p.x * HAIR.wave[0] + p.z * HAIR.wave[1]);
        if (!bottom) {
          const { crest, messy, other } = HAIR,
            look = style === "messy" ? messy : other,
            raise =
              style === "crest"
                ? crest.height *
                  (crest.floor + crest.span * squared(Math.cos(p.z * crest.frequency))) *
                  Math.max(crest.taper, 1 - Math.abs(p.x) / crest.halfWidth)
                : style === "back-crop"
                  ? HAIR.backCropRaise
                  : look.raise + look.waveRaise * wave;
          p.y += raise;
          p.x *= look.scaleX;
          p.z *= look.scaleZ;
        } else {
          p.y -= HAIR.underside.drop;
          p.x *= HAIR.underside.scale;
          p.z *= HAIR.underside.scale;
        }
        ps.push(...p.toArray());
        uvs.push(uv.getX(id), uv.getY(id));
        for (let k = 0; k < INFLUENCES; k++) {
          js.push(joints.array[id * INFLUENCES + k]);
          ws.push(weights.getComponent(id, k));
        }
        if ((++built & YIELD_MASK) === 0 && performance.now() - since >= SLICE_MS) {
          yield "face-hair-build";
          since = performance.now();
        }
      }
    const edges = new Map();
    for (let i = 0; i < triangles.length; i += CORNERS) {
      for (const [a, b] of [
        [triangles[i], triangles[i + 1]],
        [triangles[i + 1], triangles[i + LAST_CORNER]],
        [triangles[i + LAST_CORNER], triangles[i]],
      ]) {
        const key = Math.min(a, b) + "/" + Math.max(a, b),
          old = edges.get(key);
        edges.set(key, old ? { ...old, count: old.count + 1 } : { a, b, count: 1 });
      }
      if ((i & YIELD_MASK_TRIANGLES) === 0 && performance.now() - since >= SLICE_MS) {
        yield "face-hair-edges";
        since = performance.now();
      }
    }
    const indices = [...triangles];
    for (const { a, b, count: n } of edges.values()) {
      if (n === 1) indices.push(a, b, b + count, a, b + count, a + count);
      if ((++indexed & YIELD_MASK) === 0 && performance.now() - since >= SLICE_MS) {
        yield "face-hair-caps";
        since = performance.now();
      }
    }
    if (performance.now() - since >= SLICE_MS) yield "face-hair-attributes";
    g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(ps, XYZ));
    g.setAttribute("uv", new T.Float32BufferAttribute(uvs, UV));
    g.setAttribute("skinIndex", new T.Uint16BufferAttribute(js, INFLUENCES));
    g.setAttribute("skinWeight", new T.Float32BufferAttribute(ws, INFLUENCES));
    g.setIndex(indices);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    completed = true;
    return g;
  } finally {
    if (!completed) g?.dispose();
  }
}

// One kit per loaded repaired Hollow source. Cached geometry belongs to the kit,
// actor materials/bones belong to actors. Dispose actors before disposing the kit.
export function createFaceAppearanceLibrary(source) {
  const sourceHeads = HEAD_NAMES.map((name) => {
    const n = source.getObjectByName(name);
    if (!n?.isSkinnedMesh) throw Error("Hollow head missing: " + name);
    return n;
  });
  const neck = source.getObjectByName(T.PropertyBinding.sanitizeNodeName(NECK_NAME));
  if (!neck?.isSkinnedMesh) throw Error("Repaired Hollow lower neck required");
  const sourceMaterials = new Set();
  source.traverse((n) => {
    if (n.isMesh) for (const m of Array.isArray(n.material) ? n.material : [n.material]) sourceMaterials.add(m);
  });
  const cache = new Map();
  let active = 0,
    disposed = false;
  function* cachedSteps(key, build) {
    if (cache.has(key)) return cache.get(key);
    const geometry = yield* build();
    cache.set(key, geometry);
    return geometry;
  }
  function* applySteps(model, id) {
    if (disposed) throw Error("Face library disposed");
    const recipe = faceRecipeFor(id);
    if (model === source) throw Error("Face recipes require a private actor clone");
    if (id === ORIGINAL_FACE_ID) return { id, extraMaterials: [], dispose() {} };
    const nodes = HEAD_NAMES.map((name) => model.getObjectByName(name)),
      ownNeck = model.getObjectByName(neck.name),
      changes = [],
      materialChanges = [];
    if (nodes.some((n) => !n?.isSkinnedMesh) || !ownNeck?.isSkinnedMesh)
      throw Error("Private repaired Hollow head required");
    const affected = [];
    model.traverse((n) => {
      if (n.isMesh)
        for (const m of Array.isArray(n.material) ? n.material : [n.material])
          if (m.name === "Photo" || SKIN_NAMES.has(m.name)) affected.push(m);
    });
    if (affected.some((m) => sourceMaterials.has(m)))
      throw Error("Clone actor materials before applying a face recipe");
    let hair = null,
      hairMaterial = null,
      completed = false;
    const cleanup = () => {
      hair?.removeFromParent();
      hairMaterial?.dispose();
      for (const c of changes) c.node.geometry = c.geometry;
      for (const c of materialChanges) {
        c.material.color.copy(c.color);
        c.material.vertexColors = c.vertexColors;
        c.material.needsUpdate = true;
      }
    };
    try {
      const head = FACE_HEADS.find((h) => h.id === recipe.headPreset),
        skin = FACE_SKINS.find((s) => s.id === recipe.skinPreset);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i],
          geometry = yield* cachedSteps(`${head.id}/${i}/${i === 0 ? recipe.weatheringPreset : "plain"}`, () =>
            changedGeometrySteps(sourceHeads[i].geometry, head, i === 0 ? recipe.weatheringPreset : null),
          );
        changes.push({ node, geometry: node.geometry });
        node.geometry = geometry;
        yield "face-head";
      }
      for (const m of new Set(affected)) {
        materialChanges.push({ material: m, color: m.color.clone(), vertexColors: m.vertexColors });
        if (m.name === "Photo") {
          m.color.setRGB(...skin.photo, T.LinearSRGBColorSpace);
          m.vertexColors = true;
          m.needsUpdate = true;
        } else {
          const body = m.name === BODY_SKIN;
          m.color.setRGB(
            ...CHEEK.map((v, k) => (v * skin.photo[k]) / (body ? HAIR.bodySkinDivisor : 1)),
            T.LinearSRGBColorSpace,
          );
        }
        yield "face-material";
      }
      if (recipe.hairPreset !== "buzz") {
        const geometry = yield* cachedSteps(`${head.id}/hair/${recipe.hairPreset}`, () =>
          hairGeometrySteps(sourceHeads[0].geometry, head, recipe.hairPreset),
        );
        hairMaterial = new T.MeshStandardMaterial({
          name: HAIR_MATERIAL,
          color: HAIR.material.color,
          map: nodes[0].material.map,
          roughness: HAIR.material.roughness,
          metalness: 0,
          side: T.DoubleSide,
        });
        const photo = nodes[0];
        hair = new T.SkinnedMesh(geometry, hairMaterial);
        hair.name = HAIR_NAME;
        hair.position.copy(photo.position);
        hair.quaternion.copy(photo.quaternion);
        hair.scale.copy(photo.scale);
        hair.frustumCulled = false;
        hair.bindMode = photo.bindMode;
        hair.bind(photo.skeleton, photo.bindMatrix.clone());
        photo.parent.add(hair);
      }
      active++;
      completed = true;
      let removed = false;
      return {
        id,
        extraMaterials: hairMaterial ? [hairMaterial] : [],
        dispose() {
          if (removed) return;
          removed = true;
          active--;
          cleanup();
        },
      };
    } finally {
      if (!completed) cleanup();
    }
  }
  return {
    apply(model, id) {
      const steps = applySteps(model, id);
      for (;;) {
        const step = steps.next();
        if (step.done) return step.value;
      }
    },
    applySteps,
    stats() {
      return {
        activeActors: active,
        cachedGeometries: cache.size,
        geometryBytes: [...cache.values()].reduce(
          (sum, g) =>
            sum +
            Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) +
            (g.index?.array.byteLength ?? 0),
          0,
        ),
      };
    },
    dispose() {
      if (disposed) return;
      if (active) throw Error("Dispose actor appearances before face library");
      disposed = true;
      for (const g of cache.values()) g.dispose();
      cache.clear();
    },
  };
}
