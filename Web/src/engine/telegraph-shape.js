import { GAME_DATA } from "./game-data.js";

// The ground geometry of an attack telegraph (data/telegraph.json), as plain arrays so tests can check it. A shape is drawn in the
// attack's own frame: the origin is where the attack starts (the enemy's feet, or the centre of a circle) and +z is the way it points;
// x is to the side. Three kinds: "circle" (reach = radius), "cone" (reach = radius, arc = full angle in degrees; the apex is the
// origin) and "line" (reach = length, width = full width; one end is the origin). The outline is a closed polygon held as two arrays
// of coordinates (px, pz) with the origin as its star centre, so the fill is a fan from the origin and grows from it by scaling.
// The writers take three.js BufferAttributes (setXYZ, setXY, setX) so no stride arithmetic is done here.
const TELEGRAPH = GAME_DATA.telegraph;
const EPS = 1e-9;
const DEGREES = Math.PI / 180;
const TURN = 360 * DEGREES;

// The most outline points any shape needs: a cone is the apex plus (arc segments + 1) points, never more than turnSegments + 2.
export const pointCapacity = (rules = TELEGRAPH) => rules.turnSegments + 1 + 1;

// The shape kind for an arc: a full turn or more is a circle, anything narrower a cone.
export const arcKind = (arc, rules = TELEGRAPH) => (arc >= rules.fullArcDegrees ? "circle" : "cone");

// Writes the outline polygon into px / pz (each at least pointCapacity() long) and returns its point count.
export function shapePoints(kind, reach, arc, width, px, pz, rules = TELEGRAPH) {
  if (kind === "line") {
    const side = width * rules.half,
      corners = [
        [-side, 0],
        [-side, reach],
        [side, reach],
        [side, 0],
      ];
    corners.forEach(([x, z], i) => {
      px[i] = x;
      pz[i] = z;
    });
    return corners.length;
  }
  if (kind === "circle") {
    for (let i = 0; i < rules.turnSegments; i++) {
      const a = (TURN * i) / rules.turnSegments;
      px[i] = Math.sin(a) * reach;
      pz[i] = Math.cos(a) * reach;
    }
    return rules.turnSegments;
  }
  const segments = Math.max(rules.minArcSegments, Math.ceil((rules.turnSegments * arc) / rules.fullArcDegrees));
  px[0] = 0;
  pz[0] = 0;
  for (let i = 0; i <= segments; i++) {
    const a = arc * DEGREES * (i / segments - rules.half);
    px[i + 1] = Math.sin(a) * reach;
    pz[i + 1] = Math.cos(a) * reach;
  }
  return segments + 1 + 1;
}

// Twice the signed area of the polygon (positive when it runs anticlockwise in x right, z up).
export function signedArea(px, pz, count) {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    sum += px[i] * pz[j] - px[j] * pz[i];
  }
  return sum;
}

// Fan fill from the origin: vertex 0 is the origin, vertex i + 1 is outline point i. Writes positions (y = 0), uv (one stripe period per
// `periodMetres`) and the triangle indices. Returns the index count.
export function fillBuffers(px, pz, count, periodMetres, position, uv, index) {
  position.setXYZ(0, 0, 0, 0);
  uv.setXY(0, 0, 0);
  let k = 0;
  for (let i = 0; i < count; i++) {
    position.setXYZ(i + 1, px[i], 0, pz[i]);
    uv.setXY(i + 1, px[i] / periodMetres, pz[i] / periodMetres);
    index.setX(k++, 0);
    index.setX(k++, i + 1);
    index.setX(k++, ((i + 1) % count) + 1);
  }
  return k;
}

// An outline strip along the polygon, from `inside` metres in to `outside` metres out, with mitred corners (the miter is cut at
// `miterLimit` times the width so a thin cone's apex does not spike). Vertices 0 to count - 1 are the inner edge, count to
// count * 2 - 1 the outer edge. Writes positions and two triangles per outline edge. Returns the index count.
export function stripBuffers(px, pz, count, inside, outside, miterLimit, position, index) {
  const sign = signedArea(px, pz, count) >= 0 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const prev = (i + count - 1) % count,
      next = (i + 1) % count;
    let ax = px[i] - px[prev],
      az = pz[i] - pz[prev],
      bx = px[next] - px[i],
      bz = pz[next] - pz[i];
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
    position.setXYZ(i, px[i] - nx * inside, 0, pz[i] - nz * inside);
    position.setXYZ(count + i, px[i] + nx * outside, 0, pz[i] + nz * outside);
  }
  let k = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    for (const v of [i, count + i, count + j, i, count + j, j]) index.setX(k++, v);
  }
  return k;
}
