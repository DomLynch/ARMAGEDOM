// Recompute a cloned GLB geometry's vertex normals. The shipped GLBs quantise normals (KHR_mesh_quantization: int8, interleaved), and
// BufferGeometry.computeVertexNormals accumulates face normals into the existing attribute: in an int8 attribute every sum clamps or wraps,
// and the result is a mesh whose normals are all zero, which lights as pure black. Swap in a float attribute first.
export function recomputeNormals(THREE, geometry) {
  const normals = geometry.getAttribute("normal");
  if (normals && !(normals.array instanceof Float32Array && !normals.isInterleavedBufferAttribute))
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(normals.count * normals.itemSize), normals.itemSize));
  geometry.computeVertexNormals();
}
