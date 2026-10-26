import { closed } from "./content-schema.js";
// Validator for visual.json `routeGuidance` (the road-guidance presentation read by engine/route-guidance.js). It lives apart from
// game-data.js to keep that file under the source size guard. Metres unless a name says otherwise; colours are 6-digit hex strings.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: routeGuidance.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail(`${field} must be 6 lowercase hex digits`);
};
const ensureNumbers = (field, v, length) => {
  if (!Array.isArray(v) || v.length !== length) fail(`${field} must hold ${length} numbers`);
  v.forEach((n, i) => number(`${field}[${i}]`, n, 0.001));
};
export function validateRouteGuidance(r) {
  closed(r, ["clearance", "sampleStep", "boundaryReach", "exitReach", "boundaryStartReach", "rail", "arrow", "marker"]);
  for (const f of ["clearance", "sampleStep", "boundaryReach", "exitReach", "boundaryStartReach"]) number(f, r[f], 0.001);
  const { rail, arrow, marker: m } = r;
  closed(rail, ["sideProbe", "sideOffset", "segments", "centreHeight", "thickness", "depth", "colours", "post"]);
  for (const f of ["sideProbe", "sideOffset", "centreHeight", "thickness", "depth"]) number(`rail.${f}`, rail[f], 0.001);
  if (!Number.isSafeInteger(rail.segments) || rail.segments < 1 || rail.segments > 64) fail("rail.segments must be an integer from 1 to 64");
  if (!Array.isArray(rail.colours) || rail.colours.length !== 2) fail("rail.colours must hold two colours");
  rail.colours.forEach((c, i) => hex(`rail.colours[${i}]`, c));
  closed(rail.post, ["centreHeight", "height", "width", "colour"]);
  for (const f of ["centreHeight", "height", "width"]) number(`rail.post.${f}`, rail.post[f], 0.001);
  hex("rail.post.colour", rail.post.colour);
  closed(arrow, ["height", "triangles"]);
  number("arrow.height", arrow.height, 0);
  if (!Array.isArray(arrow.triangles) || arrow.triangles.length < 1 || arrow.triangles.length > 8) fail("arrow.triangles must list 1 to 8 triangles");
  for (const tri of arrow.triangles)
    if (!Array.isArray(tri) || tri.length !== 3 || !tri.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)))
      fail("arrow.triangles must be triangles of three [x, y, z] points");
  closed(m, ["height", "showDistance", "exitHintRemaining", "ring", "sign"]);
  for (const f of ["height", "showDistance", "exitHintRemaining"]) number(`marker.${f}`, m[f], 0);
  closed(m.ring, ["inner", "outer", "segments", "colour"]);
  number("marker.ring.inner", m.ring.inner, 0.001);
  if (!(m.ring.outer > m.ring.inner)) fail("marker.ring.outer must exceed inner");
  if (!Number.isSafeInteger(m.ring.segments) || m.ring.segments < 3 || m.ring.segments > 128) fail("marker.ring.segments must be an integer from 3 to 128");
  hex("marker.ring.colour", m.ring.colour);
  const s = m.sign;
  closed(s, ["canvas", "borderWidth", "border", "textX", "lineY", "fonts", "size", "height"]);
  ensureNumbers("marker.sign.canvas", s.canvas, 2);
  ensureNumbers("marker.sign.border", s.border, 4);
  ensureNumbers("marker.sign.lineY", s.lineY, 2);
  ensureNumbers("marker.sign.size", s.size, 2);
  for (const f of ["borderWidth", "textX", "height"]) number(`marker.sign.${f}`, s[f], 0.001);
  if (!Array.isArray(s.fonts) || s.fonts.length !== 2 || !s.fonts.every((f) => typeof f === "string" && /^(bold )?\d+px [a-z-]+$/.test(f)))
    fail("marker.sign.fonts must hold two CSS font strings");
}
