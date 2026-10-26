import * as T from "three";
import { GAME_DATA } from "./engine/game-data.js";
// The contour stroke width, colour and render-order lift are appearance.json `pickupGlow`.
const GLOW = GAME_DATA.appearance.pickupGlow;
const KEY_DECIMALS = 6; // tuning-ok: hull welding, positions equal to a millionth of a metre are one point
const XYZ = 3; // tuning-ok: a normal packed as three floats
const CORNERS = 3; // tuning-ok: a triangle has three corners

// Inverse hull of the actual static pickup mesh. No surface/texture mutation.
const hulls = new WeakMap();
const vertexShader = `
  uniform vec2 viewport;
  uniform float stroke;
  void main(){
    vec4 p=vec4(position,1.0);
    vec3 n=normal;
    #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      mat3 im=mat3(instanceMatrix);
      n/=vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2]));
      n=im*n;
    #endif
    vec4 clip=projectionMatrix*modelViewMatrix*p;
    vec2 direction=(projectionMatrix*vec4(normalize(normalMatrix*n),0.0)).xy;
    direction/=max(length(direction),0.00001);
    clip.xy+=direction*(2.0*stroke/viewport)*clip.w;
    gl_Position=clip;
  }`;
const fragmentShader = `
  uniform vec3 color;
  void main(){
    gl_FragColor=vec4(color,1.0);
    #include <colorspace_fragment>
  }`;

function acquireHull(source) {
  let entry = hulls.get(source);
  if (entry) {
    entry.users++;
    return entry;
  }
  const p = source.attributes.position,
    normal = new Float32Array(p.count * XYZ),
    sum = new Map();
  const vector = new T.Vector3(),
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    edge = new T.Vector3();
  const at6 = (v) => v.toFixed(KEY_DECIMALS),
    key = (i) => `${at6(p.getX(i))},${at6(p.getY(i))},${at6(p.getZ(i))}`;
  // Merge only outline normals at coincident positions, leaving hard-surface
  // original normals/UV seams untouched. Area-weighted triangle normals.
  const index = source.index,
    at = (i) => (index ? index.getX(i) : i);
  for (let f = 0; f < (index?.count ?? p.count); f += CORNERS) {
    const ids = Array.from({ length: CORNERS }, (_, k) => at(f + k));
    a.fromBufferAttribute(p, ids[0]);
    b.fromBufferAttribute(p, ids[1]);
    c.fromBufferAttribute(p, ids[2]);
    vector.subVectors(b, a).cross(edge.subVectors(c, a));
    for (const i of ids) {
      const k = key(i);
      if (!sum.has(k)) sum.set(k, new T.Vector3());
      sum.get(k).add(vector);
    }
  }
  for (let i = 0; i < p.count; i++) {
    vector.copy(sum.get(key(i))).normalize();
    normal.set(vector.toArray(), i * XYZ);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", p.clone());
  geometry.setAttribute("normal", new T.BufferAttribute(normal, XYZ));
  if (index) geometry.setIndex(index.clone());
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  entry = { geometry, users: 1 };
  hulls.set(source, entry);
  return entry;
}

// Preserve the existing addPickupGlow(mesh) / {halo,dispose} public API.
export function addPickupGlow(mesh) {
  const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  if (!mesh?.isMesh || mesh.isSkinnedMesh || materials.some((m) => !m?.isMeshStandardMaterial))
    throw new TypeError("Pickup contour requires an unskinned Standard-material mesh");
  const source = mesh.geometry,
    entry = acquireHull(source),
    viewport = new T.Vector4();
  const material = new T.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      viewport: { value: new T.Vector2(1, 1) },
      stroke: { value: GLOW.stroke },
      color: { value: new T.Color(GLOW.color) },
    },
    side: T.BackSide,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const halo = mesh.isInstancedMesh
    ? new T.InstancedMesh(entry.geometry, material, mesh.instanceMatrix.count)
    : new T.Mesh(entry.geometry, material);
  let version = -1,
    disposed = false;
  function sync() {
    if (mesh.isInstancedMesh) {
      halo.count = mesh.count;
      if (version !== mesh.instanceMatrix.version) {
        halo.instanceMatrix.copy(mesh.instanceMatrix);
        halo.instanceMatrix.needsUpdate = true;
        version = mesh.instanceMatrix.version;
      }
    }
  }
  sync();
  halo.name = "Ground pickup thin contour"; // text-ok: a scene-graph label for debugging, never shown to the player
  halo.frustumCulled = false;
  halo.renderOrder = mesh.renderOrder + GLOW.orderOffset;
  halo.onBeforeRender = (renderer) => {
    sync();
    renderer.getCurrentViewport(viewport);
    material.uniforms.viewport.value.set(Math.max(1, viewport.z), Math.max(1, viewport.w));
    material.uniforms.stroke.value = GLOW.stroke * renderer.getPixelRatio() * (halo.userData.strokeScale ?? 1);
  };
  mesh.add(halo);
  return {
    halo,
    dispose() {
      if (disposed) return;
      disposed = true;
      halo.onBeforeRender = () => {};
      halo.removeFromParent();
      if (halo.isInstancedMesh) halo.dispose();
      material.dispose();
      if (--entry.users === 0) {
        entry.geometry.dispose();
        hulls.delete(source);
      }
    },
  };
}
