// Portable Art prototype. Web supplies a verified POSED render-world surface hit.
// This adds a shallow surface wound, never a hole or cut in the source mesh.
export function createLocalWound({ THREE: T, parent, profile }) {
  if (!T || !parent?.isObject3D || !profile?.styles) throw new TypeError("Wound dependencies missing");
  const shape = profile.mesh,
    positions = [0, 0, shape.centerRelief],
    colors = [],
    indices = [],
    segments = shape.segments;
  const ringColors = shape.ringColors;
  const color = new T.Color();
  const rgb = (hex) => {
    color.setHex(hex);
    colors.push(color.r, color.g, color.b);
  };
  rgb(ringColors[0]);
  for (let ring = 0; ring < 3; ring++)
    for (let i = 0; i < segments; i++) {
      const theta = (2 * Math.PI * i) / segments,
        r =
          shape.ringRadius[ring] *
          (1 +
            shape.wobbleA * Math.sin(i * shape.wobbleAFrequency) +
            shape.wobbleB * Math.cos(i * shape.wobbleBFrequency));
      positions.push(Math.cos(theta) * r, Math.sin(theta) * r, shape.ringRelief[ring]);
      rgb(ringColors[ring + 1]);
    }
  const back = positions.length / 3;
  positions.push(0, 0, -shape.backRelief);
  rgb(ringColors[0]);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + i, 1 + next);
    for (let ring = 0; ring < 2; ring++) {
      const a = 1 + ring * segments + i,
        b = 1 + ring * segments + next,
        c = a + segments,
        d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
    indices.push(back, 1 + 2 * segments + next, 1 + 2 * segments + i);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    depthTest: true,
    depthWrite: true,
    side: T.FrontSide,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = "Actor-owned localized surface wound";
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  parent.add(mesh);
  const normal = new T.Vector3(),
    tangent = new T.Vector3(),
    vertical = new T.Vector3(),
    position = new T.Vector3(),
    scale = new T.Vector3(),
    q = new T.Quaternion(),
    basis = new T.Matrix4(),
    world = new T.Matrix4(),
    inverse = new T.Matrix4();
  let disposed = false,
    active = false,
    victim = null,
    style = null;
  const finite = (v) => v && ["x", "y", "z"].every((k) => Number.isFinite(v[k]));
  function place(anchor) {
    mesh.visible = false;
    if (
      disposed ||
      !active ||
      anchor?.surfaceValidated !== true ||
      anchor.visible === false ||
      !finite(anchor.position) ||
      !finite(anchor.normal) ||
      !finite(anchor.tangent) ||
      !Number.isFinite(anchor.surfaceRadius) ||
      anchor.surfaceRadius <= shape.minSurfaceRadius
    )
      return false;
    normal.copy(anchor.normal);
    if (normal.lengthSq() < 1e-10) return false;
    normal.normalize();
    tangent.copy(anchor.tangent).addScaledVector(normal, -tangent.dot(normal));
    if (tangent.lengthSq() < 1e-10) return false;
    tangent.normalize();
    vertical.crossVectors(normal, tangent).normalize();
    // Validate the resolved surface, not an invented human bone or body-centre.
    const surfaceDiameter = anchor.surfaceRadius * 2,
      limit = surfaceDiameter * profile.maxZoneFraction;
    const width = Math.min(style.width, limit),
      height = Math.min(style.height, limit);
    if (!(width > shape.minSize && height > shape.minSize && Number.isFinite(width) && Number.isFinite(height)))
      return false;
    basis.makeBasis(tangent, vertical, normal);
    q.setFromRotationMatrix(basis);
    position.copy(anchor.position).addScaledVector(normal, profile.surfaceOffset);
    scale.set(width / 2, height / 2, style.reliefScale ?? 1);
    world.compose(position, q, scale);
    parent.updateWorldMatrix(true, false);
    if (Math.abs(parent.matrixWorld.determinant()) < 1e-10) return false;
    inverse.copy(parent.matrixWorld).invert();
    mesh.matrix.multiplyMatrices(inverse, world);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.visible = true;
    return true;
  }
  return {
    start({ victimId, styleId, anchor }) {
      if (
        disposed ||
        active ||
        !((typeof victimId === "string" && victimId.trim()) || (Number.isSafeInteger(victimId) && victimId > 0))
      )
        return false;
      const row = profile.styles[styleId];
      if (!row || ![row.width, row.height].every((n) => Number.isFinite(n) && n > 0)) return false;
      victim = victimId;
      style = row;
      active = true;
      if (!place(anchor)) {
        active = false;
        victim = null;
        style = null;
        return false;
      }
      const palette = row.palette ?? ringColors,
        attribute = geometry.getAttribute("color");
      for (let i = 0; i < attribute.count; i++) {
        color.setHex(palette[i === 0 || i === back ? 0 : Math.floor((i - 1) / segments) + 1]);
        attribute.setXYZ(i, color.r, color.g, color.b);
      }
      attribute.needsUpdate = true;
      material.color.setHex(row.tint ?? 0xffffff); // tuning-ok: white is the identity tint
      return true;
    },
    update(anchor) {
      return place(anchor);
    },
    reset() {
      active = false;
      victim = null;
      style = null;
      mesh.visible = false;
    },
    stats() {
      return {
        active,
        visible: mesh.visible,
        victimId: victim,
        triangles: indices.length / 3,
        vertices: positions.length / 3,
        drawCalls: mesh.visible ? 1 : 0,
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
