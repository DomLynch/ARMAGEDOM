import { GAME_DATA } from "./game-data.js";

// The ground geometry of an attack telegraph (data/telegraph.json), as plain arrays so it needs no renderer and tests can check it. A
// shape is drawn in the attack's own frame: the origin is where the attack starts (the enemy's feet, or the centre of a circle) and
// +z is the way it points; x is to the side. Three kinds: "circle" (reach = radius), "cone" (reach = radius, arc = full angle in
// degrees; the apex is the origin) and "line" (reach = length, width = full width; one end is the origin). The outline is a closed
// polygon with the origin as its star centre, so the fill is a fan from the origin and can grow from the origin by scaling.
const TELEGRAPH = GAME_DATA.telegraph;
const HALF = 0.5;
const EPS = 1e-9;
const TURN = Math.PI * 2; // tuning-ok: radians in a full turn
const DEGREES = Math.PI / 180; // tuning-ok: degrees to radians

// The most outline points any shape needs: a cone is the apex plus (arc segments + 1) points, never more than turnSegments + 2.
export const pointCapacity = (rules = TELEGRAPH) => rules.turnSegments + 2; // tuning-ok: the cone apex and its closing arc point

// The shape kind for an arc: a full turn or more is a circle, anything narrower a cone.
export const arcKind = (arc, rules = TELEGRAPH) => (arc >= rules.fullArcDegrees ? "circle" : "cone");

// Writes the outline polygon into `out` (x, z pairs) and returns its point count. `out` holds at least 2 * pointCapacity() numbers.
export function shapePoints(kind, reach, arc, width, out, rules = TELEGRAPH) {
  if (kind === "line") {
    const half = width * HALF;
    out.set([-half, 0, -half, reach, half, reach, half, 0]);
    return 4; // tuning-ok: the four corners of a rectangle
  }
  if (kind === "circle") {
    for (let i = 0; i < rules.turnSegments; i++) {
      const a = (TURN * i) / rules.turnSegments;
      out[2 * i] = Math.sin(a) * reach;
      out[2 * i + 1] = Math.cos(a) * reach;
    }
    return rules.turnSegments;
  }
  const segments = Math.max(rules.minArcSegments, Math.ceil((rules.turnSegments * arc) / rules.fullArcDegrees)),
    half = arc * HALF * DEGREES;
  out[0] = 0;
  out[1] = 0;
  for (let i = 0; i <= segments; i++) {
    const a = -half + (2 * half * i) / segments;
    out[2 * (i + 1)] = Math.sin(a) * reach;
    out[2 * (i + 1) + 1] = Math.cos(a) * reach;
  }
  return segments + 2; // tuning-ok: the apex and the arc's closing point
}

// Twice the signed area of the polygon (positive when it runs anticlockwise in x right, z up).
export function signedArea(points, count) {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    sum += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return sum;
}

// Fan fill from the origin: vertex 0 is the origin, vertex i + 1 is outline point i. Writes x, y, z (y = 0) into `positions`, two uv
// numbers per vertex (one stripe period per `periodMetres`) into `uv`, and three indices per triangle into `index`. Returns the index count.
export function fillBuffers(points, count, periodMetres, positions, uv, index) {
  positions[0] = positions[1] = positions[2] = 0;
  uv[0] = uv[1] = 0;
  for (let i = 0; i < count; i++) {
    positions[3 * (i + 1)] = points[2 * i];
    positions[3 * (i + 1) + 1] = 0;
    positions[3 * (i + 1) + 2] = points[2 * i + 1];
    uv[2 * (i + 1)] = points[2 * i] / periodMetres;
    uv[2 * (i + 1) + 1] = points[2 * i + 1] / periodMetres;
    index[3 * i] = 0;
    index[3 * i + 1] = i + 1;
    index[3 * i + 2] = ((i + 1) % count) + 1;
  }
  return 3 * count; // tuning-ok: three indices per fan triangle
}

// An outline strip along the polygon, from `inside` metres in to `outside` metres out, with mitred corners (the miter is cut at
// `miterLimit` times the width so a thin cone's apex does not spike). Vertices 2i and 2i + 1 are the inner and outer edge at point i.
// Writes x, y, z into `positions` and six indices per outline edge into `index`. Returns the index count.
export function stripBuffers(points, count, inside, outside, miterLimit, positions, index) {
  const sign = signedArea(points, count) >= 0 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const prev = (i + count - 1) % count,
      next = (i + 1) % count;
    let ax = points[2 * i] - points[2 * prev],
      az = points[2 * i + 1] - points[2 * prev + 1],
      bx = points[2 * next] - points[2 * i],
      bz = points[2 * next + 1] - points[2 * i + 1];
    const al = Math.hypot(ax, az),
      bl = Math.hypot(bx, bz);
    ax = al > EPS ? ax / al : 0;
    az = al > EPS ? az / al : 0;
    bx = bl > EPS ? bx / bl : 0;
    bz = bl > EPS ? bz / bl : 0;
    // Outward normals of the two edges meeting here, and their bisector scaled so the strip keeps its width round the corner.
    let nx = sign * (az + bz),
      nz = -sign * (ax + bx);
    const nl = Math.hypot(nx, nz),
      bnx = sign * bz,
      bnz = -sign * bx;
    if (nl > EPS) {
      nx /= nl;
      nz /= nl;
      const along = nx * bnx + nz * bnz,
        scale = along > EPS ? Math.min(miterLimit, 1 / along) : miterLimit;
      nx *= scale;
      nz *= scale;
    } else {
      nx = bnx;
      nz = bnz;
    }
    positions[6 * i] = points[2 * i] - nx * inside;
    positions[6 * i + 1] = 0;
    positions[6 * i + 2] = points[2 * i + 1] - nz * inside;
    positions[6 * i + 3] = points[2 * i] + nx * outside;
    positions[6 * i + 4] = 0;
    positions[6 * i + 5] = points[2 * i + 1] + nz * outside;
    const j = (i + 1) % count;
    index.set([2 * i, 2 * i + 1, 2 * j + 1, 2 * i, 2 * j + 1, 2 * j], 6 * i);
  }
  return 6 * count; // tuning-ok: two triangles of three indices per outline edge
}
