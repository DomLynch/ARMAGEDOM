import * as T from 'three';

// Ground items only. Private materials retain surface detail and ordinary depth;
// geometry, instance matrices, textures and the caller's materials stay borrowed.
export function addPickupGlow(mesh) {
  const original = mesh.material;
  const sources = Array.isArray(original) ? original : [original];
  if (!mesh.isMesh || mesh.isSkinnedMesh || sources.some(m => !m?.isMeshStandardMaterial)) {
    throw new TypeError('Pickup glow requires an unskinned Standard-material mesh');
  }
  const materials = sources.map(source => {
    const material = source.clone();
    material.color.multiplyScalar(.4);
    material.emissive.setRGB(.65, .2, .05);
    material.emissiveIntensity = 1.0;
    material.toneMapped = false;
    material.depthTest = true;
    material.depthWrite = true;
    return material;
  });
  const highlighted = Array.isArray(original) ? materials : materials[0];
  mesh.material = highlighted;
  let disposed = false;
  return { dispose() {
    if (disposed) return;
    disposed = true;
    if (mesh.material === highlighted) mesh.material = original;
    materials.forEach(material => material.dispose());
  } };
}
